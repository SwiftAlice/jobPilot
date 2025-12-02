"""
RemoteOK connector (async HTTP API).
"""
import httpx
import re
from typing import List, Optional
from datetime import datetime
from connectors.base import JobConnector, RawJob, SearchQuery


class RemoteOKConnector(JobConnector):
    """RemoteOK API connector for remote jobs."""
    
    @property
    def name(self) -> str:
        return "remoteok"
    
    @property
    def display_name(self) -> str:
        return "RemoteOK"
    
    def __init__(self):
        # RemoteOK now responds at .com; keep stable .com endpoint
        self.base_url = "https://remoteok.com/api"
    
    async def fetch(self, query: SearchQuery, since: Optional[datetime] = None) -> List[RawJob]:
        """Fetch jobs from RemoteOK API."""
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                print(f"[RemoteOK] GET {self.base_url}")
                resp = await client.get(self.base_url)
                resp.raise_for_status()
                data = resp.json()
                print(f"[RemoteOK] status={resp.status_code} items={len(data)}")

                tokens = self._tokenize_keywords(query.keywords)
                phrases = [p.strip().lower() for p in (query.keywords or []) if isinstance(p, str) and p.strip()]
                print(f"[RemoteOK] filters tokens={tokens} phrases={phrases}")
                jobs: List[RawJob] = []

                rows = [row for row in data[1:] if isinstance(row, dict)]  # skip metadata row
                if not tokens:
                    # No keywords → take top rows
                    for job_data in rows[: query.max_results]:
                        raw = self._parse_job(job_data)
                        if raw and (not since or (raw.posted_at and raw.posted_at >= since)):
                            jobs.append(raw)
                    return jobs

                # With keywords: previous behavior — any-of token OR phrase match; fallback to top rows if none
                for job_data in rows:
                    text = f"{job_data.get('position', '')} {job_data.get('description', '')}".lower()
                    phrase_hit = any(ph in text for ph in phrases if len(ph) > 3)
                    token_hit = any(tok in text for tok in tokens)
                    if phrase_hit or token_hit:
                        raw = self._parse_job(job_data)
                        if raw and (not since or (raw.posted_at and raw.posted_at >= since)):
                            jobs.append(raw)
                            if len(jobs) >= query.max_results:
                                break
                if jobs:
                    return jobs

                # Fallback: return top rows when nothing matched
                for job_data in rows[: query.max_results]:
                    raw = self._parse_job(job_data)
                    if raw and (not since or (raw.posted_at and raw.posted_at >= since)):
                        jobs.append(raw)
                return jobs
        except Exception as e:
            print(f"[RemoteOK] Error: {e}")
            return []
    
    def _tokenize_keywords(self, keywords: List[str]) -> List[str]:
        """Tokenize keywords for filtering."""
        text = " ".join(keywords).lower()
        parts = re.split(r"[^a-z0-9+]+", text)
        return [p for p in parts if p and len(p) >= 2][:8]
    
    def _parse_job(self, data: dict) -> Optional[RawJob]:
        """Parse RemoteOK API response to RawJob."""
        try:
            from dateutil import parser as date_parser
            posted_at = None
            if data.get("epoch"):
                try:
                    from datetime import datetime as dt
                    posted_at = dt.fromtimestamp(data["epoch"])
                except:
                    pass
            # Build URL safely (avoid double prefix if absolute)
            raw_url = data.get('url', '') or ''
            if isinstance(raw_url, str) and raw_url.startswith('http'):
                full_url = raw_url
            else:
                full_url = f"https://remoteok.com{raw_url}"

            return RawJob(
                source=self.name,
                external_id=str(data.get("id", "")),
                title=data.get("position", ""),
                company=data.get("company", ""),
                location="Remote",
                description=data.get("description", ""),
                url=full_url,
                posted_at=posted_at,
                remote_type="remote",
                raw_data=data,
            )
        except Exception as e:
            print(f"[RemoteOK] Parse error: {e}")
            return None

