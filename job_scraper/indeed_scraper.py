"""
Indeed job scraper
"""
import re
import time
import requests
from typing import List, Dict, Any
from urllib.parse import urlencode, quote
from bs4 import BeautifulSoup
from base_scraper import BaseJobScraper
from models import JobPosting, JobSearchQuery, JobSource
from config import INDEED_CONFIG

class IndeedScraper(BaseJobScraper):
    """Indeed job scraper implementation"""
    
    def __init__(self):
        super().__init__(JobSource.INDEED)
        self.base_url = INDEED_CONFIG['base_url']
    
    def search_jobs(self, query: JobSearchQuery) -> List[JobPosting]:
        """Search for jobs on Indeed"""
        jobs = []
        # Use very simple keywords to avoid URL encoding issues
        keywords = query.keywords[0] if query.keywords else 'engineer'  # Use only first keyword
        location = query.location.split(',')[0]  # Use only city name
        
        # Indeed uses pagination with start parameter
        start = 0
        max_results = min(query.max_results, 50)  # Reduced limit for faster response
        
        # Try multiple pages but limit to avoid timeouts
        max_pages = 3
        page = 0
        
        while len(jobs) < max_results and page < max_pages:
            search_params = {
                'q': keywords,
                'l': location,
                'sort': 'date',
                'start': start
            }
            
            search_url = f"{self.base_url}?{urlencode(search_params)}"
            print(f"Searching Indeed: {search_url}")
            
            # Add custom headers for Indeed
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }
            
            try:
                response = requests.get(search_url, headers=headers, timeout=10)
                response.raise_for_status()
            except Exception as e:
                print(f"Indeed request failed: {e}")
                break
            
            page_jobs = self.parse_job_listings(response.text)
            if not page_jobs:
                break
            
            jobs.extend(page_jobs)
            start += 10  # Indeed shows 10 jobs per page
            page += 1
            
            # Add delay between requests
            time.sleep(1)
        
        # Return jobs without calculating match scores here
        # Match scores will be calculated by the job aggregator
        return jobs[:max_results]
    
    def parse_job_listings(self, html_content: str) -> List[JobPosting]:
        """Parse job listings from Indeed HTML"""
        soup = BeautifulSoup(html_content, 'html.parser')
        jobs = []
        
        # Indeed job cards are in specific containers
        job_cards = soup.find_all('div', class_='job_seen_beacon')
        
        for card in job_cards:
            try:
                job = self.parse_job_card(card)
                if job:
                    jobs.append(job)
            except Exception as e:
                print(f"Error parsing Indeed job card: {e}")
                continue
        
        return jobs
    
    def parse_job_card(self, card) -> JobPosting:
        """Parse a single job card from Indeed"""
        try:
            # Extract job title
            title_elem = card.find('h2', class_='jobTitle')
            if not title_elem:
                title_elem = card.find('a', class_='jcs-JobTitle')
            title = title_elem.get_text(strip=True) if title_elem else "N/A"
            
            # Extract company name
            company_elem = card.find('span', class_='companyName')
            if not company_elem:
                company_elem = card.find('a', class_='companyName')
            company = company_elem.get_text(strip=True) if company_elem else "N/A"
            
            # Extract location
            location_elem = card.find('div', class_='companyLocation')
            if not location_elem:
                location_elem = card.find('span', class_='location')
            location = location_elem.get_text(strip=True) if location_elem else "N/A"
            
            # Extract job URL
            link_elem = card.find('a', class_='jcs-JobTitle')
            if not link_elem:
                link_elem = card.find('h2', class_='jobTitle').find('a')
            job_url = link_elem.get('href') if link_elem else ""
            
            # Make URL absolute
            if job_url and not job_url.startswith('http'):
                job_url = f"https://in.indeed.com{job_url}"
            
            # Extract job ID from URL
            job_id = self.extract_job_id(job_url)
            
            # Extract salary information
            salary_elem = card.find('div', class_='salary-snippet')
            if not salary_elem:
                salary_elem = card.find('span', class_='salaryText')
            salary = salary_elem.get_text(strip=True) if salary_elem else ""
            
            # Extract job type
            job_type_elem = card.find('div', class_='metadata')
            job_type = job_type_elem.get_text(strip=True) if job_type_elem else ""
            
            # Extract description snippet
            desc_elem = card.find('div', class_='job-snippet')
            if not desc_elem:
                desc_elem = card.find('div', class_='summary')
            description = desc_elem.get_text(strip=True) if desc_elem else ""
            
            # Extract skills from title and description
            skills_text = f"{title} {description}"
            skills_required = self.extract_skills_from_text(skills_text)
            
            return JobPosting(
                id=job_id,
                title=title,
                company=company,
                location=location,
                description=description,
                url=job_url,
                source=self.source,
                salary=salary,
                employment_type=job_type,
                skills_required=skills_required
            )
            
        except Exception as e:
            print(f"Error parsing Indeed job card: {e}")
            return None
    
    def extract_job_id(self, url: str) -> str:
        """Extract job ID from Indeed URL"""
        if not url:
            return f"indeed_{hash(url)}"
        
        # Indeed job URLs typically contain job ID
        match = re.search(r'viewjob\?jk=([a-zA-Z0-9]+)', url)
        if match:
            return f"indeed_{match.group(1)}"
        
        return f"indeed_{hash(url)}"
    
    def parse_job_listing(self, job_data: Dict[str, Any]) -> JobPosting:
        """Parse a single job listing from raw data"""
        # This would be used for detailed job parsing
        # For now, return a basic implementation
        return JobPosting(
            id=job_data.get('id', ''),
            title=job_data.get('title', ''),
            company=job_data.get('company', ''),
            location=job_data.get('location', ''),
            description=job_data.get('description', ''),
            url=job_data.get('url', ''),
            source=self.source
        )
