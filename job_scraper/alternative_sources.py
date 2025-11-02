"""
Alternative job sources using official APIs and aggregators
"""
import requests
import time
from typing import List, Dict, Any
import re
from models import JobPosting, JobSource
from api_keys import ADZUNA_APP_ID, ADZUNA_APP_KEY, JOOBLE_API_KEY
from bs4 import BeautifulSoup

# Helpers
def simplify_keywords(text: str, max_tokens: int = 3) -> str:
    parts = re.split(r"[^a-zA-Z0-9+]+", (text or '').strip())
    tokens = [p for p in parts if p]
    return " ".join(tokens[:max_tokens])

def strip_html(html: str) -> str:
    """Strip HTML tags from text - DEPRECATED: Use clean_html_preserve_structure instead"""
    if not html:
        return ''
    try:
        soup = BeautifulSoup(html, 'html.parser')
        return soup.get_text(separator=' ', strip=True)
    except Exception:
        # Fallback: basic tag removal
        return re.sub(r'<[^>]+>', ' ', html)

def clean_html_preserve_structure(html_elem) -> str:
    """
    Clean HTML element but preserve structure (headings, paragraphs, lists, etc.)
    Removes scripts, styles, but keeps formatting tags.
    Preserves UTF-8 encoding for emojis and special characters.
    """
    if not html_elem:
        return ''
    
    # If it's a string, use it directly
    if isinstance(html_elem, str):
        html_str = html_elem
    # If it's a BeautifulSoup element, get its inner HTML
    elif hasattr(html_elem, 'decode_contents'):
        # BeautifulSoup Tag element - get contents with UTF-8
        html_str = html_elem.decode_contents(formatter='html')
    elif hasattr(html_elem, '__str__'):
        html_str = str(html_elem)
    else:
        html_str = str(html_elem)
    
    # Ensure html_str is a string and handle encoding
    if isinstance(html_str, bytes):
        html_str = html_str.decode('utf-8', errors='ignore')
    
    if not html_str:
        return ''
    
    # Check if it's already HTML (contains tags)
    if not re.search(r'<[a-z][\s\S]*>', html_str, re.IGNORECASE):
        # Not HTML, return as-is (plain text) - already UTF-8 encoded
        return html_str
    
    # Parse to clean it with UTF-8 support
    soup = BeautifulSoup(html_str, 'html.parser', from_encoding='utf-8')
    
    # Remove unsafe/unwanted tags but keep structure
    for tag in soup.find_all(['script', 'style', 'noscript', 'nav', 'header', 'footer', 'form', 'input', 'button']):
        tag.decompose()
    
    # Remove onclick and other event handlers
    for tag in soup.find_all(True):
        # Remove all attributes except href for links
        allowed_attrs = ['href', 'target', 'rel']
        tag.attrs = {k: v for k, v in tag.attrs.items() if k in allowed_attrs}
    
    # Get the cleaned HTML with UTF-8 encoding preserved
    # BeautifulSoup in Python 3 returns Unicode strings by default
    cleaned = str(soup)
    
    # Ensure the result is a properly encoded UTF-8 string
    if isinstance(cleaned, bytes):
        cleaned = cleaned.decode('utf-8', errors='ignore')
    
    # Clean up extra whitespace but preserve structure and special characters
    cleaned = re.sub(r'\s+', ' ', cleaned, flags=re.UNICODE)  # Multiple spaces to single (Unicode-aware)
    cleaned = re.sub(r'>\s+<', '><', cleaned)  # Spaces between tags
    
    return cleaned.strip()

