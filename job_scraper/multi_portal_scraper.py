"""
Enhanced multi-portal job scraper with comprehensive skill matching
"""
import requests
import time
import re
import asyncio
import aiohttp
from typing import List, Dict, Any, Optional
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, parse_qs
from models import JobPosting, JobSource
from api_keys import ADZUNA_APP_ID, ADZUNA_APP_KEY, JOOBLE_API_KEY
import json
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

def clean_html_preserve_structure(html_elem) -> str:
    """
    Clean HTML element but preserve structure (headings, paragraphs, lists, etc.)
    Removes scripts, styles, but keeps formatting tags.
    Preserves UTF-8 encoding for emojis and special characters.
    """
    if not html_elem:
        return ''
    
    # If it's a BeautifulSoup element, get its inner HTML
    if hasattr(html_elem, 'decode_contents'):
        # BeautifulSoup Tag element - get contents with UTF-8
        html_str = html_elem.decode_contents(formatter='html')
    elif hasattr(html_elem, '__str__'):
        html_str = str(html_elem)
    else:
        html_str = html_elem
    
    # Ensure html_str is a string and handle encoding
    if isinstance(html_str, bytes):
        html_str = html_str.decode('utf-8', errors='ignore')
    
    if not html_str:
        return ''
    
    # Parse to clean it with UTF-8 support
    soup = BeautifulSoup(html_str, 'html.parser', from_encoding='utf-8')
    
    # Remove unsafe/unwanted tags but keep structure
    for tag in soup.find_all(['script', 'style', 'noscript', 'nav', 'header', 'footer', 'form', 'input', 'button']):
        tag.decompose()
    
    # Remove onclick and other event handlers
    for tag in soup.find_all(True):
        # Remove all attributes except href for links and basic styling classes
        allowed_attrs = ['href', 'target', 'rel']
        tag.attrs = {k: v for k, v in tag.attrs.items() if k in allowed_attrs}
    
    # Get the cleaned HTML with UTF-8 encoding preserved
    # BeautifulSoup in Python 3 returns Unicode strings by default
    cleaned = str(soup)
    # Ensure it's a string, not bytes
    if isinstance(cleaned, bytes):
        cleaned = cleaned.decode('utf-8', errors='ignore')
    
    # Clean up extra whitespace but preserve structure and special characters
    cleaned = re.sub(r'\s+', ' ', cleaned, flags=re.UNICODE)  # Multiple spaces to single (Unicode-aware)
    cleaned = re.sub(r'>\s+<', '><', cleaned)  # Spaces between tags
    
    # Ensure the result is a properly encoded UTF-8 string
    if isinstance(cleaned, bytes):
        cleaned = cleaned.decode('utf-8', errors='ignore')
    
    return cleaned.strip()

# Enhanced skill extraction with comprehensive tech stack
TECH_SKILLS = {
    'programming_languages': [
        'python', 'javascript', 'java', 'typescript', 'c++', 'c#', 'go', 'rust', 'kotlin', 'swift',
        'php', 'ruby', 'scala', 'r', 'matlab', 'perl', 'bash', 'powershell', 'sql', 'html', 'css'
    ],
    'frameworks': [
        'react', 'angular', 'vue', 'node.js', 'express', 'django', 'flask', 'spring', 'spring boot',
        'laravel', 'rails', 'asp.net', 'next.js', 'nuxt.js', 'svelte', 'ember', 'backbone'
    ],
    'databases': [
        'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch', 'cassandra', 'dynamodb',
        'oracle', 'sqlite', 'mariadb', 'neo4j', 'influxdb', 'couchdb'
    ],
    'cloud_platforms': [
        'aws', 'azure', 'gcp', 'google cloud', 'heroku', 'digital ocean', 'linode', 'vultr',
        'cloudflare', 'vercel', 'netlify', 'firebase'
    ],
    'devops_tools': [
        'docker', 'kubernetes', 'jenkins', 'gitlab ci', 'github actions', 'terraform', 'ansible',
        'chef', 'puppet', 'vagrant', 'consul', 'vault', 'prometheus', 'grafana'
    ],
    'mobile_development': [
        'react native', 'flutter', 'xamarin', 'ionic', 'cordova', 'phonegap', 'android', 'ios',
        'swift', 'kotlin', 'objective-c'
    ],
    'data_science': [
        'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'scikit-learn', 'pandas',
        'numpy', 'matplotlib', 'seaborn', 'jupyter', 'spark', 'hadoop', 'kafka'
    ],
    'testing': [
        'jest', 'mocha', 'chai', 'cypress', 'selenium', 'pytest', 'junit', 'testng', 'karma',
        'jasmine', 'protractor', 'playwright'
    ],
    'other_tools': [
        'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence', 'slack', 'figma', 'sketch',
        'adobe', 'photoshop', 'illustrator', 'wordpress', 'drupal', 'magento', 'shopify'
    ]
}

def extract_skills_from_text(text: str) -> List[str]:
    """Enhanced skill extraction from job text"""
    if not text:
        return []
    
    text_lower = text.lower()
    found_skills = []
    
    # Extract all skills from the comprehensive tech stack
    for category, skills in TECH_SKILLS.items():
        for skill in skills:
            # Use word boundary matching to avoid matching "r" when looking for "react"
            # Create regex pattern with word boundaries
            pattern = r'\b' + re.escape(skill.lower()) + r'\b'
            if re.search(pattern, text_lower):
                found_skills.append(skill)
    
    # Remove duplicates and return
    return list(set(found_skills))

def simplify_keywords(text: str, max_tokens: int = 3) -> str:
    """Intelligent keyword simplification using dynamic pattern recognition"""
    if not text:
        return ""
    
    # Clean and split text
    parts = re.split(r"[^a-zA-Z0-9+]+", text.strip())
    tokens = [p.lower() for p in parts if p and len(p) > 1]
    
    if not tokens:
        return ""
    
    # If we have fewer tokens than max_tokens, return as is
    if len(tokens) <= max_tokens:
        return ' '.join(tokens)
    
    # Dynamic scoring based on linguistic patterns
    def calculate_word_score(word: str) -> int:
        score = 0
        
        # Pattern 1: Job role indicators (ends with common job suffixes)
        job_suffixes = ['er', 'or', 'ist', 'ant', 'eer', 'ier']
        if any(word.endswith(suffix) and len(word) > 4 for suffix in job_suffixes):
            score += 10
        
        # Pattern 2: Technology indicators (contains common tech patterns)
        tech_patterns = [r'.*script$', r'.*js$', r'.*sql$', r'.*db$', r'.*api$', 
                        r'.*ml$', r'.*ai$', r'.*dev$', r'.*ops$', r'.*net$']
        if any(re.match(pattern, word) for pattern in tech_patterns):
            score += 8
        
        # Pattern 3: Seniority indicators (common prefixes)
        seniority_prefixes = ['senior', 'lead', 'principal', 'staff', 'junior', 'entry', 'mid', 'senior']
        if any(word.startswith(prefix) for prefix in seniority_prefixes):
            score += 6
        
        # Pattern 4: Experience indicators (common adjectives)
        experience_words = ['experienced', 'expert', 'skilled', 'proficient', 'advanced', 'certified']
        if word in experience_words:
            score += 4
        
        # Pattern 5: Length-based scoring (longer words often more specific)
        if len(word) > 8:
            score += 3
        elif len(word) > 6:
            score += 2
        elif len(word) > 4:
            score += 1
        
        # Pattern 6: Capitalization pattern (if original had caps, likely important)
        original_word = next((p for p in parts if p.lower() == word), word)
        if original_word != original_word.lower():
            score += 2
        
        # Pattern 7: Common words penalty
        common_words = {'the', 'and', 'or', 'for', 'with', 'in', 'on', 'at', 'to', 'of', 'a', 'an', 'is', 'are', 'was', 'were'}
        if word in common_words:
            score -= 10
        
        # Pattern 8: Numbers and years (often important for experience)
        if re.match(r'^\d+$', word) and len(word) <= 2:  # Years like "5", "10"
            score += 3
        
        # Pattern 9: Compound words (often technical terms)
        if '-' in word or '_' in word:
            score += 2
        
        return score
    
    # Score all tokens
    scored_tokens = [(token, calculate_word_score(token)) for token in tokens]
    
    # Sort by score (descending) and take top tokens
    scored_tokens.sort(key=lambda x: x[1], reverse=True)
    
    # Take the highest scoring tokens up to max_tokens
    selected_tokens = [token for token, score in scored_tokens[:max_tokens]]
    
    # If we don't have enough high-scoring tokens, fill with remaining meaningful tokens
    if len(selected_tokens) < max_tokens:
        remaining_tokens = [token for token, score in scored_tokens[max_tokens:] 
                          if token not in selected_tokens and len(token) > 2]
        selected_tokens.extend(remaining_tokens[:max_tokens - len(selected_tokens)])
    
    return ' '.join(selected_tokens)

def strip_html(html: str) -> str:
    """Strip HTML tags from text"""
    if not html:
        return ''
    try:
        soup = BeautifulSoup(html, 'html.parser')
        return soup.get_text(separator=' ', strip=True)
    except Exception:
        return re.sub(r'<[^>]+>', ' ', html)

