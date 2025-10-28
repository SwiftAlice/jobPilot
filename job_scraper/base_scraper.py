"""
Base scraper class for all job portal scrapers
"""
import time
import random
import requests
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from fake_useragent import UserAgent
from models import JobPosting, JobSearchQuery, JobSource
from config import USER_AGENTS, JOB_SEARCH_CONFIG

class BaseJobScraper(ABC):
    """Base class for all job scrapers"""
    
    def __init__(self, source: JobSource):
        self.source = source
        self.session = requests.Session()
        self.ua = UserAgent()
        self.setup_session()
    
    def setup_session(self):
        """Setup the requests session with headers and configuration"""
        self.session.headers.update({
            'User-Agent': random.choice(USER_AGENTS),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
        self.session.timeout = JOB_SEARCH_CONFIG['timeout']
    
    def get_random_delay(self) -> float:
        """Get a random delay between requests"""
        base_delay = JOB_SEARCH_CONFIG['delay_between_requests']
        return base_delay + random.uniform(0, 2)
    
    def make_request(self, url: str, params: Dict[str, Any] = None, 
                    retries: int = None) -> Optional[requests.Response]:
        """Make a request with retry logic and rate limiting"""
        if retries is None:
            retries = JOB_SEARCH_CONFIG['retry_attempts']
        
        for attempt in range(retries + 1):
            try:
                # Add random delay to avoid rate limiting
                if attempt > 0:
                    delay = self.get_random_delay() * (attempt + 1)
                    time.sleep(delay)
                
                response = self.session.get(url, params=params)
                response.raise_for_status()
                return response
                
            except requests.exceptions.RequestException as e:
                print(f"Request failed (attempt {attempt + 1}/{retries + 1}): {e}")
                if attempt == retries:
                    print(f"All retry attempts failed for URL: {url}")
                    return None
                
                # Exponential backoff
                time.sleep(2 ** attempt)
        
        return None
    
    def extract_skills_from_text(self, text: str) -> List[str]:
        """Extract skills from job description text"""
        # This is a basic implementation - can be enhanced with NLP
        from config import SKILLS_DATABASE
        
        all_skills = []
        for category, skills in SKILLS_DATABASE.items():
            all_skills.extend(skills)
        
        found_skills = []
        text_lower = text.lower()
        
        for skill in all_skills:
            if skill.lower() in text_lower:
                found_skills.append(skill)
        
        return list(set(found_skills))
    
    def calculate_match_score(self, job: JobPosting, user_skills: List[str]) -> float:
        """Calculate how well a job matches user skills"""
        if not job.skills_required or not user_skills:
            return 0.0
        
        matched_skills = set(job.skills_required) & set(user_skills)
        total_required = len(job.skills_required)
        
        if total_required == 0:
            return 0.0
        
        return len(matched_skills) / total_required
    
    @abstractmethod
    def search_jobs(self, query: JobSearchQuery) -> List[JobPosting]:
        """Search for jobs based on the query"""
        pass
    
    @abstractmethod
    def parse_job_listing(self, job_data: Dict[str, Any]) -> JobPosting:
        """Parse a single job listing from raw data"""
        pass
