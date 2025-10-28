"""
LinkedIn job scraper
"""
import re
import json
import time
import random
from typing import List, Dict, Any
from urllib.parse import urlencode, urlparse, urlunparse
from bs4 import BeautifulSoup
from base_scraper import BaseJobScraper
from models import JobPosting, JobSearchQuery, JobSource
from config import LINKEDIN_CONFIG

# Optional Selenium imports (import lazily in methods)
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options as ChromeOptions
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    SELENIUM_AVAILABLE = True
except Exception:
    SELENIUM_AVAILABLE = False

class LinkedInScraper(BaseJobScraper):
    """LinkedIn job scraper implementation"""
    
    def __init__(self):
        super().__init__(JobSource.LINKEDIN)
        self.base_url = LINKEDIN_CONFIG['base_url']
    
    def search_jobs(self, query: JobSearchQuery) -> List[JobPosting]:
        """Search for jobs on LinkedIn"""
        jobs: List[JobPosting] = []
        seen_ids = set()
        # Use simpler keywords to avoid URL encoding issues
        keywords = ' '.join(query.keywords[:2])  # Use only first 2 keywords
        location = query.location.split(',')[0]  # Use only city name
        
        # LinkedIn uses pagination with start parameter
        start = 0
        max_results = min(query.max_results, 100)  # Increased limit
        max_pages = 3  # Reduce pages to avoid 429s
        
        page = 0
        while len(jobs) < max_results and page < max_pages:
            search_params = {
                'keywords': keywords,
                'location': location,
                'start': start
            }
            
            search_url = f"{self.base_url}?{urlencode(search_params)}"
            print(f"Searching LinkedIn page {page + 1}: {search_url}")
            
            page_jobs: List[JobPosting] = []

            # Prefer Selenium if enabled and available
            if LINKEDIN_CONFIG.get('selenium_enabled') and SELENIUM_AVAILABLE:
                try:
                    page_jobs = self.fetch_with_selenium(search_url)
                except Exception as e:
                    print(f"Selenium fetch failed: {e}")

            # Fallback to requests-based parsing
            if not page_jobs:
                response = self.make_request(search_url)
                if not response:
                    print(f"LinkedIn request failed for page {page + 1}")
                    time.sleep(self.get_random_delay() + 1)
                    break
                page_jobs = self.parse_job_listings(response.text)
            print(f"Found {len(page_jobs)} jobs on page {page + 1}")
            
            if not page_jobs:
                print(f"No jobs found on page {page + 1}, stopping")
                break
            
            # Deduplicate across pages using canonical jobId only
            for job in page_jobs:
                canonical_id = self.extract_job_id(job.url)
                if not canonical_id:
                    continue
                if canonical_id in seen_ids:
                    continue
                seen_ids.add(canonical_id)
                job.id = canonical_id
                job.url = self.canonicalize_job_url(job.url, canonical_id)
                jobs.append(job)

            # Stop if we've reached the desired count
            if len(jobs) >= max_results:
                break
            start += 25  # LinkedIn shows 25 jobs per page
            page += 1
            
            # Add short randomized delay between page requests to reduce throttling
            time.sleep(0.3 + random.random() * 0.7)
        
        # Return jobs without calculating match scores here
        # Match scores will be calculated by the job aggregator
        return jobs[:max_results]
    
    def parse_job_listings(self, html_content: str) -> List[JobPosting]:
        """Parse job listings from LinkedIn HTML"""
        soup = BeautifulSoup(html_content, 'html.parser')
        jobs: List[JobPosting] = []
        
        # Prefer robust selection: links to full job postings on result cards
        links = soup.select('a.base-card__full-link[href]')
        if not links:
            # Fallback to broader selector
            links = soup.select('a[href*="/jobs/view/"]')

        for link in links:
            try:
                job_url = link.get('href') or ''
                job_id = self.extract_job_id(job_url)

                # Find nearest card container to extract metadata
                card = link.find_parent(class_='base-card') or link.find_parent(class_='job-search-card') or link.parent

                # Title
                title_elem = (card.find('h3', class_='base-search-card__title') if card else None) or link
                title = title_elem.get_text(strip=True) if title_elem else 'N/A'

                # Company
                company_elem = card.find('h4', class_='base-search-card__subtitle') if card else None
                company = company_elem.get_text(strip=True) if company_elem else 'N/A'

                # Location
                location_elem = card.find('span', class_='job-search-card__location') if card else None
                location = location_elem.get_text(strip=True) if location_elem else 'N/A'

                description = f"Job at {company} - {title}"

                # Extract skills heuristically from title/description
                skills_text = f"{title} {description}"
                skills_required = self.extract_skills_from_text(skills_text)

                title_lower = title.lower()
                if any(word in title_lower for word in ['python', 'py']):
                    skills_required.append('python')
                if any(word in title_lower for word in ['javascript', 'js', 'react', 'node']):
                    skills_required.append('javascript')
                if 'java' in title_lower:
                    skills_required.append('java')
                if 'engineer' in title_lower or 'engineering' in title_lower:
                    skills_required.append('engineering')
                if 'developer' in title_lower or 'development' in title_lower:
                    skills_required.append('development')

                jobs.append(JobPosting(
                    id=job_id,
                    title=title,
                    company=company,
                    location=location,
                    description=description,
                    url=job_url,
                    source=self.source,
                    skills_required=skills_required
                ))
            except Exception as e:
                print(f"Error parsing LinkedIn job link: {e}")
                continue
        
        return jobs

    def fetch_with_selenium(self, url: str) -> List[JobPosting]:
        """Use Selenium to render and collect job links and metadata"""
        options = ChromeOptions()
        if LINKEDIN_CONFIG.get('selenium_headless', True):
            options.add_argument('--headless=new')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--window-size=1200,900')
        options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0 Safari/537.36')

        driver = webdriver.Chrome(options=options)
        try:
            driver.get(url)
            wait_seconds = LINKEDIN_CONFIG.get('selenium_page_wait_seconds', 4)
            WebDriverWait(driver, wait_seconds).until(
                EC.presence_of_all_elements_located((By.CSS_SELECTOR, 'a[href*="/jobs/view/"]'))
            )

            # Attempt to load more results via incremental scrolling with tight selectors
            seen_hrefs = set()
            jobs: List[JobPosting] = []
            for _ in range(4):
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(0.5 + random.random() * 0.5)
                try:
                    WebDriverWait(driver, wait_seconds).until(
                        EC.presence_of_all_elements_located((By.CSS_SELECTOR, 'ul.jobs-search__results-list li a[href*="/jobs/view/"]'))
                    )
                except Exception:
                    pass

                # Tight selector: anchors inside the official results list
                elems = driver.find_elements(By.CSS_SELECTOR, 'ul.jobs-search__results-list li a[href*="/jobs/view/"]')
                for el in elems:
                    href = el.get_attribute('href') or ''
                    if not href or href in seen_hrefs:
                        continue
                    seen_hrefs.add(href)
                    
                    # Build job posting from element/card
                try:
                        job_url = href
                        job_id = self.extract_job_id(job_url)
                        if not job_id and not job_url:
                            continue

                        # Find metadata from surrounding card
                        # Find nearest result item container
                        try:
                            card = el.find_element(By.XPATH, 'ancestor::li[contains(@class, "jobs-search-results__list-item")]')
                        except Exception:
                            card = None
                        title = ''
                        if card:
                            try:
                                title = card.find_element(By.CSS_SELECTOR, 'h3.base-search-card__title').text
                            except Exception:
                                title = el.text
                        else:
                            title = el.text
                        title = (title or '').strip() or 'N/A'

                        try:
                            company = card.find_element(By.CSS_SELECTOR, 'h4.base-search-card__subtitle').text.strip() if card else 'N/A'
                        except Exception:
                            company = 'N/A'
                        try:
                            location = card.find_element(By.CSS_SELECTOR, 'span.job-search-card__location').text.strip() if card else 'N/A'
                        except Exception:
                            location = 'N/A'

                        description = f"Job at {company} - {title}"
                        skills_text = f"{title} {description}"
                        skills_required = self.extract_skills_from_text(skills_text)

                        title_lower = title.lower()
                        if any(w in title_lower for w in ['python', 'py']):
                            skills_required.append('python')
                        if any(w in title_lower for w in ['javascript', 'js', 'react', 'node']):
                            skills_required.append('javascript')
                        if 'java' in title_lower:
                            skills_required.append('java')
                        if 'engineer' in title_lower or 'engineering' in title_lower:
                            skills_required.append('engineering')
                        if 'developer' in title_lower or 'development' in title_lower:
                            skills_required.append('development')

                        jobs.append(JobPosting(
                            id=job_id,
                            title=title,
                            company=company,
                            location=location,
                            description=description,
                            url=job_url,
                            source=self.source,
                            skills_required=skills_required
                        ))
                except Exception:
                        continue

            return jobs
        finally:
            driver.quit()
    
    def parse_job_card(self, card) -> JobPosting:
        """Parse a single job card from LinkedIn"""
        try:
            # Extract job title
            title_elem = card.find('h3', class_='base-search-card__title')
            title = title_elem.get_text(strip=True) if title_elem else "N/A"
            
            # Extract company name
            company_elem = card.find('h4', class_='base-search-card__subtitle')
            company = company_elem.get_text(strip=True) if company_elem else "N/A"
            
            # Extract location
            location_elem = card.find('span', class_='job-search-card__location')
            location = location_elem.get_text(strip=True) if location_elem else "N/A"
            
            # Extract job URL
            link_elem = card.find('a', class_='base-card__full-link')
            job_url = link_elem.get('href') if link_elem else ""
            
            # Extract job ID from URL
            job_id = self.extract_job_id(job_url)
            
            # For now, we'll get basic info from the card
            # Full description would require additional API calls
            description = f"Job at {company} - {title}"
            
            # Extract skills from title and description
            skills_text = f"{title} {description}"
            skills_required = self.extract_skills_from_text(skills_text)
            
            # Add common skills based on job title patterns
            title_lower = title.lower()
            if any(word in title_lower for word in ['python', 'py']):
                skills_required.append('python')
            if any(word in title_lower for word in ['javascript', 'js', 'react', 'node']):
                skills_required.append('javascript')
            if any(word in title_lower for word in ['java']):
                skills_required.append('java')
            if any(word in title_lower for word in ['engineer', 'engineering']):
                skills_required.append('engineering')
            if any(word in title_lower for word in ['developer', 'development']):
                skills_required.append('development')
            
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
            print(f"Error parsing LinkedIn job card: {e}")
            return None
    
    def extract_job_id(self, url: str) -> str:
        """Extract canonical job ID from LinkedIn URL (stable across refId/trackingId)"""
        if not url:
            return ''
        match = re.search(r'/jobs/view/(\d+)', url)
        if match:
            return f"linkedin_{match.group(1)}"
        return ''

    def canonicalize_job_url(self, url: str, job_id: str) -> str:
        """Return a clean LinkedIn job URL without tracking params."""
        if job_id:
            m = re.match(r'linkedin_(\d+)', job_id)
            if m:
                return f"https://www.linkedin.com/jobs/view/{m.group(1)}"
        if not url:
            return ''
        # strip query and fragment
        parts = urlparse(url)
        clean = parts._replace(query='', fragment='')
        return urlunparse(clean)
    
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
