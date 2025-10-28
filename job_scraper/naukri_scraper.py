"""
Naukri job scraper
"""
import re
import json
import time
import requests
from typing import List, Dict, Any
from urllib.parse import urlencode, quote
from bs4 import BeautifulSoup
from base_scraper import BaseJobScraper
from models import JobPosting, JobSearchQuery, JobSource
from config import NAUKRI_CONFIG

class NaukriScraper(BaseJobScraper):
    """Naukri job scraper implementation"""
    
    def __init__(self):
        super().__init__(JobSource.NAUKRI)
        self.base_url = NAUKRI_CONFIG['base_url']
        self.search_url = NAUKRI_CONFIG['search_url']
    
    def search_jobs(self, query: JobSearchQuery) -> List[JobPosting]:
        """Search for jobs on Naukri"""
        jobs = []
        keywords = ' '.join(query.keywords + query.skills)
        location = ''
        
        # Use simple keywords to avoid encoding issues
        simple_keywords = query.keywords[0] if query.keywords else 'engineer'
        location_simple = location.split(',')[0]
        
        # Try regular Naukri search page instead of API
        search_url = f"https://www.naukri.com/jobs-in-{location_simple.lower().replace(' ', '-')}"
        search_params = {
            'k': simple_keywords,
            'experience': '10',
            'jobType': '1'
        }
        
        print(f"Searching Naukri: {search_url}")
        print(f"Search params: {search_params}")
        
        # Use custom headers for Naukri
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0'
        }
        
        try:
            response = requests.get(search_url, params=search_params, headers=headers, timeout=15)
            response.raise_for_status()
        except Exception as e:
            print(f"Naukri request failed: {e}")
            return jobs
        
        try:
            # Parse HTML response instead of JSON
            jobs = self.parse_job_listings(response.text)
            print(f"Found {len(jobs)} jobs from Naukri HTML")
        except Exception as e:
            print(f"Error parsing Naukri HTML response: {e}")
        
        # Return jobs without calculating match scores here
        # Match scores will be calculated by the job aggregator
        return jobs
    
    def parse_job_listings(self, html_content: str) -> List[JobPosting]:
        """Parse job listings from Naukri HTML"""
        soup = BeautifulSoup(html_content, 'html.parser')
        jobs = []
        
        # Try multiple selectors for Naukri job cards
        job_cards = []
        
        # Try different possible selectors
        selectors = [
            'div[class*="jobTuple"]',
            'div[class*="jobCard"]', 
            'div[class*="job"]',
            'article',
            '.jobTuple',
            '.jobCard',
            '.job'
        ]
        
        for selector in selectors:
            cards = soup.select(selector)
            if cards:
                print(f"Found {len(cards)} job cards with selector: {selector}")
                job_cards = cards
                break
        
        if not job_cards:
            print("No job cards found with any selector")
            # Debug: Print a sample of the HTML
            print("HTML sample:", html_content[:500])
            return jobs
        
        for card in job_cards:
            try:
                job = self.parse_naukri_job_card(card)
                if job:
                    jobs.append(job)
            except Exception as e:
                print(f"Error parsing Naukri job card: {e}")
                continue
        
        return jobs
    
    def parse_naukri_job_card(self, card) -> JobPosting:
        """Parse a single job card from Naukri HTML"""
        try:
            # Extract job title
            title_elem = card.find('a', class_='title')
            title = title_elem.get_text(strip=True) if title_elem else "N/A"
            
            # Extract company name
            company_elem = card.find('a', class_='subTitle')
            company = company_elem.get_text(strip=True) if company_elem else "N/A"
            
            # Extract location
            location_elem = card.find('span', class_='locWdth')
            location = location_elem.get_text(strip=True) if location_elem else "N/A"
            
            # Extract job URL
            job_url = ""
            if title_elem and title_elem.get('href'):
                job_url = title_elem.get('href')
                if not job_url.startswith('http'):
                    job_url = f"https://www.naukri.com{job_url}"
            
            # Extract job ID from URL
            job_id = f"naukri_{hash(job_url) % 1000000000}"
            
            # Create basic description
            description = f"Job at {company} - {title}"
            
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
                skills_required=skills_required
            )
            
        except Exception as e:
            print(f"Error parsing Naukri job card: {e}")
            return None
    
    def parse_naukri_job(self, job_data: Dict[str, Any]) -> JobPosting:
        """Parse a single job from Naukri API response"""
        try:
            job_id = str(job_data.get('jobId', ''))
            title = job_data.get('title', 'N/A')
            company = job_data.get('companyName', 'N/A')
            location = job_data.get('placeholders', [{}])[0].get('location', 'N/A')
            description = job_data.get('jobDescription', '')
            
            # Extract job URL
            job_url = f"https://www.naukri.com/job-listings-{job_id}"
            
            # Extract salary information
            salary = job_data.get('salary', '')
            if not salary:
                salary = job_data.get('salaryDetail', '')
            
            # Extract experience level
            experience = job_data.get('experience', '')
            
            # Extract skills from description
            skills_text = f"{title} {description}"
            skills_required = self.extract_skills_from_text(skills_text)
            
            return JobPosting(
                id=f"naukri_{job_id}",
                title=title,
                company=company,
                location=location,
                description=description,
                url=job_url,
                source=self.source,
                salary=salary,
                experience_level=experience,
                skills_required=skills_required
            )
            
        except Exception as e:
            print(f"Error parsing Naukri job data: {e}")
            return None
    
    def search_jobs_web_scraping(self, query: JobSearchQuery) -> List[JobPosting]:
        """Alternative web scraping method for Naukri"""
        jobs = []
        keywords = ' '.join(query.keywords + query.skills)
        location = ''
        
        # Construct search URL
        search_url = f"{self.base_url}{location.lower().replace(' ', '-')}"
        params = {
            'k': keywords,
            'l': location,
            'experience': '2,5'
        }
        
        search_url = f"{search_url}?{urlencode(params)}"
        print(f"Searching Naukri web: {search_url}")
        
        response = self.make_request(search_url)
        if not response:
            return jobs
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find job listings
        job_cards = soup.find_all('div', class_='jobTuple')
        
        for card in job_cards:
            try:
                job = self.parse_naukri_card(card)
                if job:
                    jobs.append(job)
            except Exception as e:
                print(f"Error parsing Naukri job card: {e}")
                continue
        
        return jobs
    
    def parse_naukri_card(self, card) -> JobPosting:
        """Parse a single job card from Naukri web page"""
        try:
            # Extract job title
            title_elem = card.find('a', class_='title')
            title = title_elem.get_text(strip=True) if title_elem else "N/A"
            
            # Extract company name
            company_elem = card.find('a', class_='subTitle')
            company = company_elem.get_text(strip=True) if company_elem else "N/A"
            
            # Extract location
            location_elem = card.find('span', class_='locWdth')
            location = location_elem.get_text(strip=True) if location_elem else "N/A"
            
            # Extract job URL
            job_url = title_elem.get('href') if title_elem else ""
            
            # Extract job ID from URL
            job_id = self.extract_job_id(job_url)
            
            # Extract salary
            salary_elem = card.find('span', class_='salary')
            salary = salary_elem.get_text(strip=True) if salary_elem else ""
            
            # Extract experience
            exp_elem = card.find('span', class_='expwdth')
            experience = exp_elem.get_text(strip=True) if exp_elem else ""
            
            # Extract description
            desc_elem = card.find('span', class_='job-desc')
            description = desc_elem.get_text(strip=True) if desc_elem else ""
            
            # Extract skills
            skills_text = f"{title} {description}"
            skills_required = self.extract_skills_from_text(skills_text)
            
            return JobPosting(
                id=f"naukri_{job_id}",
                title=title,
                company=company,
                location=location,
                description=description,
                url=job_url,
                source=self.source,
                salary=salary,
                experience_level=experience,
                skills_required=skills_required
            )
            
        except Exception as e:
            print(f"Error parsing Naukri job card: {e}")
            return None
    
    def extract_job_id(self, url: str) -> str:
        """Extract job ID from Naukri URL"""
        if not url:
            return f"naukri_{hash(url)}"
        
        # Naukri job URLs typically contain job ID
        match = re.search(r'job-listings-(\d+)', url)
        if match:
            return match.group(1)
        
        return f"naukri_{hash(url)}"
    
    def parse_job_listing(self, job_data: Dict[str, Any]) -> JobPosting:
        """Parse a single job listing from raw data"""
        return self.parse_naukri_job(job_data)