class LinkedInScraper:
    """LinkedIn job scraper with enhanced skill matching"""
    
    def __init__(self):
        self.base_url = "https://www.linkedin.com/jobs/search"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
    
    def search_jobs(self, query) -> List[JobPosting]:
        """Search LinkedIn jobs"""
        jobs = []
        keywords = ' '.join(query.keywords + query.skills)
        location = query.location or ''  # Use empty string if None
        
        try:
            print(f"\n[LinkedIn] ========== SEARCH STARTED ==========")
            print(f"[LinkedIn] Keywords: '{keywords}'")
            print(f"[LinkedIn] Skills: {query.skills}")
            print(f"[LinkedIn] Location: '{location}'")
            print(f"[LinkedIn] Max results: {query.max_results}")
            
            # LinkedIn uses AND logic for keywords and skills
            # If we search "Software Engineer Python React", it requires ALL words
            # This gives 0 results when the job has "Software Engineer" but uses "JavaScript" instead of "Python"
            # Solution: Use only the first keyword, let matching handle skills on the backend
            main_keyword = query.keywords[0] if query.keywords else 'engineer'
            
            print(f"[LinkedIn] Original keywords: {query.keywords}")
            print(f"[LinkedIn] Original skills: {query.skills}")
            print(f"[LinkedIn] LinkedIn would use AND logic: '{keywords}' (requires ALL words)")
            print(f"[LinkedIn] Using only main keyword for search: '{main_keyword}'")
            print(f"[LinkedIn] Skills will be matched via backend scoring, not search query")
            
            params = {
                'keywords': main_keyword,  # Use only the first keyword, not combined with skills
                'location': location,
                'f_TPR': 'r86400',  # Last 24 hours
                'f_JT': 'F',  # Full-time
                'start': 0
            }
            
            print(f"\n[LinkedIn] ========== MAKING REQUEST ==========")
            print(f"[LinkedIn] Request params: {params}")
            print(f"[LinkedIn] Base URL: {self.base_url}")
            
            # Build full URL for logging
            full_url = f"{self.base_url}?{'&'.join([f'{k}={v}' for k, v in params.items()])}"
            print(f"[LinkedIn] Full URL: {full_url}")
            print(f"[LinkedIn] GET request to: {full_url}")
            
            response = self.session.get(self.base_url, params=params, timeout=15)
            
            print(f"\n[LinkedIn] ========== RESPONSE RECEIVED ==========")
            print(f"[LinkedIn] Response status: {response.status_code}")
            print(f"[LinkedIn] Response URL (final): {response.url}")
            print(f"[LinkedIn] Response headers:")
            for key, value in response.headers.items():
                print(f"[LinkedIn]   {key}: {value}")
            print(f"[LinkedIn] HTML length: {len(response.text)} characters")
            
            # Show the actual request that was made
            print(f"\n[LinkedIn] Actual request made: GET {response.url}")
            print(f"[LinkedIn] Request headers: {dict(self.session.headers)}")
            
            response.raise_for_status()
            
            # Ensure UTF-8 encoding for LinkedIn responses
            if response.encoding and response.encoding.lower() != 'utf-8':
                response.encoding = 'utf-8'
            
            # Parse LinkedIn job listings (simplified - would need more sophisticated parsing)
            soup = BeautifulSoup(response.text, 'html.parser', from_encoding='utf-8')
            
            # Try multiple selectors and log results
            print(f"\n[LinkedIn] ========== PARSING JOB CARDS ==========")
            
            job_cards = soup.find_all('div', class_='job-search-card')
            print(f"[LinkedIn] Selector 1 - 'job-search-card': {len(job_cards)} cards")
            
            if not job_cards:
                job_cards = soup.find_all('div', {'data-testid': 'job-card'})
                print(f"[LinkedIn] Selector 2 - 'data-testid=job-card': {len(job_cards)} cards")
            
            if not job_cards:
                job_cards = soup.find_all('div', class_='jobs-search-results__list-item')
                print(f"[LinkedIn] Selector 3 - 'jobs-search-results__list-item': {len(job_cards)} cards")
            
            if not job_cards:
                # Try more generic selectors
                job_cards = soup.find_all('div', class_='base-card')
                print(f"[LinkedIn] Selector 4 - 'base-card': {len(job_cards)} cards")
            
            if not job_cards:
                # Check if we got redirected to login page
                if 'login' in response.url.lower() or 'auth' in response.url.lower():
                    print(f"[LinkedIn] ⚠️  Redirected to login page: {response.url}")
                
                # Check for any job-related content
                if 'job' in response.text.lower():
                    print(f"[LinkedIn] ⚠️  Found 'job' text in response, but no job cards")
                
                # Check for LinkedIn's anti-bot measures
                if 'challenge' in response.text.lower() or 'security' in response.text.lower():
                    print(f"[LinkedIn] ⚠️  Security challenge detected!")
                
                # Print first few div classes for debugging
                all_divs = soup.find_all('div')
                print(f"[LinkedIn] Total divs found: {len(all_divs)}")
                for i, div in enumerate(all_divs[:10]):
                    classes = div.get('class', [])
                    if classes:
                        print(f"[LinkedIn] Div {i}: {div.name} with classes = {classes}")
                
                print(f"[LinkedIn] Response content preview (first 500 chars):")
                print(f"{response.text[:500]}...")
            
            print(f"[LinkedIn] Total job cards to parse: {len(job_cards)}")
            
            # Parse all cards from first page
            print(f"[LinkedIn] Parsing {len(job_cards)} cards from first page...")
            for i, card in enumerate(job_cards):
                job = self.parse_linkedin_job(card)
                if job:
                    jobs.append(job)
                    if len(jobs) >= query.max_results:
                        break
            
            print(f"[LinkedIn] Parsed {len(jobs)} jobs from first page")
            
            # If we need more jobs, fetch additional pages
            if len(jobs) < query.max_results:
                pages_to_fetch = (query.max_results - len(jobs)) // 25 + 1
                print(f"[LinkedIn] Need {query.max_results} jobs, have {len(jobs)}, fetching {pages_to_fetch} more pages")
                
                for page_num in range(1, min(pages_to_fetch + 1, 10)):  # Max 10 pages to avoid rate limiting
                    start_param = page_num * 25
                    params['start'] = start_param
                    
                    print(f"[LinkedIn] Fetching page {page_num + 1}, start={start_param}")
                    
                    try:
                        page_response = self.session.get(self.base_url, params=params, timeout=15)
                        page_response.raise_for_status()
                        page_soup = BeautifulSoup(page_response.text, 'html.parser')
                        
                        # Find job cards
                        page_cards = page_soup.find_all('div', class_='job-search-card')
                        if not page_cards:
                            page_cards = page_soup.find_all('div', {'data-testid': 'job-card'})
                        if not page_cards:
                            page_cards = page_soup.find_all('div', class_='jobs-search-results__list-item')
                        if not page_cards:
                            page_cards = page_soup.find_all('div', class_='base-card')
                        
                        print(f"[LinkedIn] Found {len(page_cards)} cards on page {page_num + 1}")
                        
                        if len(page_cards) == 0:
                            print(f"[LinkedIn] No more cards found, stopping pagination")
                            break
                        
                        # Parse cards from this page
                        for card in page_cards:
                            job = self.parse_linkedin_job(card)
                            if job:
                                jobs.append(job)
                                if len(jobs) >= query.max_results:
                                    break
                        
                        print(f"[LinkedIn] Total jobs so far: {len(jobs)}")
                        
                        if len(jobs) >= query.max_results:
                            break
                            
                        # Small delay to avoid rate limiting
                        import time
                        time.sleep(0.5)
                        
                    except Exception as e:
                        print(f"[LinkedIn] Error fetching page {page_num + 1}: {e}")
                        break
            
            # Fetch full descriptions asynchronously for jobs with short descriptions
            async def fetch_full_description(job: JobPosting) -> Optional[str]:
                """Fetch full job description from LinkedIn job page"""
                try:
                    if len(job.description) < 100:  # Only fetch if description is short
                        async with aiohttp.ClientSession() as session:
                            async with session.get(job.url, headers={
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                            }) as resp:
                                if resp.status == 200:
                                    html = await resp.text()
                                    soup = BeautifulSoup(html, 'html.parser')
                                    
                                    # Try multiple selectors for description
                                    desc_selectors = [
                                        'div.jobs-description__text',
                                        'div.show-more-less-html__markup',
                                        'section.jobs-description-content__text',
                                        'div[data-testid="job-poster-description"]',
                                        'div.jobs-box__html-content'
                                    ]
                                    
                                    for selector in desc_selectors:
                                        desc_elem = soup.select_one(selector)
                                        if desc_elem:
                                            # Preserve HTML structure instead of plain text
                                            full_desc = clean_html_preserve_structure(desc_elem)
                                            if len(full_desc) > 100:
                                                return full_desc
                except Exception as e:
                    print(f"[LinkedIn] Failed to fetch description for {job.title}: {e}")
                
                return None
            
            # Fetch full descriptions async for jobs with short descriptions
            short_desc_jobs = [job for job in jobs if len(job.description) < 100]
            if short_desc_jobs:
                print(f"[LinkedIn] Fetching full descriptions for {len(short_desc_jobs)} jobs...")
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                tasks = [fetch_full_description(job) for job in short_desc_jobs]
                results = loop.run_until_complete(asyncio.gather(*tasks))
                loop.close()
                
                for job, full_desc in zip(short_desc_jobs, results):
                    if full_desc:
                        job.description = full_desc
                        print(f"[LinkedIn] ✓ Updated description for {job.title}: {len(full_desc)} chars")
                    
        except Exception as e:
            print(f"[LinkedIn] ❌ ERROR: {e}")
            print(f"[LinkedIn] Error type: {type(e).__name__}")
            import traceback
            traceback.print_exc()
        
        print(f"[LinkedIn] ========== SEARCH COMPLETE ==========")
        print(f"[LinkedIn] Returning {len(jobs)} jobs\n")
        return jobs
    
    def parse_linkedin_job(self, card) -> Optional[JobPosting]:
        """Parse LinkedIn job card"""
        try:
            title_elem = card.find('h3', class_='base-search-card__title')
            company_elem = card.find('h4', class_='base-search-card__subtitle')
            location_elem = card.find('span', class_='job-search-card__location')
            link_elem = card.find('a', class_='base-card__full-link')
            # Try to find description text in various places
            description_elem = card.find('div', class_='base-search-card__metadata')
            
            if not all([title_elem, company_elem, link_elem]):
                print(f"[LinkedIn] Missing required elements in job card")
                return None
            
            title = title_elem.get_text(strip=True)
            company = company_elem.get_text(strip=True)
            location = location_elem.get_text(strip=True) if location_elem else 'Remote'
            url = urljoin('https://www.linkedin.com', link_elem.get('href', ''))
            
            # Try to get description from the card first
            description = None
            
            # Method 1: Look for metadata description
            if description_elem:
                description = description_elem.get_text(strip=True)
            
            # Method 2: Try to find snippet/description from job card
            if not description:
                # Look for snippet that often contains first part of description
                snippet = card.find('span', class_='base-search-card__metadata')
                if snippet:
                    description = snippet.get_text(strip=True)
                
                # Also try other text elements
                if not description or len(description) < 20:
                    desc_elem = card.find('p', class_='base-search-card__metadata')
                    if desc_elem:
                        description = desc_elem.get_text(strip=True)
            
            # Fallback if we still don't have a good description from card
            if not description or len(description) < 50:
                description = f"{title} at {company} in {location}. Full description will be fetched."
            
            # Method 4: Get all text from card and use relevant parts
            if not description or len(description) < 50:
                all_text = card.get_text(separator=' ', strip=True)
                # Add space before common patterns that LinkedIn often concatenates without space
                all_text = all_text.replace('Be an', ' Be an')
                all_text = all_text.replace('ago', ' ago')
                all_text = all_text.replace('Applicants', ' Applicants')
                # Remove title, company, location from description
                text_parts = all_text.split(title)
                if len(text_parts) > 1:
                    description = ' '.join(text_parts[1:]).strip()[:500]
                else:
                    description = all_text[:500]
            
            # Fallback if still no meaningful description
            if not description or len(description) < 30:
                description = f"{title} position at {company} in {location}."
            
            print(f"[LinkedIn] Description extracted: {len(description)} chars")
            
            # Extract job ID from URL
            job_id = f"linkedin_{url.split('/')[-1]}" if url else f"linkedin_{int(time.time())}"
            
            # Extract skills from title, company, and description
            full_text = f"{title} {company} {description}"
            skills = extract_skills_from_text(full_text)
            print(f"[LinkedIn] Extracted skills: {skills}")
            
            return JobPosting(
                id=job_id,
                title=title,
                company=company,
                location=location,
                description=description,
                url=url,
                source=JobSource.LINKEDIN,
                skills_required=skills
            )
        except Exception as e:
            print(f"[LinkedIn] Error parsing job card: {e}")
            print(f"[LinkedIn] Card HTML: {str(card)[:200]}...")
            return None