class AdzunaScraper:
    """Adzuna job aggregator API"""
    
    def __init__(self):
        self.base_url = "https://api.adzuna.com/v1/api/jobs"
        self.app_id = ADZUNA_APP_ID
        self.app_key = ADZUNA_APP_KEY
    
    def search_jobs(self, keywords: str, location: str, max_results: int = 20) -> List[JobPosting]:
        """Search jobs using Adzuna API with fallbacks (country/page/keywords)."""
        jobs: List[JobPosting] = []

        # Validate credentials
        if not self.app_id or not self.app_key:
            print("[Adzuna] ERROR: Missing ADZUNA_APP_ID or ADZUNA_APP_KEY")
            return jobs

        # Build candidate queries
        tokens = [t for t in re.split(r"[^a-zA-Z0-9+]+", (keywords or '').strip()) if t]
        simple_what = " ".join(tokens[:3]) if tokens else ''
        main_token = tokens[0] if tokens else ''

        # Detect remote intent from query (when 'remote' appears in keywords due to user selection in where field)
        is_remote_query = 'remote' in (keywords or '').lower() or 'remote' in (location or '').lower()

        # Try multiple countries when remote/empty or weak location
        primary_country = self._infer_country_from_location(location)
        country_candidates = [primary_country]
        if primary_country != 'in':
            country_candidates.append('in')
        if primary_country != 'us':
            country_candidates.append('us')
        if primary_country != 'gb':
            country_candidates.append('gb')

        results_needed = max_results
        for country in country_candidates:
            if len(jobs) >= max_results:
                break
            # Try up to first 3 pages to gather enough results
            for page in range(1, 4):
                if len(jobs) >= max_results:
                    break
                params = {
                    'app_id': self.app_id,
                    'app_key': self.app_key,
                    'what': simple_what or main_token,
                    'results_per_page': min(results_needed, 50),
                }
                # If user selected "Remote" in where, add remote filter to Adzuna query
                if is_remote_query:
                    params['what_or'] = 'remote'
                    params['where'] = ''
                url = f"{self.base_url}/{country}/search/{page}"
                try:
                    print(f"[Adzuna] GET {url} what='{params['what']}'")
                    response = requests.get(url, params=params, timeout=12)
                    response.raise_for_status()
                    data = response.json()
                    results = data.get('results', [])
                    print(f"[Adzuna] status={response.status_code} page={page} country={country} results={len(results)}")
                    for job_data in results:
                        job = self.parse_adzuna_job(job_data)
                        if job:
                            jobs.append(job)
                            if len(jobs) >= max_results:
                                break
                    # If this page had 0 results, break paging loop for this country
                    if not results:
                        break
                    results_needed = max_results - len(jobs)
                except Exception as e:
                    print(f"[Adzuna] error (country={country} page={page}): {e}")
                    # Try next page/country
                    continue

        print(f"[Adzuna] Returning {len(jobs)} jobs (requested {max_results})")
        return jobs

    def _infer_country_from_location(self, location: str) -> str:
        """Best-effort country code for Adzuna endpoint based on location"""
        loc = (location or '').lower()
        india_cities = ['mumbai', 'delhi', 'bengaluru', 'bangalore', 'pune', 'chennai', 'hyderabad', 'kolkata', 'gurgaon', 'noida']
        if 'india' in loc or any(city in loc for city in india_cities):
            return 'in'
        if 'united kingdom' in loc or 'london' in loc or 'uk' in loc:
            return 'gb'
        if 'australia' in loc or 'sydney' in loc or 'melbourne' in loc:
            return 'au'
        if 'canada' in loc or 'toronto' in loc or 'vancouver' in loc:
            return 'ca'
        # Default to India to avoid region-locked postings when location is empty/remote
        return 'in'
    
    def parse_adzuna_job(self, job_data: Dict[str, Any]) -> JobPosting:
        """Parse Adzuna job data"""
        try:
            raw_desc = job_data.get('description', '')
            # Preserve HTML if present, otherwise use as plain text
            description = clean_html_preserve_structure(raw_desc) if raw_desc else ''
            return JobPosting(
                id=f"adzuna_{job_data.get('id', '')}",
                title=job_data.get('title', 'N/A'),
                company=job_data.get('company', {}).get('display_name', 'N/A'),
                location=job_data.get('location', {}).get('display_name', 'N/A'),
                description=description,
                url=job_data.get('redirect_url', ''),
                source=JobSource.ADZUNA,
                skills_required=self.extract_skills_from_text(
                    f"{job_data.get('title', '')} {raw_desc}"
                )
            )
        except Exception as e:
            print(f"Error parsing Adzuna job: {e}")
            return None
    
    def extract_skills_from_text(self, text: str) -> List[str]:
        """Extract skills from job text"""
        # Simple skill extraction - can be enhanced
        skills = []
        text_lower = text.lower()
        
        skill_keywords = ['python', 'javascript', 'java', 'react', 'angular', 'vue', 'node', 'django', 'flask', 'spring', 'aws', 'azure', 'docker', 'kubernetes']
        
        for skill in skill_keywords:
            if skill in text_lower:
                skills.append(skill)
        
        return skills

