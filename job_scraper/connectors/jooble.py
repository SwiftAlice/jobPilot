"""
Jooble connector (async HTTP API).
"""
import os
import httpx
from typing import List, Optional
from datetime import datetime
from connectors.base import JobConnector, RawJob, SearchQuery


class JoobleConnector(JobConnector):
    """Jooble job search API connector."""
    
    @property
    def name(self) -> str:
        return "jooble"
    
    @property
    def display_name(self) -> str:
        return "Jooble"
    
    def __init__(self):
        self.api_key = os.getenv("JOOBLE_API_KEY", "")
        self.base_url = f"https://jooble.org/api/{self.api_key}"
    
    async def fetch(self, query: SearchQuery, since: Optional[datetime] = None) -> List[RawJob]:
        """Fetch jobs from Jooble API."""
        if not self.api_key:
            print("[Jooble] Missing API key")
            return []
        
        # Build OR-joined phrase query: search each keyword phrase separately
        kws = [str(k).strip() for k in (query.keywords or []) if str(k).strip()]
        phrases = []
        for k in kws[:5]:  # Limit to first 5 keywords
            phrases.append(k)
        
        # Normalize location: use city-only (before comma) for Jooble's location filter
        raw_loc = str(query.location).strip() if query.location else ""
        is_remote = query.remote_type == "remote" or any("remote" in k.lower() for k in query.keywords)
        location = ""
        if not is_remote and raw_loc:
            # Extract city only (before comma) for better API matching
            city_only = raw_loc.split(",")[0].strip()
            location = city_only
        
        jobs: List[RawJob] = []
        
        # Fetch jobs for each phrase separately (OR condition across profiles)
        for phrase_idx, phrase in enumerate(phrases, 1):
            if len(jobs) >= query.max_results:
                break
            
            try:
                print(f"[Jooble] Fetch phrase {phrase_idx}/{len(phrases)}: keywords='{phrase}' loc='{location}' remote={is_remote} max_results={query.max_results}")
            except Exception:
                pass
            
            # Try with location first
        payload = {
                "keywords": phrase,
            "location": location,
            "page": 1,
            "searchMode": 1,
        }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(self.base_url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                    
                    first_page_count = len(data.get("jobs", []))
                    if phrase_idx == 1:
                        print(f"[Jooble] First page results count for phrase '{phrase}' (with location): {first_page_count}")
                    
                    # If no results with location and location was specified, try without location
                    if first_page_count == 0 and location and not is_remote:
                        print(f"[Jooble] No results with location '{location}', trying without location...")
                        payload_no_loc = {
                            "keywords": phrase,
                            "location": "",
                            "page": 1,
                            "searchMode": 1,
                        }
                        resp_no_loc = await client.post(self.base_url, json=payload_no_loc)
                        resp_no_loc.raise_for_status()
                        data = resp_no_loc.json()
                        first_page_count = len(data.get("jobs", []))
                        if phrase_idx == 1:
                            print(f"[Jooble] First page results count for phrase '{phrase}' (without location): {first_page_count}")
                    
                    for job_data in data.get("jobs", []):
                        if len(jobs) >= query.max_results:
                            break
                    raw = self._parse_job(job_data)
                    if raw and (not since or (raw.posted_at and raw.posted_at >= since)):
                            # Check for duplicates by URL
                            if not any(j.url == raw.url for j in jobs):
                        jobs.append(raw)
        except Exception as e:
                print(f"[Jooble] Error phrase {phrase_idx} ('{phrase}'): {e}")
                continue
        
        return jobs[:query.max_results]
    
    def _parse_job(self, data: dict) -> Optional[RawJob]:
        """Parse Jooble API response to RawJob."""
        try:
            from dateutil import parser as date_parser
            posted_at = None
            if data.get("updated"):
                try:
                    posted_at = date_parser.parse(data["updated"])
                except:
                    pass
            return RawJob(
                source=self.name,
                external_id=str(data.get("id", "")),
                title=data.get("title", ""),
                company=data.get("company", ""),
                location=data.get("location", ""),
                description=data.get("snippet", "") or data.get("description", ""),
                url=data.get("link", ""),
                posted_at=posted_at,
                raw_data=data,
            )
        except Exception as e:
            print(f"[Jooble] Parse error: {e}")
            return None