class NaukriScraper:
    """Naukri.com job scraper with Selenium"""
    
    def __init__(self):
        self.base_url = "https://www.naukri.com"
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service
        
        # Configure Chrome for headless browsing with stealth mode
        chrome_options = Options()
        chrome_options.add_argument('--headless=new')  # Use new headless mode
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--disable-gpu')
        chrome_options.add_argument('--window-size=1920,1080')
        chrome_options.add_argument('--disable-blink-features=AutomationControlled')
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        chrome_options.add_argument('user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        
        try:
            import os
            import glob
            
            # Try to find chromedriver executable
            possible_paths = [
                # Known location from find command
                '/Users/mstack/.wdm/drivers/chromedriver/mac64/141.0.7390.122/chromedriver-mac-arm64/chromedriver',
                # Check the downloaded location with glob
                os.path.expanduser('~/.wdm/drivers/chromedriver/mac64/*/chromedriver-mac-arm64/chromedriver'),
                os.path.expanduser('~/.wdm/drivers/chromedriver/mac64/*/chromedriver-mac-x64/chromedriver'),
                # Check common installation locations
                '/usr/local/bin/chromedriver',
                '/opt/homebrew/bin/chromedriver',
                '/usr/bin/chromedriver',
                # Try webdriver-manager as fallback
            ]
            
            driver_path = None
            for pattern in possible_paths:
                if '*' in pattern:
                    matches = glob.glob(pattern)
                    if matches:
                        driver_path = matches[0]
                        break
                elif os.path.exists(pattern) and os.access(pattern, os.X_OK):
                    driver_path = pattern
                    break
            
            if not driver_path:
                # Last resort: try webdriver-manager
                try:
                    from webdriver_manager.chrome import ChromeDriverManager
                    driver_path = ChromeDriverManager().install()
                    # If it returns a directory or wrong file, search for the actual executable
                    if os.path.isdir(driver_path):
                        for root, dirs, files in os.walk(driver_path):
                            for file in files:
                                if file == 'chromedriver' and os.access(os.path.join(root, file), os.X_OK):
                                    driver_path = os.path.join(root, file)
                                    break
                except Exception as e:
                    print(f"[Naukri] webdriver-manager failed: {e}")
            
            if driver_path and os.path.exists(driver_path) and os.access(driver_path, os.X_OK):
                from selenium.webdriver.chrome.service import Service
                service = Service(driver_path)
                self.driver = webdriver.Chrome(service=service, options=chrome_options)
                print(f"[Naukri] Selenium WebDriver initialized with: {driver_path}")
            else:
                raise Exception(f"Could not find chromedriver. Checked paths: {possible_paths}")
                
        except Exception as e:
            print(f"[Naukri] Failed to initialize Selenium: {e}")
            import traceback
            traceback.print_exc()
            print("[Naukri] Falling back to requests (will likely get 0 results)")
            self.driver = None
    
    def search_jobs(self, keywords: str, location: str, max_results: int = 20) -> List[JobPosting]:
        """Search Naukri jobs using Selenium"""
        jobs = []
        
        if not self.driver:
            print("[Naukri] Selenium not available, returning 0 results")
            return []
        
        # Check if session is still active
        try:
            _ = self.driver.current_url
        except Exception:
            print("[Naukri] Session expired, reinitializing driver")
            try:
                from selenium import webdriver
                from selenium.webdriver.chrome.options import Options
                chrome_options = Options()
                chrome_options.add_argument('--headless')
                chrome_options.add_argument('--no-sandbox')
                chrome_options.add_argument('--disable-dev-shm-usage')
                
                # Try to restart driver
                if self.driver:
                    try:
                        self.driver.quit()
                    except:
                        pass
                
                # Find driver path (reuse the same logic from __init__)
                # ... simplified for now, just try to recreate
                self.driver = webdriver.Chrome(options=chrome_options)
                print("[Naukri] Driver reinitialized")
            except Exception as e:
                print(f"[Naukri] Failed to reinitialize driver: {e}")
                return []
        
        try:
            # Simplify keywords
            simple_keywords = simplify_keywords(keywords, max_tokens=3)
            
            # Build URL
            if location and location.strip():
                location_part = location.split(',')[0].strip()
                url = f"{self.base_url}/{simple_keywords}-jobs-in-{location_part}"
            else:
                url = f"{self.base_url}/{simple_keywords}-jobs"
            
            print(f"\n{'='*80}")
            print(f"[NAUKRI] SEARCH REQUEST")
            print(f"{'='*80}")
            print(f"[NAUKRI] Original keywords: {keywords}")
            print(f"[NAUKRI] Simplified keywords: {simple_keywords}")
            print(f"[NAUKRI] Location: {location}")
            print(f"[NAUKRI] Max results: {max_results}")
            print(f"[NAUKRI] GET request: {url}")
            print(f"{'='*80}\n")
            
            self.driver.get(url)
            
            # Add stealth JavaScript to avoid bot detection
            self.driver.execute_cdp_cmd('Network.setUserAgentOverride', {
                "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            })
            
            # Wait for page to load
            import time
            time.sleep(3)
            
            # Execute stealth script
            stealth_script = """
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            window.navigator.chrome = {runtime: {}};
            """
            self.driver.execute_script(stealth_script)
            time.sleep(1)
            
            # Log the actual URL after navigation (in case of redirect)
            actual_url = self.driver.current_url
            print(f"[NAUKRI] Actual URL after load: {actual_url}")
            
            # Get page source after JavaScript execution
            html = self.driver.page_source
            print(f"[NAUKRI] Page loaded, HTML length: {len(html)} chars")
            
            # Parse with BeautifulSoup
            soup = BeautifulSoup(html, 'html.parser')
            
            # Debug: Print first 500 chars of HTML to see what we got
            print(f"[Naukri] First 500 chars of HTML:\n{html[:500]}\n")
            
            # Try multiple selectors for Naukri job cards
            # Naukri uses CSS-in-JS with hashed class names, so we need to find actual job containers
            job_cards = []
            
            # Method 1: Look for divs with job-related data attributes
            job_cards = soup.find_all('div', {'data-job-id': True})
            if job_cards:
                print(f"[Naukri] Found {len(job_cards)} job cards with data-job-id")
            else:
                # Method 2: Look for article tags (common for job cards)
                job_cards = soup.find_all('article')
                if job_cards:
                    print(f"[Naukri] Found {len(job_cards)} articles (likely job cards)")
                else:
                    # Method 3: Find links with job IDs in href
                    job_links = soup.find_all('a', href=lambda x: x and ('/job/' in x or x.startswith('https://www.naukri.com/job') if x else False))
                    if job_links:
                        # Get parent divs of job links
                        for link in job_links[:20]:
                            parent = link.find_parent('div', class_=lambda x: x if x else None)
                            if parent and parent not in job_cards:
                                job_cards.append(parent)
                        print(f"[Naukri] Found {len(job_cards)} job cards via job links")
                    else:
                        print(f"[Naukri] Could not find job cards with any selector")
                        print(f"[Naukri] HTML content check - title: {soup.title.string if soup.title else 'No title'}")
            
            # Parse job cards - first pass: extract basic info and URLs
            print(f"[Naukri] Attempting to parse {len(job_cards)} job cards")
            
            job_data_list = []
            for idx, card in enumerate(job_cards[:max_results]):
                if idx == 0:
                    print(f"[Naukri] First card HTML: {str(card)[:500]}")
                # Parse basic info (without fetching JD)
                job_data = self.parse_naukri_job_basic(card)
                if job_data:
                    job_data_list.append(job_data)
                    print(f"[Naukri] Parsed basic info: {job_data['title']}")
                else:
                    print(f"[Naukri] Failed to parse card {idx}")
            
            # Fetch full job descriptions synchronously (Selenium navigation)
            print(f"[Naukri] Fetching full JDs for {len(job_data_list)} jobs...")
            
            for i, job_data in enumerate(job_data_list):
                print(f"[Naukri] Fetching JD {i+1}/{len(job_data_list)}: {job_data['title']}")
                full_description = self.fetch_job_description(job_data, index=i)
                job_data['description'] = full_description
            
            print(f"[Naukri] Fetched all JDs, creating JobPosting objects")
            
            # Create JobPosting objects from job_data (now with full descriptions)
            for job_data in job_data_list:
                job = JobPosting(
                    id=job_data['id'],
                    title=job_data['title'],
                    company=job_data['company'],
                    location=job_data['location'],
                    url=job_data['url'],
                    description=job_data['description'],
                    source=JobSource.NAUKRI,
                    skills_required=job_data.get('skills_required', [])
                )
                jobs.append(job)
                    
        except Exception as e:
            print(f"[Naukri] error: {e}")
            print(f"[Naukri] Full error details: {type(e).__name__}: {str(e)}")
        
        print(f"[Naukri] Returning {len(jobs)} jobs")
        return jobs
    
    def parse_naukri_job(self, card, search_url: str = None) -> Optional[JobPosting]:
        """Parse Naukri job card from HTML - updated for modern Naukri structure"""
        try:
            # Extract job ID from data attribute
            job_id_attr = card.get('data-job-id')
            job_id = f"naukri_{job_id_attr}" if job_id_attr else f"naukri_{int(time.time())}"
            
            # Find title link - Naukri uses class='title'
            title_elem = card.find('a', class_='title')
            
            if not title_elem:
                return None
            
            title = title_elem.get_text(strip=True) or title_elem.get('title', '')
            url = title_elem.get('href', '')
            
            if url and not url.startswith('http'):
                url = urljoin('https://www.naukri.com', url)
            
            # Find company - Naukri puts it in an <a> with class='comp-name'
            company_elem = card.find('a', class_='comp-name')
            if not company_elem:
                # Fallback: look for link with /jobs-careers in href
                company_elem = card.find('a', href=lambda x: x and '/jobs-careers' in str(x) if x else False)
            
            company = company_elem.get_text(strip=True) if company_elem else 'N/A'
            
            # Find location - Naukri uses class='locWdth' 
            location_elem = card.find('span', class_='locWdth')
            if not location_elem:
                # Fallback: find span with 'loc-wrap' class
                location_elem = card.find('span', class_=lambda x: x and 'loc-wrap' in str(x) if x else False)
            
            location = location_elem.get_text(strip=True) if location_elem else 'N/A'
            
            # Find job description - Naukri puts a snippet in span with class='job-desc'
            desc_elem = card.find('span', class_='job-desc')
            description_snippet = desc_elem.get_text(strip=True) if desc_elem else ''
            
            # Fetch full job description from job detail page
            description = description_snippet  # Use snippet by default
            
            if url and url.strip() and search_url:
                try:
                    print(f"[Naukri] Fetching full JD from: {url}")
                    self.driver.get(url)
                    import time
                    time.sleep(1)  # Reduced from 2 to 1 second
                    
                    detail_html = self.driver.page_source
                    detail_soup = BeautifulSoup(detail_html, 'html.parser')
                    
                    # Try multiple selectors for full description
                    full_desc_elem = detail_soup.find('div', class_='job-description')
                    if not full_desc_elem:
                        full_desc_elem = detail_soup.find('div', class_='jd-container')
                    if not full_desc_elem:
                        full_desc_elem = detail_soup.find('div', {'data-tab': 'jd'})
                    if not full_desc_elem:
                        full_desc_elem = detail_soup.find('div', class_='job-desc')
                    
                    if full_desc_elem:
                        # Preserve HTML structure instead of plain text
                        description = clean_html_preserve_structure(full_desc_elem)
                        print(f"[Naukri] Fetched full JD (HTML), length: {len(description)}")
                    else:
                        print(f"[Naukri] Full JD not found, using snippet")
                    
                    # Navigate back to search results
                    print(f"[Naukri] Returning to search results")
                    self.driver.get(search_url)
                    time.sleep(1)
                except Exception as e:
                    print(f"[Naukri] Error fetching full JD: {e}, using snippet")
                    # Try to get back to search results even if there was an error
                    if search_url:
                        try:
                            self.driver.get(search_url)
                        except:
                            pass
            
            # If description is too short, use a fallback
            if not description or len(description) < 20:
                description = f"Job description available on Naukri for {title} position at {company} in {location}"
            
            if not title:
                return None
            
            print(f"[Naukri] Parsed: {title} at {company} in {location}")
            
            return JobPosting(
                id=job_id,
                title=title,
                company=company,
                location=location,
                description=description,
                url=url,
                source=JobSource.NAUKRI,
                skills_required=[]
            )
        except Exception as e:
            print(f"[Naukri] Error parsing job card: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def parse_naukri_job_basic(self, card) -> Optional[Dict]:
        """Parse Naukri job card basic info without fetching full JD"""
        try:
            # Extract job ID from data attribute
            job_id_attr = card.get('data-job-id')
            job_id = f"naukri_{job_id_attr}" if job_id_attr else f"naukri_{int(time.time())}"
            
            # Find title link - Naukri uses class='title'
            title_elem = card.find('a', class_='title')
            if not title_elem:
                return None
            
            title = title_elem.get_text(strip=True) or title_elem.get('title', '')
            url = title_elem.get('href', '')
            
            if url and not url.startswith('http'):
                url = urljoin('https://www.naukri.com', url)
            
            # Find company
            company_elem = card.find('a', class_='comp-name')
            if not company_elem:
                company_elem = card.find('a', href=lambda x: x and '/jobs-careers' in str(x) if x else False)
            
            company = company_elem.get_text(strip=True) if company_elem else 'N/A'
            
            # Find location
            location_elem = card.find('span', class_='locWdth')
            if not location_elem:
                location_elem = card.find('span', class_=lambda x: x and 'loc-wrap' in str(x) if x else False)
            
            location = location_elem.get_text(strip=True) if location_elem else 'N/A'
            
            # Get snippet
            desc_elem = card.find('span', class_='job-desc')
            description_snippet = desc_elem.get_text(strip=True) if desc_elem else ''
            
            if not title:
                return None
            
            return {
                'id': job_id,
                'title': title,
                'company': company,
                'location': location,
                'url': url,
                'description': description_snippet
            }
        except Exception as e:
            print(f"[Naukri] Error parsing job card basic info: {e}")
            return None
    
    def extract_skills_from_jd(self, jd_text: str) -> List[str]:
        """Extract key skills from job description text dynamically"""
        import re
        
        skills = []
        
        # Pattern 1: Look for lines with ":" that mention skills
        for line in jd_text.split('\n'):
            line = line.strip()
            # Look for lines with ":" that might list skills
            if ':' in line and any(keyword in line.lower() for keyword in ['skill', 'experience', 'knowledge', 'proficiency', 'requirement']):
                # Extract skills after the colon
                parts = line.split(':')
                if len(parts) > 1:
                    skill_text = parts[1].strip()
                    # Split by comma, semicolon, "and", or slash
                    for skill in re.split(r'[,\;\/]|and\s+', skill_text):
                        skill = skill.strip()
                        if len(skill) > 2 and len(skill) < 50:
                            skills.append(skill)
        
        # Pattern 2: Look for "Experience with/in/on" patterns
        patterns = [
            r'experience\s+(?:in|with|on)\s+([A-Z][^.,;\n]+)',
            r'knowledge\s+(?:of|in)\s+([A-Z][^.,;\n]+)',
            r'proficient\s+(?:in|with)\s+([A-Z][^.,;\n]+)',
            r'hands-on\s+experience\s+in\s+([^.,;\n]+)',
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, jd_text, re.IGNORECASE)
            for match in matches:
                skill = match.strip()
                if len(skill) > 2 and len(skill) < 50:
                    skills.append(skill)
        
        # Pattern 3: Look for technical terms (typically capitalized, possibly with hyphens)
        # Find capitalized words or phrases that look like skills
        tech_pattern = r'\b[A-Z][A-Za-z-]+\s*(?:/|\+|&)\s*[A-Z][A-Za-z-]+|\b[A-Z][A-Za-z]+(?:[\/\-][A-Z][A-Za-z]+)+\b'
        tech_matches = re.findall(tech_pattern, jd_text)
        skills.extend([m.strip() for m in tech_matches if len(m.strip()) > 2 and len(m.strip()) < 50])
        
        # Remove duplicates and return
        return list(set(skills[:30]))  # Return unique skills, max 30
    
    def fetch_job_description_async(self, job_data: Dict, index: int = 0) -> str:
        """Fetch full job description using requests (for parallel fetching, doesn't use Selenium)"""
        try:
            url = job_data.get('url', '')
            if not url:
                return job_data.get('description', '')
            
            print(f"[Naukri] Fetching JD async from: {url}")
            
            # Use requests instead of Selenium for parallel fetching
            import requests
            from bs4 import BeautifulSoup
            
            session = requests.Session()
            session.headers.update({
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            })
            
            response = session.get(url, timeout=10)
            response.raise_for_status()
            
            # Ensure UTF-8 encoding
            if response.encoding and response.encoding.lower() != 'utf-8':
                response.encoding = 'utf-8'
            
            detail_soup = BeautifulSoup(response.text, 'html.parser', from_encoding='utf-8')
            
            # Debug: Check HTML length
            print(f"[Naukri] Async fetch HTML length: {len(response.text)}")
            
            # Get JD description - try multiple selectors
            full_desc_elem = detail_soup.find('div', class_=lambda x: x and 'dang-inner-html' in str(x) if x else False)
            
            if not full_desc_elem:
                # Try alternative selector
                full_desc_elem = detail_soup.find('div', {'data-tab': 'jd'})
            if not full_desc_elem:
                # Try getting any div with 'job-desc' in class
                full_desc_elem = detail_soup.find('div', class_=lambda x: x and 'job-desc' in str(x).lower() if x else False)
            
            if full_desc_elem:
                # Preserve HTML structure instead of plain text
                description = clean_html_preserve_structure(full_desc_elem)
                # Keep a plain text version for skills extraction
                description_text = full_desc_elem.get_text(separator=' ', strip=True)
                description_text = ' '.join(description_text.split())
                
                # Extract skills from tags
                skills_from_tags = []
                tags_section = detail_soup.find('ul', class_=lambda x: x and 'tags-and-skills' in str(x) if x else False)
                if tags_section:
                    tags = tags_section.find_all('li', class_=lambda x: x and 'skills-dot' in str(x) if x else False)
                    for tag in tags:
                        skill = tag.get_text(strip=True)
                        if skill:
                            skills_from_tags.append(skill)
                
                # Extract skills from text (use plain text version for better extraction)
                skills_from_text = self.extract_skills_from_jd(description_text)
                all_skills = list(set(skills_from_tags + skills_from_text))
                job_data['skills_required'] = all_skills[:30]
                
                print(f"[Naukri] Extracted skills async: {all_skills[:10]}")
                print(f"[Naukri] Fetched JD async, length: {len(description)} chars")
                
                return description if len(description) > 50 else job_data.get('description', '')
            else:
                print(f"[Naukri] Full JD not found async for {job_data['title']}, using snippet")
                return job_data.get('description', '')
        except Exception as e:
            print(f"[Naukri] Error fetching JD async from {job_data.get('url', '')}: {e}")
            return job_data.get('description', '')
    
    def fetch_job_description(self, job_data: Dict, index: int = 0) -> str:
        """Fetch full job description from job detail page"""
        try:
            url = job_data.get('url', '')
            if not url:
                return job_data.get('description', '')
            
            print(f"[Naukri] Fetching JD from: {url}")
            
            # Use Selenium to get full JS-rendered content
            # Save current URL to restore later
            current_url = self.driver.current_url
            
            try:
                self.driver.get(url)
                time.sleep(0.5)  # Reduced wait time - just enough for initial render
                
                # Get the rendered HTML
                detail_html = self.driver.page_source
                detail_soup = BeautifulSoup(detail_html, 'html.parser')
                
            except Exception as e:
                print(f"[Naukri] Error fetching with Selenium: {e}")
                import requests
                session = requests.Session()
                session.headers.update({
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                })
                response = session.get(url, timeout=10)
                
                # Ensure UTF-8 encoding
                if response.encoding and response.encoding.lower() != 'utf-8':
                    response.encoding = 'utf-8'
                
                detail_soup = BeautifulSoup(response.text, 'html.parser', from_encoding='utf-8')
            finally:
                # Always restore the original search page
                try:
                    self.driver.get(current_url)
                    time.sleep(0.5)  # Reduced wait time
                except:
                    pass
            
            # Try multiple selectors for full description - Naukri modern structure
            full_desc_elem = None
            
            # Try common Naukri JD container classes and data attributes
            # Found actual class: styles_JDC__dang-inner-html__h0K4t
            selectors = [
                ('div', {'class': lambda x: x and 'dang-inner-html' in str(x) if x else False}),
                ('div', {'data-tab': 'jd'}),
                ('div', {'class': 'jd-sec'}),
                ('div', {'id': 'JD'}),
                ('div', {'class': 'jd-details'}),
                ('div', {'data-testid': 'jobDescriptionText'}),
                ('div', {'class': 'job-desc'}),
                ('div', {'class': lambda x: x and 'description' in str(x).lower() if x else False}),
                ('section', {'class': 'job-desc'}),
                ('article', {}),  # Some JDs are in article tags
            ]
            
            for tag, attrs in selectors:
                try:
                    if isinstance(attrs, dict) and 'class' in attrs and callable(attrs['class']):
                        full_desc_elem = detail_soup.find(tag, class_=attrs['class'])
                    else:
                        full_desc_elem = detail_soup.find(tag, attrs)
                    if full_desc_elem and full_desc_elem.get_text(strip=True):
                        # Check if we got meaningful content (more than just whitespace)
                        text = full_desc_elem.get_text(strip=True)
                        if len(text) > 50:
                            print(f"[Naukri] Found description using selector: {tag} {attrs}")
                            break
                except Exception as e:
                    continue
            
            # If still not found, try getting all text with certain keywords
            if not full_desc_elem:
                # Try to find any div containing job description keywords
                all_divs = detail_soup.find_all('div')
                for div in all_divs:
                    text = div.get_text(strip=True)
                    # Look for divs that might contain job description
                    if ('responsibilities' in text.lower() or 'requirements' in text.lower() or 
                        'qualifications' in text.lower()) and len(text) > 100:
                        full_desc_elem = div
                        print(f"[Naukri] Found description using content-based matching")
                        break
            
            if full_desc_elem:
                # Preserve HTML structure instead of plain text
                description = clean_html_preserve_structure(full_desc_elem)
                
                # If description is too short (less than 100 chars), use the element as-is
                # (already extracted with HTML structure)
                if len(description.strip()) < 100:
                    # Fallback: try getting parent or wrapper element
                    parent = full_desc_elem.find_parent(['div', 'section', 'article'])
                    if parent:
                        description = clean_html_preserve_structure(parent)
                
                # Extract key skills from JD (both from tags and description text)
                # First try to find the skills tags on the page
                skills_from_tags = []
                tags_section = detail_soup.find('ul', class_=lambda x: x and 'tags-and-skills' in str(x) if x else False)
                if tags_section:
                    tags = tags_section.find_all('li', class_=lambda x: x and 'skills-dot' in str(x) if x else False)
                    for tag in tags:
                        skill = tag.get_text(strip=True)
                        if skill:
                            skills_from_tags.append(skill)
                
                # Also extract skills from JD text
                skills_from_text = self.extract_skills_from_jd(description)
                
                # Combine both (tags take priority)
                all_skills = list(set(skills_from_tags + skills_from_text))
                job_data['skills_required'] = all_skills[:30]  # Max 30 skills
                print(f"[Naukri] Extracted skills (from tags + text): {all_skills[:30]}")
                
                print(f"[Naukri] Fetched full JD for {job_data['title']}, length: {len(description)} chars")
                if len(description) > 100:
                    print(f"[Naukri] JD preview: {description[:200]}...")
                return description if len(description) > 50 else job_data.get('description', '')
            else:
                print(f"[Naukri] Full JD not found for {job_data['title']}, using snippet")
                return job_data.get('description', '')
        except Exception as e:
            print(f"[Naukri] Error fetching JD from {job_data.get('url', '')}: {e}")
            import traceback
            traceback.print_exc()
            return job_data.get('description', '')

class InstaHyreScraper:
    """InstaHyre job scraper - Fixed with web scraping approach"""
    
    def __init__(self):
        self.base_url = "https://www.instahyre.com/search"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
    
    def search_jobs(self, keywords: str, location: str, max_results: int = 20) -> List[JobPosting]:
        """Search InstaHyre jobs using web scraping"""
        jobs = []
        
        try:
            # Simplify keywords
            simple_keywords = simplify_keywords(keywords, max_tokens=2)
            
            params = {
                'q': simple_keywords,
                'location': location
            }
            
            print(f"[InstaHyre] GET {self.base_url} q='{simple_keywords}' location='{location}'")
            response = self.session.get(self.base_url, params=params, timeout=15)
            response.raise_for_status()
            
            # Parse HTML response
            soup = BeautifulSoup(response.text, 'html.parser')
            job_cards = soup.find_all('div', class_='job-card')
            
            for card in job_cards[:max_results]:
                job = self.parse_instahyre_job(card)
                if job:
                    jobs.append(job)
                    
        except Exception as e:
            print(f"[InstaHyre] error: {e}")
        
        return jobs
    
    def parse_instahyre_job(self, card) -> Optional[JobPosting]:
        """Parse InstaHyre job card from HTML"""
        try:
            # Extract job details from HTML elements
            title_elem = card.find('h3', class_='job-title')
            company_elem = card.find('div', class_='company-name')
            location_elem = card.find('div', class_='location')
            link_elem = card.find('a')
            
            if not all([title_elem, company_elem]):
                return None
            
            title = title_elem.get_text(strip=True)
            company = company_elem.get_text(strip=True)
            location = location_elem.get_text(strip=True) if location_elem else 'N/A'
            url = urljoin('https://www.instahyre.com', link_elem.get('href', '')) if link_elem else ''
            
            # Extract job ID from URL
            job_id = f"instahyre_{url.split('/')[-1]}" if url else f"instahyre_{int(time.time())}"
            
            return JobPosting(
                id=job_id,
                title=title,
                company=company,
                location=location,
                description=f"InstaHyre job posting for {title} at {company}",
                url=url,
                source=JobSource.INSTAHYRE,
                skills_required=extract_skills_from_text(f"{title} {company}")
            )
        except Exception as e:
            print(f"Error parsing InstaHyre job: {e}")
            return None

class IndeedScraper:
    """Indeed.com job scraper using Selenium to bypass bot detection"""
    
    def __init__(self):
        self.base_url = "https://www.indeed.com/jobs"
        self.driver = None
        
    def _init_driver(self):
        """Initialize Selenium driver with stealth mode"""
        if self.driver is not None:
            return
            
        try:
            from selenium import webdriver
            from selenium.webdriver.chrome.options import Options
            from selenium.webdriver.chrome.service import Service
            import os
            
            chrome_options = Options()
            chrome_options.add_argument('--headless=new')
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            chrome_options.add_argument('--disable-blink-features=AutomationControlled')
            chrome_options.add_argument('--window-size=1920,1080')
            chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
            chrome_options.add_experimental_option('useAutomationExtension', False)
            chrome_options.add_argument('user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
            
            # Get ChromeDriver path - try multiple approaches
            driver_path = None
            
            # First try: Use the actual chromedriver we found
            possible_path = '/Users/mstack/.wdm/drivers/chromedriver/mac64/141.0.7390.122/chromedriver-mac-arm64/chromedriver'
            if os.path.isfile(possible_path):
                driver_path = possible_path
                print(f"[Indeed] Using hardcoded ChromeDriver: {driver_path}")
            else:
                # Second try: Search for chromedriver
                from pathlib import Path
                home = Path.home()
                for chromedriver in (home / '.wdm/drivers/chromedriver').rglob('chromedriver'):
                    if chromedriver.is_file() and os.access(chromedriver, os.X_OK):
                        driver_path = str(chromedriver)
                        print(f"[Indeed] Found ChromeDriver: {driver_path}")
                        break
                
                # Third try: Use webdriver_manager as fallback
                if not driver_path:
                    from webdriver_manager.chrome import ChromeDriverManager
                    driver_path = ChromeDriverManager().install()
                    print(f"[Indeed] Using ChromeDriverManager: {driver_path}")
            
            if driver_path:
                service = Service(driver_path)
                self.driver = webdriver.Chrome(service=service, options=chrome_options)
                
                # Hide webdriver property
                self.driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
                    'source': 'Object.defineProperty(navigator, "webdriver", {get: () => undefined})'
                })
                
                print(f"[Indeed] Selenium WebDriver initialized successfully")
            else:
                raise Exception("Could not find ChromeDriver")
                
        except Exception as e:
            print(f"[Indeed] Error initializing Selenium: {e}")
            raise
    
    def search_jobs(self, keywords: str, location: str, max_results: int = 20) -> List[JobPosting]:
        """Search Indeed in this order: RSS -> HTTP HTML -> (optional) Selenium."""
        jobs = []

        # Prepare inputs for all strategies
        simple_keywords = simplify_keywords(keywords, max_tokens=2)
        domain = "indeed.com"
        loc_lower = (location or "").lower()
        if (not loc_lower) or ("india" in loc_lower) or ("bengaluru" in loc_lower) or ("bangalore" in loc_lower) or ("mumbai" in loc_lower) or ("delhi" in loc_lower):
            domain = "indeed.co.in"

        # 1) Try RSS first (fastest and least blocked)
        try:
            print("[Indeed] Trying RSS strategy...")
            rss_jobs = self._search_via_rss(simple_keywords, location, max_results)
            if rss_jobs:
                print(f"[Indeed] RSS returned {len(rss_jobs)} jobs")
                return rss_jobs[:max_results]
            print("[Indeed] RSS returned 0 jobs")
        except Exception as e:
            print(f"[Indeed] RSS strategy failed: {e}")

        # 2) Try plain HTTP GET + HTML parsing (with curl fallback for TLS issues)
        try:
            from urllib.parse import quote_plus
            search_url = f"https://www.{domain}/jobs"
            params = {
                'q': simple_keywords,
                'l': location,
                'sort': 'date',
                'fromage': '7'
            }
            param_string = '&'.join([f"{k}={quote_plus(str(v))}" for k, v in params.items()])
            full_url = f"{search_url}?{param_string}"
            import requests as req
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': f'https://www.{domain}/',
            }
            print(f"[Indeed][HTTP] GET {full_url}")
            html_text = ''
            try:
                r = req.get(full_url, headers=headers, timeout=15)
                print(f"[Indeed][HTTP] Status: {r.status_code}, len={len(r.text)}")
                if r.ok:
                    html_text = r.text
            except Exception as e_http:
                print(f"[Indeed][HTTP] requests failed: {e_http}")

            # Fallback to curl if requests failed or content too short
            if not html_text or len(html_text) < 500:
                print("[Indeed][HTTP] Trying via curl fallback...")
                html_text = self._curl_get(full_url, headers)
                print(f"[Indeed][HTTP] curl len={len(html_text)}")

            # Final fallback: cloudscraper (handles Cloudflare challenges)
            if (not html_text or len(html_text) < 500) and self._cloudscraper_available():
                try:
                    print("[Indeed][HTTP] Trying via cloudscraper...")
                    import cloudscraper
                    scraper = cloudscraper.create_scraper(browser={
                        'browser': 'chrome',
                        'platform': 'darwin',
                        'mobile': False
                    })
                    html_text = scraper.get(full_url, headers=headers, timeout=20).text
                    print(f"[Indeed][HTTP] cloudscraper len={len(html_text)}")
                except Exception as e_cs:
                    print(f"[Indeed][HTTP] cloudscraper failed: {e_cs}")

            if html_text and len(html_text) > 1000:
                # Save fetched HTML for quick inspection
                try:
                    with open('/tmp/indeed_search.html', 'w') as f:
                        f.write(html_text)
                    print("[Indeed][HTTP] Saved HTML to /tmp/indeed_search.html")
                except Exception as save_err:
                    print(f"[Indeed][HTTP] Failed to save HTML: {save_err}")

                rsoup = BeautifulSoup(html_text, 'html.parser')
                job_cards = rsoup.find_all('div', class_='job_seen_beacon')
                print(f"[Indeed][HTTP] Parsed {len(job_cards)} cards via requests")
                if not job_cards:
                    job_cards = rsoup.find_all('div', {'data-testid': 'job-card'})
                    print(f"[Indeed][HTTP] Alt selector cards: {len(job_cards)}")
                # New selector set for Indeed modern layout
                if not job_cards:
                    anchors = rsoup.select('a.tapItem')
                    print(f"[Indeed][HTTP] Found {len(anchors)} anchors with class 'tapItem'")
                    for a in anchors[:max_results]:
                        job = self.parse_indeed_anchor(a)
                        if job:
                            jobs.append(job)
                # Additional selector fallbacks (table layout/content blocks)
                if not jobs:
                    results = rsoup.select('td.resultContent')
                    print(f"[Indeed][HTTP] Found {len(results)} td.resultContent blocks")
                    for block in results[:max_results]:
                        try:
                            title_elem = block.select_one('h2.jobTitle')
                            company_elem = block.select_one('span.companyName')
                            location_elem = block.select_one('div.companyLocation')
                            link_elem = block.select_one('a[href]')
                            if link_elem and title_elem and company_elem:
                                url = urljoin('https://www.indeed.com', link_elem.get('href', ''))
                                job = JobPosting(
                                    id=f"indeed_{url.split('/')[-1]}",
                                    title=title_elem.get_text(strip=True),
                                    company=company_elem.get_text(strip=True),
                                    location=location_elem.get_text(strip=True) if location_elem else 'N/A',
                                    description=f"Indeed job posting for {title_elem.get_text(strip=True)} at {company_elem.get_text(strip=True)}",
                                    url=url,
                                    source=JobSource.INDEED,
                                    skills_required=extract_skills_from_text(f"{title_elem.get_text(strip=True)} {company_elem.get_text(strip=True)}")
                                )
                                jobs.append(job)
                        except Exception:
                            continue
                else:
                    for card in job_cards[:max_results]:
                        job = self.parse_indeed_job(card)
                        if job:
                            jobs.append(job)
                if jobs:
                    print(f"[Indeed][HTTP] Returning {len(jobs)} jobs")
                    return jobs[:max_results]
                # If HTTP path returned no jobs, skip Selenium (it's failing and slow) and return empty fast
                print("[Indeed][HTTP] No jobs parsed; skipping Selenium due to environment issues")
                print("[Indeed] Returning 0 jobs")
                return jobs
        except Exception as e:
            print(f"[Indeed][HTTP] strategy failed: {e}")

        # 3) Selenium step disabled for Indeed due to environment issues (ChromeDriver fails here)

        print(f"[Indeed] Returning {len(jobs)} jobs")
        return jobs
    
    def parse_indeed_job(self, card) -> Optional[JobPosting]:
        """Parse Indeed job card from HTML"""
        try:
            # Extract job details from HTML elements
            title_elem = card.find('h2', class_='jobTitle')
            company_elem = card.find('span', class_='companyName')
            location_elem = card.find('div', class_='companyLocation')
            link_elem = card.find('a', class_='jcs-JobTitle')
            
            if not all([title_elem, company_elem]):
                return None
            
            title = title_elem.get_text(strip=True)
            company = company_elem.get_text(strip=True)
            location = location_elem.get_text(strip=True) if location_elem else 'N/A'
            url = urljoin('https://www.indeed.com', link_elem.get('href', '')) if link_elem else ''
            
            # Extract job ID from URL
            job_id = f"indeed_{url.split('/')[-1]}" if url else f"indeed_{int(time.time())}"
            
            return JobPosting(
                id=job_id,
                title=title,
                company=company,
                location=location,
                description=f"Indeed job posting for {title} at {company}",
                url=url,
                source=JobSource.INDEED,
                skills_required=extract_skills_from_text(f"{title} {company}")
            )
        except Exception as e:
            print(f"Error parsing Indeed job: {e}")
            return None

    def parse_indeed_anchor(self, a_tag) -> Optional[JobPosting]:
        """Parse Indeed job from anchor-based modern layout (a.tapItem)"""
        try:
            title_elem = a_tag.select_one('h2.jobTitle') or a_tag.get('aria-label')
            title = title_elem.get_text(strip=True) if hasattr(title_elem, 'get_text') else (title_elem or 'N/A')
            company_elem = a_tag.select_one('span.companyName')
            company = company_elem.get_text(strip=True) if company_elem else 'N/A'
            location_elem = a_tag.select_one('div.companyLocation')
            location = location_elem.get_text(strip=True) if location_elem else 'N/A'
            href = a_tag.get('href', '')
            url = urljoin('https://www.indeed.com', href) if href else ''
            job_id = f"indeed_{url.split('/')[-1]}" if url else f"indeed_{int(time.time())}"
            return JobPosting(
                id=job_id,
                title=title,
                company=company,
                location=location,
                description=f"Indeed job posting for {title} at {company}",
                url=url,
                source=JobSource.INDEED,
                skills_required=extract_skills_from_text(f"{title} {company}")
            )
        except Exception as e:
            print(f"Error parsing Indeed anchor: {e}")
            return None

    def _search_via_rss(self, keywords: str, location: str, max_results: int) -> List[JobPosting]:
        """Fallback: use Indeed RSS feed to fetch jobs when HTML access is blocked."""
        try:
            import requests
            from urllib.parse import quote_plus
            # Match RSS domain to region as well
            loc_lower = (location or "").lower()
            domain = "indeed.com"
            if (not loc_lower) or ("india" in loc_lower) or ("bengaluru" in loc_lower) or ("bangalore" in loc_lower) or ("mumbai" in loc_lower) or ("delhi" in loc_lower):
                domain = "indeed.co.in"
            rss_url = f"https://www.{domain}/rss?q={quote_plus(keywords)}&l={quote_plus(location or '')}"
            print(f"[Indeed][RSS] GET {rss_url}")
            text = ''
            try:
                resp = requests.get(rss_url, timeout=15, headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                })
                resp.raise_for_status()
                text = resp.text
            except Exception as e:
                print(f"[Indeed][RSS] requests failed: {e}")
                # Fallback to curl
                text = self._curl_get(rss_url, {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                })
                print(f"[Indeed][RSS] curl len={len(text)}")
            # Final fallback: cloudscraper
            if (not text or len(text) < 100) and self._cloudscraper_available():
                try:
                    print("[Indeed][RSS] Trying via cloudscraper...")
                    import cloudscraper
                    scraper = cloudscraper.create_scraper()
                    text = scraper.get(rss_url, timeout=20).text
                    print(f"[Indeed][RSS] cloudscraper len={len(text)}")
                except Exception as e_cs:
                    print(f"[Indeed][RSS] cloudscraper failed: {e_cs}")
            # Parse RSS XML
            soup = BeautifulSoup(text, 'xml')
            items = soup.find_all('item')
            print(f"[Indeed][RSS] Found {len(items)} items")
            jobs: List[JobPosting] = []
            for item in items[:max_results]:
                title = (item.find('title').get_text(strip=True) if item.find('title') else 'N/A')
                link = (item.find('link').get_text(strip=True) if item.find('link') else '')
                description = (item.find('description').get_text(strip=True) if item.find('description') else '')
                company = 'N/A'
                # Attempt to extract company from title pattern "Job Title - Company"
                if ' - ' in title:
                    parts = title.split(' - ', 1)
                    if len(parts) == 2:
                        title, company = parts[0].strip(), parts[1].strip()
                job = JobPosting(
                    id=f"indeed_{hash(link) if link else int(time.time())}",
                    title=title,
                    company=company,
                    location=location or 'N/A',
                    description=strip_html(description)[:1000] if description else f"Indeed job: {title} at {company}",
                    url=link,
                    source=JobSource.INDEED,
                    skills_required=extract_skills_from_text(f"{title} {company} {description}")
                )
                jobs.append(job)
            return jobs
        except Exception as e:
            print(f"[Indeed][RSS] Failed: {e}")
            return []

    def _curl_get(self, url: str, headers: Dict[str, str]) -> str:
        """Fetch using system curl to bypass TLS issues."""
        try:
            import subprocess, shlex
            # First attempt: normal curl
            cmd = ['curl', '-sL', url]
            if 'User-Agent' in headers:
                cmd += ['-A', headers['User-Agent']]
            if 'Accept' in headers:
                cmd += ['-H', f"Accept: {headers['Accept']}"]
            if 'Referer' in headers:
                cmd += ['-e', headers['Referer']]
            print(f"[Indeed][curl] {' '.join(shlex.quote(c) for c in cmd)}")
            try:
                out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=20)
                text = out.decode('utf-8', errors='ignore')
                if len(text) > 100:
                    return text
            except Exception as e1:
                print(f"[Indeed][curl] normal failed: {e1}")

            # Second attempt: force TLS1.2
            cmd_tls = cmd[:]
            cmd_tls.insert(1, '--tlsv1.2')
            print(f"[Indeed][curl] TLS1.2: {' '.join(shlex.quote(c) for c in cmd_tls)}")
            try:
                out = subprocess.check_output(cmd_tls, stderr=subprocess.STDOUT, timeout=20)
                text = out.decode('utf-8', errors='ignore')
                if len(text) > 100:
                    return text
            except Exception as e2:
                print(f"[Indeed][curl] tls1.2 failed: {e2}")

            # Third attempt: allow insecure (as last resort)
            cmd_insec = cmd_tls[:]
            cmd_insec.insert(1, '-k')
            print(f"[Indeed][curl] INSECURE: {' '.join(shlex.quote(c) for c in cmd_insec)}")
            try:
                out = subprocess.check_output(cmd_insec, stderr=subprocess.STDOUT, timeout=20)
                text = out.decode('utf-8', errors='ignore')
                return text
            except Exception as e3:
                print(f"[Indeed][curl] insecure failed: {e3}")
                return ''
        except Exception as e:
            print(f"[Indeed][curl] failed: {e}")
            return ''

    def _cloudscraper_available(self) -> bool:
        try:
            import cloudscraper  # noqa: F401
            return True
        except Exception:
            return False