class JoobleScraper:
    """Jooble job search API"""
    
    def __init__(self):
        self.base_url = "https://jooble.org/api"
        self.api_key = JOOBLE_API_KEY
    
    def search_jobs(self, keywords: str, location: str, max_results: int = 20) -> List[JobPosting]:
        """Search jobs using Jooble API (official POST format)"""
        jobs: List[JobPosting] = []
        simple_what = simplify_keywords(keywords, max_tokens=3)
        
        # If "remote" is in keywords, use empty location (Jooble will search globally)
        # Jooble API doesn't have explicit remote filter, so we rely on keywords containing "remote"
        payload_location = '' if 'remote' in keywords.lower() or not location else location
        
        payload = {
            'keywords': simple_what,
            'location': payload_location,
            'page': 1,
            'searchMode': 1
        }
        try:
            url = f"https://jooble.org/api/{self.api_key}"
            print(f"[Jooble] POST {url} keywords='{simple_what}'")
            response = requests.post(url, json=payload, timeout=10)
            response.raise_for_status()
            data = response.json()
            print(f"[Jooble] status={response.status_code} bytes={len(response.text)} jobs={len(data.get('jobs', []))}")
            for job_data in data.get('jobs', [])[:max_results]:
                job = self.parse_jooble_job(job_data)
                if job:
                    jobs.append(job)
        except Exception as e:
            print(f"[Jooble] error: {e}")
        return jobs
    
    def parse_jooble_job(self, job_data: Dict[str, Any]) -> JobPosting:
        """Parse Jooble job data"""
        try:
            raw_desc = job_data.get('description', '')
            # Preserve HTML if present, otherwise use as plain text
            description = clean_html_preserve_structure(raw_desc) if raw_desc else ''
            return JobPosting(
                id=f"jooble_{job_data.get('id', '')}",
                title=job_data.get('title', 'N/A'),
                company=job_data.get('company', 'N/A'),
                location=job_data.get('location', 'N/A'),
                description=description,
                url=job_data.get('link', ''),
                source=JobSource.JOOBLE,
                skills_required=self.extract_skills_from_text(
                    f"{job_data.get('title', '')} {raw_desc}"
                )
            )
        except Exception as e:
            print(f"Error parsing Jooble job: {e}")
            return None
    
    def extract_skills_from_text(self, text: str) -> List[str]:
        """Extract skills from job text"""
        skills = []
        text_lower = text.lower()
        
        skill_keywords = ['python', 'javascript', 'java', 'react', 'angular', 'vue', 'node', 'django', 'flask', 'spring', 'aws', 'azure', 'docker', 'kubernetes']
        
        for skill in skill_keywords:
            if skill in text_lower:
                skills.append(skill)
        
        return skills

