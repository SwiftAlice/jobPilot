"""
Google search scraper for job discovery
"""
import requests
import time
import re
from typing import List, Dict, Any, Optional
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, parse_qs, quote_plus
from models import JobPosting, JobSource
from enhanced_skill_matcher import EnhancedSkillMatcher
import json

class GoogleJobScraper:
    """Google search scraper for job discovery"""
    
    def __init__(self):
        self.base_url = "https://www.google.com/search"
        self.session = requests.Session()
        
        # Rotate user agents to avoid detection
        user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        ]
        
        self.session.headers.update({
            'User-Agent': user_agents[0],  # Use first user agent
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
        self.skill_matcher = EnhancedSkillMatcher()
    
    def search_jobs(self, keywords: str, location: str, max_results: int = 20) -> List[JobPosting]:
        """Search for jobs using Google search with timeout optimization"""
        jobs = []
        
        # Create focused search queries to avoid rate limiting
        search_queries = self._create_focused_queries(keywords, location)
        
        # Limit to 1 query to avoid timeout issues
        for i, query in enumerate(search_queries[:1]):
            try:
                print(f"[Google] Searching: {query}")
                query_jobs = self._search_single_query(query, max_results)
                jobs.extend(query_jobs)
                
            except Exception as e:
                print(f"[Google] Error searching '{query}': {e}")
                # If we get rate limited or timeout, stop trying
                if "429" in str(e) or "Too Many Requests" in str(e) or "timeout" in str(e).lower():
                    print("[Google] Rate limited or timeout, stopping Google search")
                    break
                continue
        
        # Remove duplicates and return
        unique_jobs = self._remove_duplicates(jobs)
        return unique_jobs[:max_results]
    
    def _create_focused_queries(self, keywords: str, location: str) -> List[str]:
        """Create focused search queries to avoid rate limiting"""
        queries = []
        
        # Simplify keywords to avoid overly complex queries
        simple_keywords = keywords.split()[:3]  # Take first 3 keywords
        keyword_str = ' '.join(simple_keywords)
        
        # Create focused queries
        if location and location.lower() != 'remote':
            queries.append(f'"{keyword_str}" jobs {location}')
        else:
            queries.append(f'"{keyword_str}" remote jobs')
        
        # Add one more focused query
        queries.append(f'"{keyword_str}" careers hiring')
        
        return queries
    
    def _search_single_query(self, query: str, max_results: int) -> List[JobPosting]:
        """Search a single query and extract job results"""
        jobs = []
        
        params = {
            'q': query,
            'num': min(max_results, 10),  # Google typically returns 10 results per page
            'start': 0,
            'safe': 'off',
            'filter': '0'  # Don't filter results
        }
        
        try:
            response = self.session.get(self.base_url, params=params, timeout=10)  # Reduce timeout to 10 seconds
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Extract search results
            results = soup.find_all('div', class_='g')  # Google search result containers
            
            for result in results[:max_results]:
                job = self._parse_google_result(result, query)
                if job:
                    jobs.append(job)
                    
        except Exception as e:
            print(f"[Google] Error in search: {e}")
        
        return jobs
    
    def _parse_google_result(self, result, query: str) -> Optional[JobPosting]:
        """Parse a Google search result into a job posting"""
        try:
            # Extract title and link
            title_elem = result.find('h3')
            if not title_elem:
                return None
            
            link_elem = title_elem.find_parent('a')
            if not link_elem:
                return None
            
            title = title_elem.get_text(strip=True)
            url = link_elem.get('href', '')
            
            # Clean up Google's redirect URL
            if url.startswith('/url?q='):
                url = parse_qs(urlparse(url).query).get('q', [''])[0]
            
            # Extract snippet/description
            snippet_elem = result.find('span', class_='aCOpRe') or result.find('div', class_='VwiC3b')
            description = snippet_elem.get_text(strip=True) if snippet_elem else ''
            
            # Extract company name from title or URL
            company = self._extract_company_name(title, url)
            
            # Extract location from title or description
            location = self._extract_location(title, description, query)
            
            # Generate unique ID
            job_id = f"google_{hash(url + title) % 1000000}"
            
            # Extract skills from title and description
            skills_text = f"{title} {description}"
            skills_required = self.skill_matcher.extract_skills_from_text(skills_text)
            
            # Filter out non-job results
            if not self._is_job_posting(title, description, url):
                return None
            
            return JobPosting(
                id=job_id,
                title=title,
                company=company,
                location=location,
                description=description,
                url=url,
                source=JobSource.GOOGLE,
                skills_required=skills_required
            )
            
        except Exception as e:
            print(f"Error parsing Google result: {e}")
            return None
    
    def _extract_company_name(self, title: str, url: str) -> str:
        """Extract company name from title or URL"""
        # Try to extract from URL domain
        try:
            domain = urlparse(url).netloc
            if domain:
                # Remove common prefixes
                domain = domain.replace('www.', '').replace('jobs.', '').replace('careers.', '')
                # Take the main domain part
                company = domain.split('.')[0]
                if company and len(company) > 2:
                    return company.title()
        except:
            pass
        
        # Try to extract from title
        title_lower = title.lower()
        
        # Common patterns
        patterns = [
            r'at\s+([A-Z][a-zA-Z\s&]+)',
            r'@\s*([A-Z][a-zA-Z\s&]+)',
            r'-?\s*([A-Z][a-zA-Z\s&]+)\s*-',
            r'([A-Z][a-zA-Z\s&]+)\s*is hiring',
            r'([A-Z][a-zA-Z\s&]+)\s*jobs'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, title)
            if match:
                company = match.group(1).strip()
                if len(company) > 2 and len(company) < 50:
                    return company
        
        return 'Unknown Company'
    
    def _extract_location(self, title: str, description: str, query: str) -> str:
        """Extract location from title, description, or query"""
        text = f"{title} {description} {query}".lower()
        
        # Common location patterns
        location_patterns = [
            r'in\s+([A-Z][a-zA-Z\s,]+)',
            r'at\s+([A-Z][a-zA-Z\s,]+)',
            r'([A-Z][a-zA-Z\s,]+),\s*[A-Z]{2}',  # City, State
            r'([A-Z][a-zA-Z\s,]+),\s*[A-Z][a-z]+',  # City, Country
        ]
        
        for pattern in location_patterns:
            match = re.search(pattern, text)
            if match:
                location = match.group(1).strip()
                if len(location) > 2 and len(location) < 30:
                    return location
        
        # Check for remote indicators
        remote_indicators = ['remote', 'work from home', 'telecommute', 'virtual', 'wfh']
        if any(indicator in text for indicator in remote_indicators):
            return 'Remote'
        
        return 'Location Not Specified'
    
    def _is_job_posting(self, title: str, description: str, url: str) -> bool:
        """Check if the result is actually a job posting"""
        text = f"{title} {description}".lower()
        url_lower = url.lower()
        
        # Job-related keywords
        job_keywords = [
            'job', 'jobs', 'career', 'careers', 'hiring', 'position', 'opening',
            'vacancy', 'opportunity', 'employment', 'recruit', 'recruitment',
            'apply', 'application', 'candidate', 'developer', 'engineer',
            'programmer', 'analyst', 'manager', 'director', 'lead', 'senior',
            'junior', 'entry', 'level', 'full-time', 'part-time', 'contract',
            'freelance', 'remote', 'onsite', 'hybrid'
        ]
        
        # Check if any job keywords are present
        has_job_keywords = any(keyword in text for keyword in job_keywords)
        
        # Check URL patterns
        job_url_patterns = [
            '/jobs/', '/careers/', '/hiring/', '/positions/', '/openings/',
            'linkedin.com/jobs', 'indeed.com', 'glassdoor.com', 'monster.com',
            'naukri.com', 'timesjobs.com', 'shine.com'
        ]
        
        has_job_url = any(pattern in url_lower for pattern in job_url_patterns)
        
        # Exclude non-job results
        exclude_keywords = [
            'salary', 'salary.com', 'glassdoor.com/salaries', 'payscale.com',
            'indeed.com/salaries', 'comparison', 'review', 'interview',
            'resume', 'cv', 'template', 'example', 'sample'
        ]
        
        has_exclude_keywords = any(keyword in text for keyword in exclude_keywords)
        
        return (has_job_keywords or has_job_url) and not has_exclude_keywords
    
    def _remove_duplicates(self, jobs: List[JobPosting]) -> List[JobPosting]:
        """Remove duplicate jobs"""
        seen = set()
        unique_jobs = []
        
        for job in jobs:
            # Create unique key from title + company + URL
            key = f"{job.title.lower().strip()}_{job.company.lower().strip()}_{job.url}"
            if key not in seen:
                seen.add(key)
                unique_jobs.append(job)
        
        return unique_jobs