class RemoteJobsScraper:
    """RemoteJobs.com scraper"""
    
    def __init__(self):
        self.base_url = "https://remotejobs.com/api/jobs"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def search_jobs(self, keywords: str, location: str, max_results: int = 20) -> List[JobPosting]:
        """Search RemoteJobs.com"""
        jobs = []
        
        try:
            params = {
                'search': keywords,
                'limit': min(max_results, 50)
            }
            
            response = self.session.get(self.base_url, params=params, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            for job_data in data.get('jobs', [])[:max_results]:
                job = self.parse_remotejobs_job(job_data)
                if job:
                    jobs.append(job)
                    
        except Exception as e:
            print(f"[RemoteJobs] error: {e}")
        
        return jobs
    
    def parse_remotejobs_job(self, job_data: Dict[str, Any]) -> Optional[JobPosting]:
        """Parse RemoteJobs.com job data"""
        try:
            return JobPosting(
                id=f"remotejobs_{job_data.get('id', '')}",
                title=job_data.get('title', 'N/A'),
                company=job_data.get('company', 'N/A'),
                location='Remote',
                description=job_data.get('description', ''),
                url=job_data.get('url', ''),
                source=JobSource.REMOTEJOBS,
                skills_required=extract_skills_from_text(
                    f"{job_data.get('title', '')} {job_data.get('description', '')}"
                )
            )
        except Exception as e:
            print(f"Error parsing RemoteJobs job: {e}")
            return None

class FoundItScraper:
    """FoundIt (formerly Monster) job scraper"""
    
    def __init__(self):
        self.base_url = "https://www.foundit.in/api/jobs"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def search_jobs(self, keywords: str, location: str, max_results: int = 20) -> List[JobPosting]:
        """Search FoundIt jobs"""
        jobs = []
        
        try:
            params = {
                'q': keywords,
                'where': location,
                'page': 1,
                'limit': min(max_results, 50)
            }
            
            response = self.session.get(self.base_url, params=params, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            for job_data in data.get('jobs', [])[:max_results]:
                job = self.parse_foundit_job(job_data)
                if job:
                    jobs.append(job)
                    
        except Exception as e:
            print(f"[FoundIt] error: {e}")
        
        return jobs
    
    def parse_foundit_job(self, job_data: Dict[str, Any]) -> Optional[JobPosting]:
        """Parse FoundIt job data"""
        try:
            return JobPosting(
                id=f"foundit_{job_data.get('id', '')}",
                title=job_data.get('title', 'N/A'),
                company=job_data.get('company', 'N/A'),
                location=job_data.get('location', 'N/A'),
                description=job_data.get('description', ''),
                url=job_data.get('url', ''),
                source=JobSource.FOUNDIT,
                skills_required=extract_skills_from_text(
                    f"{job_data.get('title', '')} {job_data.get('description', '')}"
                )
            )
        except Exception as e:
            print(f"Error parsing FoundIt job: {e}")
            return None

class MonsterScraper:
    """Monster.com job scraper"""
    
    def __init__(self):
        self.base_url = "https://www.monster.com/api/jobs"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def search_jobs(self, keywords: str, location: str, max_results: int = 20) -> List[JobPosting]:
        """Search Monster jobs"""
        jobs = []
        
        try:
            params = {
                'q': keywords,
                'where': location,
                'page': 1,
                'limit': min(max_results, 50)
            }
            
            response = self.session.get(self.base_url, params=params, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            for job_data in data.get('jobs', [])[:max_results]:
                job = self.parse_monster_job(job_data)
                if job:
                    jobs.append(job)
                    
        except Exception as e:
            print(f"[Monster] error: {e}")
        
        return jobs
    
    def parse_monster_job(self, job_data: Dict[str, Any]) -> Optional[JobPosting]:
        """Parse Monster job data"""
        try:
            return JobPosting(
                id=f"monster_{job_data.get('id', '')}",
                title=job_data.get('title', 'N/A'),
                company=job_data.get('company', 'N/A'),
                location=job_data.get('location', 'N/A'),
                description=job_data.get('description', ''),
                url=job_data.get('url', ''),
                source=JobSource.MONSTER,
                skills_required=extract_skills_from_text(
                    f"{job_data.get('title', '')} {job_data.get('description', '')}"
                )
            )
        except Exception as e:
            print(f"Error parsing Monster job: {e}")
            return None

class HristScraper:
    """Hrist.com job scraper"""
    
    def __init__(self):
        self.base_url = "https://www.hrist.com/api/jobs"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def search_jobs(self, keywords: str, location: str, max_results: int = 20) -> List[JobPosting]:
        """Search Hrist jobs"""
        jobs = []
        
        try:
            params = {
                'search': keywords,
                'location': location,
                'page': 1,
                'limit': min(max_results, 50)
            }
            
            response = self.session.get(self.base_url, params=params, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            for job_data in data.get('jobs', [])[:max_results]:
                job = self.parse_hrist_job(job_data)
                if job:
                    jobs.append(job)
                    
        except Exception as e:
            print(f"[Hrist] error: {e}")
        
        return jobs
    
    def parse_hrist_job(self, job_data: Dict[str, Any]) -> Optional[JobPosting]:
        """Parse Hrist job data"""
        try:
            return JobPosting(
                id=f"hrist_{job_data.get('id', '')}",
                title=job_data.get('title', 'N/A'),
                company=job_data.get('company', 'N/A'),
                location=job_data.get('location', 'N/A'),
                description=job_data.get('description', ''),
                url=job_data.get('url', ''),
                source=JobSource.HRIST,
                skills_required=extract_skills_from_text(
                    f"{job_data.get('title', '')} {job_data.get('description', '')}"
                )
            )
        except Exception as e:
            print(f"Error parsing Hrist job: {e}")
            return None

class FlexJobsScraper:
    """FlexJobs.com scraper"""
    
    def __init__(self):
        self.base_url = "https://www.flexjobs.com/api/jobs"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def search_jobs(self, keywords: str, location: str, max_results: int = 20) -> List[JobPosting]:
        """Search FlexJobs"""
        jobs = []
        
        try:
            params = {
                'search': keywords,
                'location': location,
                'page': 1,
                'limit': min(max_results, 50)
            }
            
            response = self.session.get(self.base_url, params=params, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            for job_data in data.get('jobs', [])[:max_results]:
                job = self.parse_flexjobs_job(job_data)
                if job:
                    jobs.append(job)
                    
        except Exception as e:
            print(f"[FlexJobs] error: {e}")
        
        return jobs
    
    def parse_flexjobs_job(self, job_data: Dict[str, Any]) -> Optional[JobPosting]:
        """Parse FlexJobs job data"""
        try:
            return JobPosting(
                id=f"flexjobs_{job_data.get('id', '')}",
                title=job_data.get('title', 'N/A'),
                company=job_data.get('company', 'N/A'),
                location=job_data.get('location', 'Remote'),
                description=job_data.get('description', ''),
                url=job_data.get('url', ''),
                source=JobSource.FLEXJOBS,
                skills_required=extract_skills_from_text(
                    f"{job_data.get('title', '')} {job_data.get('description', '')}"
                )
            )
        except Exception as e:
            print(f"Error parsing FlexJobs job: {e}")
            return None

# Import existing scrapers
from alternative_sources import AdzunaScraper, JoobleScraper, GitHubJobsScraper, RemoteOKScraper
from enhanced_skill_matcher import EnhancedSkillMatcher
from google_job_scraper import GoogleJobScraper
from concurrent.futures import ThreadPoolExecutor, as_completed

class MultiPortalJobAggregator:
    """Enhanced job aggregator with all requested portals"""
    
    def __init__(self):
        # Enabled scrapers for more results
        self.scrapers = {
            JobSource.INDEED: IndeedScraper(),
            JobSource.ADZUNA: AdzunaScraper(),
            JobSource.REMOTEOK: RemoteOKScraper(),
            JobSource.JOOBLE: JoobleScraper(),
            JobSource.NAUKRI: NaukriScraper(),
            JobSource.LINKEDIN: LinkedInScraper(),
        }
        self.skill_matcher = EnhancedSkillMatcher()
    
    def search_jobs(self, query) -> List[JobPosting]:
        """Search jobs across all portals with optimized parallel processing"""
        all_jobs = []
        sources_searched = []
        errors = []
        
        # Use ThreadPoolExecutor for parallel scraping with optimized worker count
        max_workers = min(4, len(query.sources))  # Reduce max workers to avoid overwhelming APIs
        print(f"[MultiPortal] Starting parallel search across {len(query.sources)} sources")
        print(f"[MultiPortal] Sources: {[s.value for s in query.sources]}")
        print(f"[MultiPortal] Using {max_workers} workers")
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {}
            
            for source in query.sources:
                if source in self.scrapers:
                    print(f"[MultiPortal] Submitting {source.value} for search...")
                    futures[executor.submit(self._search_source, source, query)] = source
            
            for future in as_completed(futures):
                source = futures[future]
                try:
                    jobs = future.result(timeout=60)  # Reduce timeout to 60 seconds per source
                    all_jobs.extend(jobs)
                    sources_searched.append(source)
                    print(f"[MultiPortal] Found {len(jobs)} jobs from {source.value}")
                except Exception as e:
                    error_msg = f"[MultiPortal] Error searching {source.value}: {e}"
                    errors.append(error_msg)
                    print(error_msg)
                    print(f"[MultiPortal] Full error details: {type(e).__name__}: {str(e)}")
        
        # Remove duplicates and calculate match scores
        unique_jobs = self._remove_duplicates(all_jobs)

        # If user requested remote, apply a semantic remote-only filter
        where_val = (getattr(query, 'where', '') or '').lower()
        if 'remote' in where_val or where_val in ('any', 'anywhere'):
            print("[MultiPortal] Applying remote-only filter")
            remote_tokens = [
                ' remote', 'remote ', '(remote)', '[remote]',
                'work from home', 'wfh', 'home-based', 'work-from-home', 'telecommute'
            ]
            onsite_tokens = [
                'on-site', 'onsite', 'on site', 'hybrid', 'office-based', 'office based',
                'in-office', 'in office', 'relocation', 'relocate'
            ]
            # Location tokens that strongly indicate on-site when no remote hint exists
            onsite_location_hints = [
                ',', 'india', 'united states', 'usa', 'uk', 'united kingdom', 'canada',
                'bengaluru', 'bangalore', 'mumbai', 'delhi', 'gurgaon', 'noida', 'pune',
                'hyderabad', 'chennai', 'kolkata', 'karnataka', 'maharashtra',
                'san francisco', 'new york', 'austin', 'seattle', 'london', 'toronto'
            ]
            filtered: List[JobPosting] = []
            dropped: int = 0
            for job in unique_jobs:
                title = (job.title or '').lower()
                loc = (job.location or '').lower()
                desc = (job.description or '').lower()
                text = f"{title} {loc} {desc}"
                # Normalize common compact forms
                loc_norm = loc.replace('wfh', 'work from home').replace('work-from-home', 'work from home')
                title_norm = title.replace('wfh', 'work from home').replace('work-from-home', 'work from home')
                has_remote = any(tok in title_norm for tok in remote_tokens) or any(tok in loc_norm for tok in remote_tokens)
                has_remote_desc = any(tok in desc for tok in remote_tokens)
                has_onsite_hint = any(tok in text for tok in onsite_tokens)
                loc_has_city = any(hint in loc for hint in onsite_location_hints)
                # Strict rule:
                # - Accept if title/location explicitly say remote
                # - Else accept if description says remote AND not onsite hints AND location doesn't look on-site
                if has_remote:
                    filtered.append(job)
                elif has_remote_desc and not has_onsite_hint and not loc_has_city:
                    filtered.append(job)
                else:
                    dropped += 1
            # Enforce strict remote-only list even if few remain
            print(f"[MultiPortal] Remote filter kept {len(filtered)} of {len(unique_jobs)} jobs (dropped {dropped})")
            unique_jobs = filtered
        
        # Calculate comprehensive match scores (profile + skills)
        for job in unique_jobs:
            # Calculate skill match score
            skill_score = self.skill_matcher.calculate_match_score(job.skills_required, query.skills)
            matches = self.skill_matcher.find_skill_matches(job.skills_required, query.skills)
            job.skills_matched = [match.skill for match in matches]
            
            # Calculate profile match score
            user_profile = {
                'experience_level': query.experience_level or 'mid',
                'location': query.location or '',
                'where': getattr(query, 'where', ''),
                'employment_type': query.employment_type or 'full-time',
                'company_type': 'any',  # Could be added to query later
                'keywords': query.keywords or [],
                'skills': query.skills or []
            }
            profile_score = self.skill_matcher.calculate_profile_match_score(job, user_profile)
            
            # Check if job has no skills - use different scoring strategy
            has_skills = job.skills_required and len(job.skills_required) > 0
            
            if not has_skills:
                # If no skills listed, use 100% profile match (role-based)
                job.match_score = profile_score
            else:
                # Normal combined score: 60% profile match + 40% skill match
                job.match_score = (profile_score * 0.6) + (skill_score * 0.4)
            
            job.profile_score = profile_score
            job.skill_score = skill_score
        
        # Sort by combined match score (profile + skills)
        unique_jobs.sort(key=lambda x: x.match_score, reverse=True)
        
        print(f"Total jobs found: {len(unique_jobs)} from {len(sources_searched)} sources")
        return unique_jobs
    
    def _search_source(self, source: JobSource, query) -> List[JobPosting]:
        """Search a specific source"""
        print(f"[MultiPortal] Starting search for {source.value}")
        
        try:
            scraper = self.scrapers[source]
            print(f"[MultiPortal] Scraper found for {source.value}: {type(scraper).__name__}")
            
            # If user selected Remote/Any in where field, add "remote" to keywords
            where = (getattr(query, 'where', '') or '').lower()
            is_remote_mode = 'remote' in where or where in ('any', 'anywhere')
            
            # Build keywords list - add "remote" if remote mode is selected
            keywords_list = query.keywords.copy()
            if is_remote_mode and 'remote' not in ' '.join(keywords_list).lower():
                keywords_list.insert(0, 'remote')  # Add "remote" at the beginning
                print("[MultiPortal] Remote mode detected - adding 'remote' to keywords")
            
            keywords = ' '.join(keywords_list + query.skills)
            location = query.location or ''  # Use empty string if location is None
            if is_remote_mode:
                print("[MultiPortal] Remote mode detected from 'where' field")
                # Many APIs expect location empty for remote searches
                location = ''
            
            print(f"[MultiPortal] Keywords: {keywords}")
            print(f"[MultiPortal] Location: '{location}'")
            print(f"[MultiPortal] Max results: {query.max_results}")
            
            if source == JobSource.LINKEDIN:
                print(f"[MultiPortal] Using LinkedIn-specific search method")
                # Create modified query with remote in keywords if needed
                modified_query = query
                if is_remote_mode:
                    # Create a copy of query with remote in keywords and empty location
                    from copy import deepcopy
                    modified_query = deepcopy(query)
                    modified_query.keywords = keywords_list  # Use keywords with remote added
                    modified_query.location = ''  # Empty location for remote searches
                result = scraper.search_jobs(modified_query)
            elif source == JobSource.NAUKRI:
                print(f"[MultiPortal] Using Naukri-specific search method (single keyword)")
                # Use only the first keyword for Naukri, include remote if needed
                main_keyword = keywords_list[0] if keywords_list else 'engineer'
                print(f"[MultiPortal] Main keyword for Naukri: {main_keyword}")
                result = scraper.search_jobs(main_keyword, location, query.max_results)
            else:
                print(f"[MultiPortal] Using generic search method for {source.value}")
                # Pass keywords with remote if needed
                result = scraper.search_jobs(keywords, location, query.max_results)
            
            print(f"[MultiPortal] {source.value} returned {len(result)} jobs")
            return result
            
        except Exception as e:
            print(f"[MultiPortal] Error in _search_source for {source.value}: {e}")
            print(f"[MultiPortal] Full error details: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
            return []
    
    def _remove_duplicates(self, jobs: List[JobPosting]) -> List[JobPosting]:
        """Remove duplicate jobs with less aggressive deduplication"""
        seen = set()
        unique_jobs = []
        
        for job in jobs:
            # Create unique key from title + company + source
            # This is less aggressive than title+company only
            key = f"{job.title.lower().strip()}_{job.company.lower().strip()}_{job.source}"
            if key not in seen:
                seen.add(key)
                unique_jobs.append(job)
        
        return unique_jobs