class GitHubJobsScraper:
    """GitHub Jobs API (deprecated but still works for some data)"""
    
    def __init__(self):
        self.base_url = "https://jobs.github.com/positions.json"
    
    def search_jobs(self, keywords: str, location: str, max_results: int = 20) -> List[JobPosting]:
        """Search jobs using GitHub Jobs API"""
        jobs = []
        
        params = {
            'description': keywords,
            'location': location,
            'page': 0
        }
        
        try:
            response = requests.get(self.base_url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            for job_data in data[:max_results]:
                job = self.parse_github_job(job_data)
                if job:
                    jobs.append(job)
                    
        except Exception as e:
            print(f"GitHub Jobs API error: {e}")
        
        return jobs
    
    def parse_github_job(self, job_data: Dict[str, Any]) -> JobPosting:
        """Parse GitHub Jobs data"""
        try:
            raw_desc = job_data.get('description', '')
            # Preserve HTML if present, otherwise use as plain text
            description = clean_html_preserve_structure(raw_desc) if raw_desc else ''
            return JobPosting(
                id=f"github_{job_data.get('id', '')}",
                title=job_data.get('title', 'N/A'),
                company=job_data.get('company', 'N/A'),
                location=job_data.get('location', 'N/A'),
                description=description,
                url=job_data.get('url', ''),
                source=JobSource.GITHUB,
                skills_required=self.extract_skills_from_text(
                    f"{job_data.get('title', '')} {raw_desc}"
                )
            )
        except Exception as e:
            print(f"Error parsing GitHub job: {e}")
            return None
    
    def extract_skills_from_text(self, text: str) -> List[str]:
        """Extract skills from job text"""
        skills = []
        text_lower = text.lower()
        
        skill_keywords = ['python', 'javascript', 'java', 'react', 'angular', 'vue', 'node', 'django', 'flask', 'spring', 'aws', 'azure', 'docker', 'kubernetes']
        
        for skill in skill_keywords:
            if skill in text_lower:
                skills.append(skill)
        
        return skills

class RemoteOKScraper:
    """RemoteOK API for remote jobs"""
    
    def __init__(self):
        self.base_url = "https://remoteok.io/api"
    
    def search_jobs(self, keywords: str, location: str, max_results: int = 20) -> List[JobPosting]:
        """Search jobs using RemoteOK API with any-of token filtering"""
        jobs: List[JobPosting] = []
        
        try:
            print(f"[RemoteOK] GET {self.base_url}")
            response = requests.get(self.base_url, timeout=10)
            response.raise_for_status()
            data = response.json()
            print(f"[RemoteOK] status={response.status_code} items={len(data)}")
            
            tokens = self._tokenize_keywords(keywords)
            filtered_jobs = []
            for job_data in data[1:]:  # Skip metadata row
                if not job_data or not isinstance(job_data, dict):
                    continue
                text = f"{job_data.get('position','')} {job_data.get('description','')}".lower()
                if any(tok in text for tok in tokens):
                    filtered_jobs.append(job_data)
            
            for job_data in filtered_jobs[:max_results]:
                job = self.parse_remoteok_job(job_data)
                if job:
                    jobs.append(job)
                    
        except Exception as e:
            print(f"[RemoteOK] error: {e}")
        
        return jobs

    def _tokenize_keywords(self, keywords: str) -> List[str]:
        parts = re.split(r"[^a-zA-Z0-9+]+", (keywords or '').lower())
        return [p for p in parts if p and len(p) >= 2][:8]
    
    def parse_remoteok_job(self, job_data: Dict[str, Any]) -> JobPosting:
        """Parse RemoteOK job data"""
        try:
            raw_desc = job_data.get('description', '')
            # Preserve HTML structure instead of stripping
            clean_desc = clean_html_preserve_structure(raw_desc) if raw_desc else ''
            return JobPosting(
                id=f"remoteok_{job_data.get('id', '')}",
                title=job_data.get('position', 'N/A'),
                company=job_data.get('company', 'N/A'),
                location=job_data.get('location', 'Remote'),
                description=clean_desc,
                url=job_data.get('url', ''),
                source=JobSource.REMOTEOK,
                skills_required=self.extract_skills_from_text(
                    f"{job_data.get('position', '')} {clean_desc}"
                )
            )
        except Exception as e:
            print(f"Error parsing RemoteOK job: {e}")
            return None
    
    def extract_skills_from_text(self, text: str) -> List[str]:
        """Extract skills from job text"""
        skills: List[str] = []
        text_lower = text.lower()
        
        skill_keywords = ['python', 'javascript', 'java', 'react', 'angular', 'vue', 'node', 'django', 'flask', 'spring', 'aws', 'azure', 'docker', 'kubernetes']
        
        for skill in skill_keywords:
            if skill in text_lower:
                skills.append(skill)
        
        return skills
