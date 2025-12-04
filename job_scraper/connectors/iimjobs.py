"""
IIMJobs connector (Playwright-based scraper).
"""
import re
import json
from typing import List, Optional
from datetime import datetime
from urllib.parse import quote_plus
from bs4 import BeautifulSoup
from connectors.base import JobConnector, RawJob, SearchQuery


class IIMJobsConnector(JobConnector):
    """IIMJobs.com job scraper using Playwright."""
    
    @property
    def name(self) -> str:
        return "iimjobs"
    
    @property
    def display_name(self) -> str:
        return "IIM Jobs"
    
    def __init__(self):
        self.base_url = "https://www.iimjobs.com"
        self.search_url = "https://www.iimjobs.com/search"
    
    async def fetch(self, query: SearchQuery, since: Optional[datetime] = None) -> List[RawJob]:
        """Fetch jobs from IIMJobs using Playwright."""
        # Build OR-joined phrase query: "kw1" OR "kw2" OR "kw3"
        kws = [str(k).strip() for k in (query.keywords or []) if str(k).strip()]
        phrases = []
        for k in kws[:5]:  # Limit to first 5 keywords
            # Add quotes for multi-word phrases
            phrases.append(k if ' ' not in k else f'"{k}"')
        keywords_str = " OR ".join(phrases) if phrases else ""
        location = query.location or ""
        
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            print("[IIMJobs] Playwright not installed")
            return []
        
        jobs: List[RawJob] = []
        
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    viewport={'width': 1920, 'height': 1080},
                )
                
                # Add stealth script
                await context.add_init_script("""
                    Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                    window.navigator.chrome = {runtime: {}};
                """)
                
                page = await context.new_page()
                
                # Build search URL with proper encoding
                params = []
                if keywords_str:
                    params.append(f"q={quote_plus(keywords_str)}")
                if location:
                    params.append(f"loc={quote_plus(location)}")
                url = f"{self.search_url}?{'&'.join(params)}" if params else self.search_url
                
                print(f"[IIMJobs] Fetching: {url}")
                try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                    final_url = page.url
                    if final_url != url:
                        print(f"[IIMJobs] Redirected from {url} to {final_url}")
                except Exception as e:
                    print(f"[IIMJobs] Navigation error: {e}")
                    await browser.close()
                    return []
                
                # Wait for job cards
                try:
                    await page.wait_for_selector('div[class*="jobCard"], .job-card, a[href*="/j/"]', timeout=10000)
                except:
                    print(f"[IIMJobs] Job card selector not found, continuing anyway")
                
                # Scroll to load more
                for _ in range(2):
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await page.wait_for_timeout(2000)
                
                # Get page HTML and parse
                html = await page.content()
                
                # Debug: Check what we got back
                html_length = len(html)
                has_job_card = bool(re.search(r'job.*card|job-card|/j/', html, re.I))
                has_blocked = bool(re.search(r'access denied|blocked|verify|captcha|consent', html, re.I))
                
                print(f"[IIMJobs][Debug] HTML length={html_length}, has_job_card={has_job_card}, has_blocked={has_blocked}")
                
                # If HTML is suspiciously short or contains blocking indicators
                if html_length < 1000 or has_blocked:
                    print(f"[IIMJobs][Debug] Blocked/redirect page detected. HTML snippet (first 500 chars): {html[:500]}")
                    if has_blocked:
                        print(f"[IIMJobs] Warning: Page appears to be blocked. Consider using authenticated cookies or proxy.")
                    await browser.close()
                    return []
                
                soup = BeautifulSoup(html, 'html.parser')
                
                # Try multiple selectors to find job cards
                job_cards = []
                
                # Try CSS selectors first (more reliable)
                # Prioritize selectors that find actual job listing cards, not category links
                css_selectors = [
                    'a[href*="/j/"]',  # Most specific: job detail pages
                    'a[href*="/job/"]',  # Alternative job detail pattern
                    'div[data-job-id]',  # Cards with job ID attribute
                    'div[class*="job"][class*="card"]',  # Job card divs
                    'div[class*="Job"][class*="Card"]',  # Alternative casing
                    'article[class*="job"]',  # Job articles
                    'div[class*="job"]:not([href*="/k/"])',  # Job divs excluding category links
                ]
                
                for css_selector in css_selectors:
                    try:
                        found = soup.select(css_selector)
                        if found and len(found) > 0:
                            print(f"[IIMJobs][Debug] Found {len(found)} elements with CSS selector: {css_selector}")
                            
                            # Check if we're getting too many category links
                            # Sample first 10 to see if they're actual job links
                            sample_links = [elem.get('href', '') if elem.name == 'a' else 
                                          (elem.find('a', href=True).get('href', '') if elem.find('a', href=True) else '')
                                          for elem in found[:10]]
                            category_count = sum(1 for href in sample_links if '/k/' in href.lower() or '?ref=nav' in href.lower())
                            
                            if category_count > 5:  # More than half are category links
                                print(f"[IIMJobs][Debug] Selector found mostly category links ({category_count}/10), trying more specific selectors...")
                                continue  # Try next selector
                            
                            job_cards = found
                            break  # Use first successful selector
                    except Exception as e:
                        continue
                
                # Fallback to regex-based selectors if CSS didn't work
                if not job_cards:
                    selectors_to_try = [
                        ('div', {'class': re.compile(r'job.*card', re.I)}),
                        ('div', {'class': re.compile(r'job-card', re.I)}),
                        ('div', {'class': re.compile(r'jobCard', re.I)}),
                        ('a', {'href': re.compile(r'/j/', re.I)}),
                        ('div', {'data-job-id': True}),
                        ('article', {}),
                        ('div', {'id': re.compile(r'job', re.I)}),
                    ]
                    
                    for tag, attrs in selectors_to_try:
                        found = soup.find_all(tag, attrs)
                        if found and len(found) > 0:
                            print(f"[IIMJobs][Debug] Found {len(found)} elements with selector: {tag} {attrs}")
                            job_cards = found
                            break  # Use first successful selector
                
                # If still no cards, try to find any links to job details
                if not job_cards:
                    job_links = soup.find_all('a', href=re.compile(r'/j/|job|position', re.I))
                    print(f"[IIMJobs][Debug] Found {len(job_links)} job-related links")
                    if job_links:
                        # Use parent elements of links as job cards
                        for link in job_links[:query.max_results]:
                            parent = link.find_parent(['div', 'article', 'li'])
                            if parent:
                                job_cards.append(parent)
                        print(f"[IIMJobs][Debug] Using {len(job_cards)} parent elements from job links")
                
                # If still nothing, log a sample of the HTML structure
                if not job_cards:
                    # Try to find any divs with job-related classes
                    all_divs = soup.find_all('div', class_=True)
                    job_related_divs = [d for d in all_divs if any(word in str(d.get('class', [])).lower() for word in ['job', 'position', 'opening', 'role'])]
                    print(f"[IIMJobs][Debug] Found {len(job_related_divs)} divs with job-related classes")
                    if job_related_divs:
                        # Log first few class names for debugging
                        for i, div in enumerate(job_related_divs[:5]):
                            classes = div.get('class', [])
                            print(f"[IIMJobs][Debug] Sample div {i+1} classes: {classes}")
                
                print(f"[IIMJobs] Found {len(job_cards)} job card elements")
                
                # Filter to only actual job detail links (those with /j/ pattern, not navigation/footer links)
                actual_job_links = []
                sample_hrefs = []
                
                print(f"[IIMJobs][Debug] Starting to filter {len(job_cards)} cards...")
                
                # Process all cards, not just first 20
                for idx, card in enumerate(job_cards):
                    try:
                        if idx == 0:
                            print(f"[IIMJobs][Debug] First card: name={card.name if hasattr(card, 'name') else 'N/A'}, type={type(card)}")
                            if hasattr(card, 'get'):
                                first_href = card.get('href', '') if card.name == 'a' else ''
                                if not first_href and hasattr(card, 'find'):
                                    first_link = card.find('a', href=True)
                                    first_href = first_link.get('href', '') if first_link else ''
                                print(f"[IIMJobs][Debug] First card href: {first_href[:150]}")
                        
                        if idx % 50 == 0 and idx > 0:
                            print(f"[IIMJobs][Debug] Processed {idx}/{len(job_cards)} cards, found {len(actual_job_links)} job links so far")
                        
                        if card.name == 'a':
                            href = card.get('href', '')
                            if href:
                                # Log first 10 hrefs for debugging
                                if len(sample_hrefs) < 10:
                                    sample_hrefs.append(href[:100])
                                
                                # More lenient pattern - accept any job-related URL or any URL with path segments
                                href_lower = href.lower()
                                # Accept if it has job-related keywords OR is a relative URL with path segments
                                is_job_url = (
                                    '/j/' in href or 
                                    '/job/' in href_lower or 
                                    '/jobs/' in href_lower or
                                    '/position/' in href_lower or
                                    '/opening/' in href_lower or
                                    (not href_lower.startswith('http') and len(href.split('/')) >= 2) or  # Relative URLs with path
                                    (href_lower.startswith('http') and 'iimjobs.com' in href_lower and len(href.split('/')) >= 4)  # Full URLs with path
                                )
                                
                                # Exclude common navigation/footer/category patterns
                                is_excluded = any(skip in href_lower for skip in [
                                    '/search?', '/login', '/register', '/about', '/contact', 
                                    '/terms', '/privacy', '/help', '/recruiter/',
                                    '/employer/', '/post-job', '/dashboard', '/profile',
                                    '/settings', '/home', '/index', '/signup', '/signin',
                                    '/k/',  # Category pages (e.g., /k/finance-and-accounts-jobs)
                                    '?ref=nav',  # Navigation links
                                    '/categories/', '/category/'
                                ])
                                
                                # Don't exclude /company/ links as they might be job pages
                                if '/company/' in href_lower and '/job/' in href_lower:
                                    is_excluded = False
                                
                                # Only accept URLs that look like actual job detail pages
                                # IIMJobs job URLs typically have patterns like: /j/12345 or /job/12345 or numeric IDs
                                looks_like_job_detail = (
                                    '/j/' in href or  # Most common pattern: /j/12345
                                    '/job/' in href_lower or  # Alternative: /job/12345
                                    (re.search(r'/\d+', href) and not '/k/' in href_lower)  # Has numeric ID and not a category
                                )
                                
                                if looks_like_job_detail and not is_excluded:
                                    actual_job_links.append(card)
                                    if len(actual_job_links) <= 3:
                                        print(f"[IIMJobs][Debug] Added job link {len(actual_job_links)}: {href[:100]}")
                        else:
                            # For non-link cards, check if they contain job detail links
                            link = card.find('a', href=True)
                            if link:
                                href = link.get('href', '')
                                href_lower = href.lower()
                                # Only accept actual job detail pages
                                looks_like_job_detail = (
                                    '/j/' in href or 
                                    '/job/' in href_lower
                                )
                                is_excluded = any(skip in href_lower for skip in [
                                    '/search', '/login', '/register', '/about', '/contact',
                                    '/k/', '?ref=nav', '/categories/', '/category/'
                                ])
                                if looks_like_job_detail and not is_excluded:
                                    actual_job_links.append(card)
                    except Exception as e:
                        if idx < 5:  # Log first few errors
                            print(f"[IIMJobs][Debug] Error processing card {idx+1}: {e}")
                        continue
                
                print(f"[IIMJobs][Debug] Finished filtering, processed {len(job_cards)} cards")
                
                # Log sample hrefs for debugging
                if sample_hrefs:
                    print(f"[IIMJobs][Debug] Sample hrefs from cards: {sample_hrefs[:10]}")
                
                print(f"[IIMJobs][Debug] Filtered to {len(actual_job_links)} actual job detail links (from {len(job_cards)} total elements)")
                
                # If filtering removed everything, use the original cards but be more careful
                if not actual_job_links and job_cards:
                    print(f"[IIMJobs][Debug] Filter too strict, using original cards with lenient parsing")
                    print(f"[IIMJobs][Debug] Will attempt to parse all {len(job_cards)} cards directly")
                    actual_job_links = job_cards[:query.max_results]
                elif not actual_job_links:
                    print(f"[IIMJobs][Debug] WARNING: No job links found after filtering {len(job_cards)} cards!")
                    print(f"[IIMJobs][Debug] Sample hrefs that were filtered out: {sample_hrefs[:5] if sample_hrefs else 'None'}")
                
                # Log sample of what we're about to parse
                if actual_job_links:
                    sample_card = actual_job_links[0]
                    print(f"[IIMJobs][Debug] Sample card type: {sample_card.name}, tag: {sample_card.name if hasattr(sample_card, 'name') else 'unknown'}")
                    if hasattr(sample_card, 'get'):
                        sample_href = sample_card.get('href', '') if sample_card.name == 'a' else ''
                        if not sample_href and hasattr(sample_card, 'find'):
                            link = sample_card.find('a')
                            sample_href = link.get('href', '') if link else ''
                        print(f"[IIMJobs][Debug] Sample href: {sample_href[:100]}")
                        print(f"[IIMJobs][Debug] Sample card text preview: {sample_card.get_text(strip=True)[:150]}")
                
                seen_urls = set()
                parsed_count = 0
                error_count = 0
                
                print(f"[IIMJobs][Debug] Starting to parse {len(actual_job_links)} job cards (max_results={query.max_results})")
                
                for idx, card in enumerate(actual_job_links[:query.max_results]):
                    try:
                        # Extract URL first (used as ID)
                        if card.name == 'a':
                            # Card is the link itself
                            url = card.get('href', '')
                            link_elem = card
                        else:
                            # Card contains a link - try multiple patterns
                            link_elem = card.find('a', href=re.compile(r'/j/|/job/|/jobs/', re.I))
                            if not link_elem:
                                # Try any link in the card
                                link_elem = card.find('a', href=True)
                            url = link_elem.get('href', '') if link_elem else ""
                        
                        if not url:
                            if idx < 3:  # Log first few failures
                                print(f"[IIMJobs][Debug] Card {idx+1}: No URL found, card type: {card.name if hasattr(card, 'name') else 'unknown'}")
                            continue
                        
                        # Normalize URL
                            if not url.startswith('http'):
                            url = f"{self.base_url}{url}" if not url.startswith('/') else f"{self.base_url}{url}"
                        
                        # Filter out non-job URLs more carefully
                        url_lower = url.lower()
                        if any(skip in url_lower for skip in [
                            '/search', '/login', '/register', '/about', '/contact', 
                            '/terms', '/privacy', '/help', '/recruiter/', '/employer/', 
                            '/post-job', '/dashboard', '/profile', '/settings',
                            '/k/',  # Category pages
                            '?ref=nav', '/categories/', '/category/'
                        ]):
                            if idx < 3:
                                print(f"[IIMJobs][Debug] Card {idx+1}: Skipping non-job URL: {url[:80]}")
                            continue
                        
                        # Only accept URLs that look like actual job detail pages
                        # IIMJobs job URLs typically have patterns like: /j/12345 or /job/12345
                        looks_like_job = (
                            '/j/' in url or  # Most common: /j/12345
                            '/job/' in url_lower  # Alternative: /job/12345
                        )
                        
                        if not looks_like_job:
                            if idx < 3:
                                print(f"[IIMJobs][Debug] Card {idx+1}: URL doesn't look like job detail page: {url[:80]}")
                            continue
                        
                        if url in seen_urls:
                            continue
                        seen_urls.add(url)
                        
                        # Extract title - try multiple strategies
                        title_raw = ""
                        if card.name == 'a':
                            # If card is the link, get text from it or find title in parent/siblings
                            title_raw = card.get_text(strip=True)
                            if not title_raw or len(title_raw) < 3:
                                # Try to find title in parent
                                parent = card.find_parent(['div', 'article', 'li', 'section'])
                                if parent:
                                    # Try multiple title selectors
                                    title_elem = (
                                        parent.find(['h3', 'h2', 'h1']) or
                                        parent.find(['span', 'div'], class_=re.compile(r'title|heading|job.*title', re.I)) or
                                        parent.find(['a'], class_=re.compile(r'title|heading', re.I))
                                    )
                                    if title_elem:
                                        title_raw = title_elem.get_text(strip=True)
                                    else:
                                        # Last resort: get first meaningful text from parent
                                        all_text = parent.get_text(separator=' ', strip=True)
                                        if len(all_text) > 10:
                                            title_raw = all_text.split('\n')[0].strip()[:200]
                        else:
                            # Card contains the link, find title in card
                            title_elem = (
                                card.find(['h3', 'h2', 'h1']) or
                                card.find(['span', 'div', 'a'], class_=re.compile(r'title|heading|job.*title', re.I)) or
                                card.find('a', href=True)  # Sometimes the link itself has the title
                            )
                            if title_elem:
                                title_raw = title_elem.get_text(strip=True)
                            elif link_elem:
                                # Fallback: use link text
                                title_raw = link_elem.get_text(strip=True)
                            else:
                                # Last resort: get first meaningful text from card
                                all_text = card.get_text(separator=' ', strip=True)
                                if len(all_text) > 10:
                                    title_raw = all_text.split('\n')[0].strip()[:200]
                        
                        # Clean title (remove "Company - Title" artifacts)
                        title = self._clean_title(title_raw) if title_raw else ""
                        
                        # Extract company (sometimes in title prefix)
                        company = self._extract_company_from_title(title_raw) or ""
                        if card.name != 'a':
                            company_elem = card.find(['div', 'span', 'a'], class_=re.compile(r'company|employer|recruiter', re.I))
                        if company_elem:
                            company = company_elem.get_text(strip=True)
                        
                        # If still no title, try using link text or URL
                        if not title:
                            if link_elem:
                                title = link_elem.get_text(strip=True)
                                title = self._clean_title(title)
                            if not title:
                                # Use URL slug as last resort
                                url_parts = url.rstrip('/').split('/')
                                if len(url_parts) > 1:
                                    title = url_parts[-1].replace('-', ' ').replace('_', ' ').title()
                        
                        # Debug: log if we can't find title
                        if not title or len(title) < 3:
                            if idx < 5:  # Log first 5 failures
                                print(f"[IIMJobs][Debug] No title found for card {idx+1}, URL: {url[:80]}")
                                print(f"[IIMJobs][Debug]   Card tag: {card.name if hasattr(card, 'name') else 'unknown'}")
                                print(f"[IIMJobs][Debug]   Card text preview: {card.get_text(strip=True)[:150] if hasattr(card, 'get_text') else 'N/A'}")
                                print(f"[IIMJobs][Debug]   Link text: {link_elem.get_text(strip=True)[:100] if link_elem and hasattr(link_elem, 'get_text') else 'N/A'}")
                            error_count += 1
                            continue
                        
                        parsed_count += 1
                        if parsed_count <= 3:
                            print(f"[IIMJobs][Debug] Successfully parsed job {parsed_count}: title='{title[:50]}', company='{company[:30]}', url={url[:80]}")
                        
                        # Extract location
                        location_text = location
                        if card.name != 'a':
                            location_elem = card.find(['span', 'div'], class_=re.compile(r'location', re.I))
                            if location_elem:
                                location_text = location_elem.get_text(strip=True)
                        
                        # Extract experience
                        exp_text = ""
                        exp_min, exp_max = None, None
                        if card.name != 'a':
                            exp_elem = card.find(['span', 'div'], class_=re.compile(r'exp', re.I))
                            if exp_elem:
                                exp_text = exp_elem.get_text(strip=True)
                        exp_min, exp_max = self._parse_experience(exp_text)
                        
                        # Skip detail page fetching for now (too slow, can add later if needed)
                        description = ""
                        # TODO: Add detail page fetching if needed for better descriptions
                        
                        # Add job if we have at least a title
                        if title:
                            jobs.append(RawJob(
                                source=self.name,
                                external_id=url.split('/')[-1].split('?')[0] if url else "",
                                title=title,
                                company=company or "Unknown",
                                location=location_text or location,
                                description=description,
                                url=url,
                                experience_min=exp_min,
                                experience_max=exp_max,
                                raw_data={"card_html": str(card)[:500]},
                            ))
                            if len(jobs) <= 5:
                                print(f"[IIMJobs][Debug] Added job {len(jobs)} to list: {title[:50]}")
                        else:
                            error_count += 1
                    except Exception as e:
                        if idx < 5:  # Log first few errors
                            print(f"[IIMJobs][Debug] Parse card {idx+1} error: {e}")
                            import traceback
                            traceback.print_exc()
                        error_count += 1
                        continue
                
                print(f"[IIMJobs] Parsed {parsed_count} jobs successfully, {error_count} errors, total jobs in list: {len(jobs)}")

                # Fallback: if we still have 0 jobs, try a simpler link-based extraction
                if not jobs:
                    try:
                        print("[IIMJobs][Debug] No jobs parsed from cards, running global link-based fallback...")
                        fallback_links = soup.select('a[href*="/j/"], a[href*="/job/"], a[href*="/jobs/"]')
                        print(f"[IIMJobs][Debug] Fallback found {len(fallback_links)} candidate job links")

                        for f_idx, link in enumerate(fallback_links[: query.max_results]):
                            try:
                                furl = link.get('href', '')
                                if not furl:
                                    continue

                                furl_lower = furl.lower()
                                # Skip obvious non-job URLs again
                                if any(skip in furl_lower for skip in [
                                    '/search', '/login', '/register', '/about', '/contact',
                                    '/terms', '/privacy', '/help', '/recruiter/', '/employer/',
                                    '/post-job', '/dashboard', '/profile', '/settings',
                                    '/k/', '?ref=nav', '/categories/', '/category/',
                                    'learning/', 'diversity.'
                                ]):
                                    continue

                                # Normalize URL
                                if not furl.startswith('http'):
                                    furl = f"{self.base_url}{furl}" if not furl.startswith('/') else f"{self.base_url}{furl}"

                                if furl in seen_urls:
                                    continue
                                seen_urls.add(furl)

                                # Title from link text
                                f_title_raw = link.get_text(strip=True)
                                f_title = self._clean_title(f_title_raw) if f_title_raw else ""
                                if not f_title or len(f_title) < 3:
                                    continue

                                # Very light-weight job object; other fields best-effort
                                f_company = ""
                                parent = link.find_parent(['div', 'article', 'li', 'section'])
                                if parent:
                                    comp_elem = parent.find(['div', 'span'], class_=re.compile(r'company|employer|recruiter', re.I))
                                    if comp_elem:
                                        f_company = comp_elem.get_text(strip=True)

                                jobs.append(
                                    RawJob(
                                        source=self.name,
                                        external_id=furl.split('/')[-1].split('?')[0],
                                        title=f_title,
                                        company=f_company or "Unknown",
                                        location=location or "",
                                        description="",
                                        url=furl,
                                        experience_min=None,
                                        experience_max=None,
                                        raw_data={"fallback": True},
                                    )
                                )
                                if len(jobs) <= 5:
                                    print(f"[IIMJobs][Debug] Fallback added job {len(jobs)}: {f_title[:60]} ({furl[:80]})")
                            except Exception as fe:
                                if f_idx < 3:
                                    print(f"[IIMJobs][Debug] Fallback parse error on link {f_idx+1}: {fe}")
                                continue

                        print(f"[IIMJobs][Debug] Fallback completed, total jobs after fallback: {len(jobs)}")
                    except Exception as fb_err:
                        print(f"[IIMJobs][Debug] Fallback extraction failed: {fb_err}")
                
                await browser.close()
        except Exception as e:
            print(f"[IIMJobs] Error: {e}")
            import traceback
            traceback.print_exc()
        
        # Filter by since if provided
        if since:
            jobs = [j for j in jobs if j.posted_at and j.posted_at >= since]
        
        return jobs[:query.max_results]
    
    def _clean_title(self, title: str) -> str:
        """Clean IIMJobs title (remove artifacts like 'Posted X ago', experience ranges)."""
        if not title:
            return ""
        # Remove "Posted X ago" patterns
        title = re.sub(r'\s*-\s*Posted\s+(today|yesterday|\d+\s+(days?|weeks?|months?)\s+ago)\s*', '', title, flags=re.IGNORECASE)
        # Remove experience ranges from title
        title = re.sub(r'\s*\d+\s*-\s*\d+\s*yrs?Location.*$', '', title, flags=re.IGNORECASE)
        # Remove repeated "Posted today"
        title = re.sub(r'\s*Posted\s+(today|yesterday)\s*', '', title, flags=re.IGNORECASE)
        # Clean whitespace
        title = re.sub(r'\s+', ' ', title).strip()
        return title
    
    def _extract_company_from_title(self, title: str) -> Optional[str]:
        """Extract company name from title if it's in 'Company - Title' format."""
        if not title or ' - ' not in title:
            return None
        parts = title.split(' - ', 1)
        if len(parts) == 2:
            company = parts[0].strip()
            # Validate it's not just a job title
            if len(company) > 3 and not any(word in company.lower() for word in ['manager', 'engineer', 'analyst', 'developer']):
                return company
        return None
    
    def _parse_experience(self, text: str) -> tuple:
        """Parse experience range from text."""
        if not text:
            return (None, None)
        match = re.search(r'(\d+)\s*-\s*(\d+)\s*(?:years?|yrs?|y\.?)', text, re.IGNORECASE)
        if match:
            return (float(match.group(1)), float(match.group(2)))
        match = re.search(r'(\d+)\s*\+\s*(?:years?|yrs?|y\.?)', text, re.IGNORECASE)
        if match:
            val = float(match.group(1))
            return (val, val + 5)
        return (None, None)

