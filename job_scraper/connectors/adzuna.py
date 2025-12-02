"""
Adzuna connector (async HTTP API).
"""
import os
import httpx
from typing import List, Optional
from datetime import datetime
from connectors.base import JobConnector, RawJob, SearchQuery


class AdzunaConnector(JobConnector):
    """Adzuna job aggregator API connector."""
    
    @property
    def name(self) -> str:
        return "adzuna"
    
    @property
    def display_name(self) -> str:
        return "Adzuna"
    
    def __init__(self):
        self.base_url = "https://api.adzuna.com/v1/api/jobs"
        self.app_id = os.getenv("ADZUNA_APP_ID", "")
        self.app_key = os.getenv("ADZUNA_APP_KEY", "")
    
    async def fetch(self, query: SearchQuery, since: Optional[datetime] = None) -> List[RawJob]:
        """Fetch jobs from Adzuna API."""
        if not self.app_id or not self.app_key:
            print("[Adzuna] Missing credentials")
            return []

        jobs: List[RawJob] = []

        # Build per-profile phrases; we'll query Adzuna separately for each phrase
        kws = [str(k).strip() for k in (query.keywords or []) if str(k).strip()]
        phrases: List[str] = []
        for k in kws[:5]:  # limit to first 5 profiles
            phrases.append(k)
        # If nothing specific, fall back to simple joined keywords
        if not phrases and kws:
            phrases = [" ".join(kws[:3])]

        country = self._infer_country(query.location)
        is_remote = query.remote_type == "remote" or any("remote" in k.lower() for k in query.keywords)

        async with httpx.AsyncClient(timeout=12.0) as client:
            # Treat each phrase as an OR branch: stop when we have enough jobs
            for phrase_idx, phrase in enumerate(phrases):
                if len(jobs) >= query.max_results:
                    break

                try:
                    print(
                        f"[Adzuna] Fetch phrase {phrase_idx+1}/{len(phrases)}: "
                        f"what='{phrase}' loc='{query.location or ''}' "
                        f"country='{country}' remote={is_remote} max_results={query.max_results}"
                    )
                except Exception:
                    pass

                for page in range(1, 4):
                    if len(jobs) >= query.max_results:
                        break

                    params = {
                        "app_id": self.app_id,
                        "app_key": self.app_key,
                        "what": phrase,
                        "results_per_page": min(query.max_results, 50),
                    }
                    # Location handling
                    if is_remote:
                        params["what_or"] = "remote"
                        params["where"] = ""
                    else:
                        # Use a normalized city-only location for Adzuna's "where" filter when not remote
                        if query.location:
                            # Adzuna behaves better with just the city (e.g. "Bengaluru" instead of "Bengaluru, KA")
                            raw_loc = str(query.location).strip()
                            city_only = raw_loc.split(",")[0].strip()
                            if city_only:
                                params["where"] = city_only

                    url = f"{self.base_url}/{country}/search/{page}"
                    try:
                        resp = await client.get(url, params=params)
                        resp.raise_for_status()
                        data = resp.json()

                        results = data.get("results", [])
                        if phrase_idx == 0 and page == 1:
                            print(f"[Adzuna] First page results count for phrase '{phrase}': {len(results)}")

                        for job_data in results:
                            raw = self._parse_job(job_data)
                            if raw and (not since or (raw.posted_at and raw.posted_at >= since)):
                                jobs.append(raw)
                                if len(jobs) >= query.max_results:
                                    break

                        # Stop paging this phrase if Adzuna has no more results
                        if not results:
                            break
                    except Exception as e:
                        print(f"[Adzuna] Error phrase '{phrase}' page {page}: {e}")
                        continue
        
        return jobs[:query.max_results]
    
    def _infer_country(self, location: str) -> str:
        """Infer country code from location."""
        loc = (location or "").lower()
        if any(city in loc for city in ["mumbai", "delhi", "bangalore", "pune", "chennai", "hyderabad", "kolkata", "gurgaon", "noida", "india"]):
            return "in"
        if any(city in loc for city in ["london", "uk", "united kingdom"]):
            return "gb"
        if any(city in loc for city in ["sydney", "melbourne", "australia"]):
            return "au"
        if any(city in loc for city in ["toronto", "vancouver", "canada"]):
            return "ca"
        return "in"
    
    def _parse_job(self, data: dict) -> Optional[RawJob]:
        """Parse Adzuna API response to RawJob."""
        try:
            from dateutil import parser as date_parser
            posted_at = None
            if data.get("created"):
                try:
                    posted_at = date_parser.parse(data["created"])
                except:
                    pass
            return RawJob(
                source=self.name,
                external_id=str(data.get("id", "")),
                title=data.get("title", ""),
                company=data.get("company", {}).get("display_name", ""),
                location=data.get("location", {}).get("display_name", ""),
                description=data.get("description", ""),
                url=data.get("redirect_url", ""),
                posted_at=posted_at,
                salary_min=data.get("salary_min"),
                salary_max=data.get("salary_max"),
                currency=data.get("salary_currency", "USD"),
                raw_data=data,
            )
        except Exception as e:
            print(f"[Adzuna] Parse error: {e}")
            return None

