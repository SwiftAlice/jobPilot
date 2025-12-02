"""
LinkedIn connector (HTTP-based, with Playwright fallback).
"""
import httpx
import re
from typing import List, Optional
from datetime import datetime
from bs4 import BeautifulSoup
from connectors.base import JobConnector, RawJob, SearchQuery
import os
from urllib.parse import unquote


class LinkedInConnector(JobConnector):
    """LinkedIn job search connector (HTTP-first, Playwright fallback)."""
    
    @property
    def name(self) -> str:
        return "linkedin"
    
    @property
    def display_name(self) -> str:
        return "LinkedIn"
    
    def __init__(self):
        self.base_url = "https://www.linkedin.com/jobs/search"
        # Disable Playwright by default to avoid timeouts in dev
        env_val = os.getenv("LINKEDIN_DISABLE_PLAYWRIGHT", "1")
        self.disable_playwright = env_val == "1"
        print(f"[LinkedIn] Initialized: disable_playwright={self.disable_playwright} (env='{env_val}')")
        # Optional authenticated cookie to improve pagination/visibility
        self.li_at = os.getenv("LINKEDIN_LI_AT") or ""
        if self.li_at:
            print(f"[LinkedIn] li_at cookie configured (length={len(self.li_at)})")
    
    async def fetch(self, query: SearchQuery, since: Optional[datetime] = None, on_job_ready=None) -> List[RawJob]:
        """Fetch jobs from LinkedIn."""
        # Build OR-joined phrase query: "kw1" OR "kw2"
        kws = [str(k).strip() for k in (query.keywords or []) if str(k).strip()]
        phrases = []
        for k in kws:
            phrases.append(k if ' ' not in k else f'"{k}"')
        keywords_str = " OR ".join(phrases) if phrases else ""
        location = query.location or ""
        
        jobs: List[RawJob] = []
        try:
            print(f"[LinkedIn] disable_playwright={self.disable_playwright} kw='{keywords_str}' loc='{location}' page={getattr(query, 'page', None)} page_size={getattr(query, 'page_size', None)} start={getattr(query, 'start_offset', None)}")
        except Exception:
            pass

        # If Playwright is enabled, try it first (best chance to parse dynamic DOM)
        # For background worker, fetch multiple pages (up to 3 pages or until old jobs)
        if not self.disable_playwright:
            max_results = query.max_results or 25
            # If max_results > 25, fetch multiple pages
            pages_to_fetch = min(3, (max_results + 24) // 25) if max_results > 25 else 1
            print(f"[LinkedIn] Attempting Playwright fetch (max_results={max_results}, pages={pages_to_fetch})...")
            try:
                all_pw_jobs = []
                seen_external_ids = set()
                seen_urls = set()  # Fallback: track by URL if external_id is missing
                previous_pages_ids = []  # Track ALL previous pages' IDs to detect any duplicate page
                previous_pages_urls = []  # Track ALL previous pages' URLs to detect any duplicate page
                for page_num in range(pages_to_fetch):
                    start_offset = page_num * 25
                    if start_offset >= max_results:
                        break
                    page_max = min(25, max_results - len(all_pw_jobs))
                    if page_max <= 0:
                        break
                    print(f"[LinkedIn][Playwright] Fetching page {page_num + 1}/{pages_to_fetch} (start={start_offset})")
                    pw_jobs = await self._fetch_with_playwright(keywords_str, location, page_max, start_offset)
                    if pw_jobs:
                        # Collect identifiers from this page to check if it's the same as any previous page
                        current_page_ids = set()
                        current_page_urls = set()
                        for j in pw_jobs:
                            ext_id = getattr(j, "external_id", "") or ""
                            url = getattr(j, "url", "") or ""
                            normalized_url = url.split('?')[0].split('#')[0] if url else ""
                            if ext_id:
                                current_page_ids.add(ext_id)
                            elif normalized_url:
                                current_page_urls.add(normalized_url)
                        
                        # Check if this page has the same identifiers as ANY previous page (LinkedIn returned duplicate page)
                        # Do this FIRST to stop immediately if it's a duplicate page
                        is_duplicate_page = False
                        if page_num > 0:
                            if current_page_ids:
                                for prev_idx, prev_ids in enumerate(previous_pages_ids):
                                    if prev_ids and current_page_ids == prev_ids:
                                        print(f"[LinkedIn][Playwright] Page {page_num + 1} has same external_ids as page {prev_idx + 1} (LinkedIn returned duplicate page). Stopping pagination.")
                                        print(f"[LinkedIn][Playwright]   Current page IDs: {sorted(list(current_page_ids))[:5]}... (total: {len(current_page_ids)})")
                                        print(f"[LinkedIn][Playwright]   Previous page {prev_idx + 1} IDs: {sorted(list(prev_ids))[:5]}... (total: {len(prev_ids)})")
                                        is_duplicate_page = True
                                        break
                            if not is_duplicate_page and current_page_urls:
                                for prev_idx, prev_urls in enumerate(previous_pages_urls):
                                    if prev_urls and current_page_urls == prev_urls:
                                        print(f"[LinkedIn][Playwright] Page {page_num + 1} has same URLs as page {prev_idx + 1} (LinkedIn returned duplicate page). Stopping pagination.")
                                        is_duplicate_page = True
                                        break
                        
                        if is_duplicate_page:
                            break
                        
                        # Now check individual jobs for duplicates to get accurate counts
                        new_jobs = []
                        duplicates_count = 0
                        for j in pw_jobs:
                            ext_id = getattr(j, "external_id", "") or ""
                            url = getattr(j, "url", "") or ""
                            # Normalize URL (remove query params) for comparison
                            normalized_url = url.split('?')[0].split('#')[0] if url else ""
                            
                            # Check by external_id first, then by URL
                            is_duplicate = False
                            if ext_id:
                                if ext_id in seen_external_ids:
                                    is_duplicate = True
                                else:
                                    seen_external_ids.add(ext_id)
                            elif normalized_url:
                                if normalized_url in seen_urls:
                                    is_duplicate = True
                                else:
                                    seen_urls.add(normalized_url)
                            
                            if not is_duplicate:
                                new_jobs.append(j)
                            else:
                                duplicates_count += 1
                        
                        duplicate_ratio = duplicates_count / len(pw_jobs) if pw_jobs else 0.0
                        print(f"[LinkedIn][Playwright] Page {page_num + 1}: {len(pw_jobs)} total, {len(new_jobs)} new, {duplicates_count} duplicates ({duplicate_ratio:.1%} duplicate ratio) (seen_ids={len(seen_external_ids)}, seen_urls={len(seen_urls)})")
                        
                        # Stop if all jobs are duplicates OR if duplicate ratio is very high
                        if not new_jobs:
                            print(f"[LinkedIn][Playwright] Page {page_num + 1} yielded 0 new jobs (all duplicates). Stopping pagination.")
                            break
                        
                        # Stop if duplicate ratio is very high (>= 80%) - LinkedIn is returning mostly duplicates
                        if duplicate_ratio >= 0.8 and len(pw_jobs) >= 10:
                            print(f"[LinkedIn][Playwright] Page {page_num + 1} has {duplicate_ratio:.1%} duplicate ratio (>=80%), stopping pagination to avoid wasting time.")
                            break
                        
                        all_pw_jobs.extend(new_jobs)
                        
                        # Store this page's identifiers for future duplicate detection
                        previous_pages_ids.append(current_page_ids)
                        previous_pages_urls.append(current_page_urls)
                        
                        # Stop if we got fewer new jobs than expected (likely reached end or duplicates)
                        if len(new_jobs) < 20:
                            print(f"[LinkedIn][Playwright] Got only {len(new_jobs)} new jobs, stopping pagination")
                            break
                    else:
                        print(f"[LinkedIn][Playwright] Page {page_num + 1} returned empty, stopping")
                        break
                
                print(f"[LinkedIn] Playwright returned {len(all_pw_jobs)} total jobs from {pages_to_fetch} pages")
                if all_pw_jobs:
                    jobs.extend(all_pw_jobs)
                    print(f"[LinkedIn] Total jobs after Playwright: {len(jobs)}")
                else:
                    print(f"[LinkedIn] Playwright returned empty list, will try HTTP fallback")
            except ImportError as e:
                print(f"[LinkedIn] Playwright not installed: {e}")
                import traceback
                traceback.print_exc()
            except Exception as e:
                print(f"[LinkedIn] Playwright fetch error: {e}")
                import traceback
                traceback.print_exc()
        
        # If still need more, try HTTP (faster and low overhead)
        if len(jobs) < (query.max_results or 20):
            try:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                }
                cookies = {"li_at": self.li_at} if self.li_at else None
                async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, headers=headers, cookies=cookies) as client:
                    # Fetch exactly one page (based on start_offset)
                    desired = max(1, query.max_results or 25)
                    start_offset = getattr(query, 'start_offset', 0)
                    # Build params - only include location if it's not empty (to fetch from everywhere when "Any" is selected)
                    params = {
                        "keywords": keywords_str,
                        "start": start_offset,  # Single page fetch
                    }
                    if location and location.strip():
                        params["location"] = location
                    try:
                        print(f"[LinkedIn][HTTP] GET {self.base_url} params={params} (page fetch, max_results={desired})")
                    except Exception:
                        pass
                    resp = await client.get(self.base_url, params=params)
                    if resp.status_code == 200:
                        try:
                            print(f"[LinkedIn][HTTP] status={resp.status_code} len={len(resp.text)} url={resp.url}")
                        except Exception:
                            pass
                        # Parse exactly max_results jobs from this page
                        parsed = self._parse_html(resp.text, keywords_str, max_results=desired)
                        # Deduplicate by URL/external_id
                        seen = {getattr(j, 'external_id', '') for j in jobs}
                        for j in parsed:
                            if getattr(j, 'external_id', '') not in seen:
                                jobs.append(j)
                                seen.add(getattr(j, 'external_id', ''))
                                if len(jobs) >= desired:
                                    break
            except Exception as e:
                print(f"[LinkedIn] HTTP fetch error: {e}")
        
        # If we did HTTP first (because Playwright disabled) and still need, optionally try Playwright
        if (not self.disable_playwright) and (len(jobs) < (query.max_results or 20)):
            try:
                pw_jobs = await self._fetch_with_playwright(keywords_str, location, (query.max_results or 20) - len(jobs))
                jobs.extend(pw_jobs)
            except Exception as e:
                print(f"[LinkedIn] Playwright fetch error (late): {e}")
        
        # Filter by since if provided
        if since:
            jobs = [j for j in jobs if j.posted_at and j.posted_at >= since]
        
        # If callback provided, yield jobs immediately with initial data (before detail fetching)
        # This allows jobs to be inserted into DB immediately, then enriched with details later
        if on_job_ready and callable(on_job_ready):
            print(f"[LinkedIn] Yielding {len(jobs)} jobs immediately with initial data for fast insertion...")
            for idx, job in enumerate(jobs):
                try:
                    # Yield job immediately with whatever data we have from search results
                    await on_job_ready(job)
                except Exception as e:
                    if idx < 5:
                        print(f"[LinkedIn] Error yielding job {idx}: {e}")
        
        # Best-effort detail description/location for all items (HTTP detail fetch)
        # Fetch details in parallel and update DB incrementally
        # We fetch for ALL jobs, not just top 25, to ensure locations are always available
        if jobs:
            import time
            import asyncio
            detail_start = time.time()
            # Fetch locations for ALL jobs, not just top 25
            # This ensures all jobs have locations when stored in the database
            top_count = len(jobs)  # Fetch for all jobs
            detail_fetch_count = 0
            detail_success_count = 0
            
            # Process in smaller batches with delays to avoid rate limiting
            batch_size = 5  # Process 5 jobs at a time
            batch_delay = 3.0  # 3 second delay between batches
            
            async def fetch_detail_for_job(job, idx):
                """Fetch detail for a single job and update it."""
                nonlocal detail_fetch_count, detail_success_count
                try:
                    if not getattr(job, 'url', None):
                        return job
                    
                    fetch_start = time.time()
                    # Try HTTP first, fallback to Playwright if blocked (999)
                    detail = None
                    enable_debug = (idx < 3)  # Debug first 3 jobs
                    
                    # Try HTTP with retry
                    max_retries = 2
                    for retry in range(max_retries):
                        try:
                            detail = await self._fetch_detail_and_location_http_async(job.url, debug=enable_debug and retry == max_retries - 1)
                            # Check if we got blocked (999) or got data
                            if detail.get('description_html') or detail.get('location'):
                                break  # Got something, stop retrying
                            # If HTTP returned 999, or if it's an in.linkedin.com URL (often blocked), try Playwright fallback
                            # BUT: Only if Playwright is not disabled
                            is_indian_linkedin = "in.linkedin.com" in job.url
                            if detail.get('_blocked') or detail.get('_status_999') or (is_indian_linkedin and not detail.get('description_html') and not detail.get('location')):
                                if not self.disable_playwright:
                                    if idx < 5 or is_indian_linkedin:
                                        print(f"[LinkedIn] Job {idx}: HTTP blocked/failed{' (in.linkedin.com)' if is_indian_linkedin else ''}, trying Playwright fallback...")
                                    detail = await self._fetch_detail_with_playwright(job.url)
                                    break
                                else:
                                    if idx < 5:
                                        print(f"[LinkedIn] Job {idx}: HTTP blocked/failed{' (in.linkedin.com)' if is_indian_linkedin else ''}, but Playwright is disabled - skipping")
                                    break
                            if retry < max_retries - 1:
                                await asyncio.sleep(2.0 * (retry + 1))  # Longer delay to avoid rate limiting
                        except Exception as fetch_err:
                            if retry == max_retries - 1:
                                # Last retry failed, try Playwright as final fallback (only if not disabled)
                                if not self.disable_playwright:
                                    if idx < 5:
                                        print(f"[LinkedIn] Job {idx}: HTTP failed, trying Playwright fallback: {fetch_err}")
                                    try:
                                        detail = await self._fetch_detail_with_playwright(job.url)
                                    except Exception as pw_err:
                                        if idx < 10:
                                            print(f"[LinkedIn] Job {idx}: Both HTTP and Playwright failed: {pw_err}")
                                else:
                                    if idx < 5:
                                        print(f"[LinkedIn] Job {idx}: HTTP failed, but Playwright is disabled - skipping: {fetch_err}")
                            else:
                                await asyncio.sleep(2.0 * (retry + 1))
                    
                    fetch_time = time.time() - fetch_start
                    detail_fetch_count += 1
                    
                    if not detail:
                        if idx < 10:
                            print(f"[LinkedIn] Job {idx}: ⚠️  No detail data returned from fetch (url: {job.url[:60]}...)")
                        # Still return job even if detail fetch failed - location might be set from card
                        return job
                    
                    desc = detail.get('description_html')
                    loc = detail.get('location')
                    posted_at = detail.get('posted_at')
                    
                    # Debug: log what we got
                    if idx < 5:
                        print(f"[LinkedIn] Job {idx}: Detail fetch result - desc={bool(desc)}, desc_len={len(desc) if desc else 0}, loc={bool(loc)}, loc_val='{loc}', posted_at={posted_at}")
                    
                    # Always update description if we got one (prefer detail page description over card snippet)
                    desc_updated = False
                    if desc and desc.strip() and len(desc.strip()) > 50:
                        try:
                            old_desc = getattr(job, 'description', None) or ''
                            old_desc_str = str(old_desc) if old_desc else ''
                            # Update if we don't have a description, or if the new one is longer (more complete)
                            if not old_desc_str or len(desc.strip()) > len(old_desc_str.strip()):
                                job.description = desc  # type: ignore
                                desc_updated = True
                                if idx < 10:  # Log first 10 for debugging
                                    print(f"[LinkedIn] Job {idx}: ✅ Updated description (length: {len(desc)} chars, fetch took {fetch_time:.3f}s)")
                        except Exception as desc_err:
                            if idx < 10:
                                print(f"[LinkedIn] Job {idx}: ❌ Failed to set description: {desc_err}")
                    
                    # Always update location if we got one (even if card had empty string)
                    loc_updated = False
                    if loc and loc.strip():
                        try:
                            old_loc = getattr(job, 'location', None) or ''
                            job.location = loc  # type: ignore
                            loc_updated = True
                            detail_success_count += 1
                            if idx < 10:  # Log first 10 for debugging
                                print(f"[LinkedIn] Job {idx}: ✅ Updated location from '{old_loc}' to '{loc}' (fetch took {fetch_time:.3f}s)")
                        except Exception as loc_err:
                            if idx < 10:
                                print(f"[LinkedIn] Job {idx}: ❌ Failed to set location: {loc_err}")
                    
                    # Always update posted_at if we got one (from LinkedIn's actual post date)
                    if posted_at:
                        try:
                            from datetime import datetime
                            old_posted_at = getattr(job, 'posted_at', None)
                            # Only update if we don't have one, or if the new one is more recent (likely more accurate)
                            if not old_posted_at or (isinstance(posted_at, datetime) and isinstance(old_posted_at, datetime) and posted_at > old_posted_at):
                                job.posted_at = posted_at  # type: ignore
                                if idx < 10:
                                    print(f"[LinkedIn] Job {idx}: ✅ Updated posted_at to {posted_at} (fetch took {fetch_time:.3f}s)")
                        except Exception as posted_err:
                            if idx < 10:
                                print(f"[LinkedIn] Job {idx}: ❌ Failed to set posted_at: {posted_err}")
                    
                    # Debug: log if we didn't get description or location
                    if not desc_updated and not loc_updated:
                        # Log for all jobs (not just first 10) to help debug
                        if idx < 20:  # Log first 20 failures
                            # Try to fetch again with debug enabled to see what's wrong (only for first 3)
                            if idx < 3:
                                try:
                                    debug_detail = await self._fetch_detail_and_location_http_async(job.url, debug=True)
                                    print(f"[LinkedIn] Job {idx}: ⚠️  No description or location found (desc={bool(desc)}, loc={bool(loc)}, retry_desc={bool(debug_detail.get('description_html'))}, retry_loc={bool(debug_detail.get('location'))}, url={job.url[:60]}...)")
                                except Exception as debug_err:
                                    print(f"[LinkedIn] Job {idx}: ⚠️  No description or location found (desc={bool(desc)}, loc={bool(loc)}, debug_fetch_failed={debug_err}, url={job.url[:60]}...)")
                            else:
                                print(f"[LinkedIn] Job {idx}: ⚠️  No description or location found (desc={bool(desc)}, loc={bool(loc)}, url={job.url[:60]}...)")
                        elif idx % 10 == 0:  # Log every 10th failure after first 20
                            print(f"[LinkedIn] Job {idx}: ⚠️  No description or location found (desc={bool(desc)}, loc={bool(loc)}, url={job.url[:60]}...)")
                    
                    return job
                except Exception as e:
                    if idx < 10:
                        print(f"[LinkedIn] Job {idx}: ❌ Detail fetch error: {e}")
                        import traceback
                        traceback.print_exc()
                    return job
            
            # Fetch details in parallel and update DB incrementally
            # Jobs are already inserted with initial data, now we enrich them with details
            print(f"[LinkedIn] Enriching {top_count} jobs with details in parallel...")
            
            async def enrich_and_update(job, idx):
                """Fetch details and update job, then call callback to update DB."""
                try:
                    updated_job = await fetch_detail_for_job(job, idx)
                    if updated_job:
                        jobs[idx] = updated_job
                        # Debug: verify location is set before callback
                        job_location = getattr(updated_job, 'location', None)
                        if idx < 5:
                            print(f"[LinkedIn] Job {idx}: Location before callback: '{job_location}' (type: {type(job_location)})")
                        # If callback provided, call it to update DB with enriched data
                        if on_job_ready and callable(on_job_ready):
                            await on_job_ready(updated_job)
                except Exception as e:
                    if idx < 10:
                        print(f"[LinkedIn] Error enriching job {idx}: {e}")
                        import traceback
                        traceback.print_exc()
            
            # Process jobs in parallel batches for detail fetching
            batch_size = 10  # Process 10 jobs in parallel at a time (increased from 5 for faster processing)
            for batch_start in range(0, top_count, batch_size):
                batch_end = min(batch_start + batch_size, top_count)
                batch_tasks = [enrich_and_update(jobs[idx], idx) for idx in range(batch_start, batch_end)]
                
                # Process batch in parallel
                await asyncio.gather(*batch_tasks, return_exceptions=True)
                
                # Minimal delay between batches to avoid rate limiting (reduced from 0.5s)
                if batch_end < top_count:
                    await asyncio.sleep(0.2)  # 0.2s delay between batches
            
            detail_total_time = time.time() - detail_start
            if detail_fetch_count > 0:
                avg_detail_time = detail_total_time / detail_fetch_count
                # Count how many jobs have descriptions (check for both HTML and text)
                desc_count = 0
                desc_substantial = 0
                for j in jobs:
                    desc = getattr(j, 'description', None)
                    if desc:
                        # Check if it's HTML (contains tags) or plain text
                        desc_str = str(desc)
                        if desc_str.strip():
                            desc_count += 1
                            # Check if substantial (more than 100 chars of actual text content)
                            if len(desc_str) > 100:
                                # If HTML, check text content length
                                if '<' in desc_str and '>' in desc_str:
                                    from bs4 import BeautifulSoup
                                    try:
                                        soup = BeautifulSoup(desc_str, 'html.parser')
                                        text_len = len(soup.get_text(strip=True))
                                        if text_len > 100:
                                            desc_substantial += 1
                                    except:
                                        if len(desc_str) > 100:
                                            desc_substantial += 1
                                else:
                                    desc_substantial += 1
                
                print(f"[LinkedIn] Detail fetch summary: {detail_fetch_count} fetches, {detail_success_count} locations updated, {desc_count}/{len(jobs)} jobs have descriptions ({desc_substantial} substantial), total={detail_total_time:.2f}s, avg={avg_detail_time:.3f}s per fetch (parallel)")

        return jobs[: (query.max_results or len(jobs))]
    
    def _parse_html(self, html: str, keywords: str, max_results: int = 25) -> List[RawJob]:
        """Parse LinkedIn HTML response. Attempts to return up to max_results without filtering."""
        jobs: List[RawJob] = []
        try:
            soup = BeautifulSoup(html, 'html.parser')
            # Prefer direct anchors to job view pages
            job_cards = (
                soup.find_all('a', href=re.compile(r'/jobs/view/\d+'))
                or soup.select('li[data-occludable-job-id], div.base-card')
                or soup.find_all('div', {'data-entity-urn': True})
            )
            
            for card in job_cards[:max_results]:  # Limit to desired count
                try:
                    # Extract URL
                    link_elem = card if card.name == 'a' else card.find('a', href=re.compile(r'/jobs/view/'))
                    url = ""
                    if link_elem and link_elem.get('href'):
                        url = link_elem['href']
                        if not url.startswith('http'):
                            url = f"https://www.linkedin.com{url}"

                    # Title: try multiple extraction methods
                    title = ""
                    # Method 1: anchor text or nearby heading
                    if link_elem:
                        title = link_elem.get_text(strip=True)
                    if not title or len(title.strip()) <= 3:
                        tnode = card.find('h3') or card.find('h2') or card.find('span', class_=re.compile('title', re.I))
                        title = tnode.get_text(strip=True) if tnode else ""
                    
                    # Method 2: Extract from URL slug if title still missing
                    if not title or len(title.strip()) <= 3:
                        if url and '/jobs/view/' in url:
                            url_slug = url.split('/jobs/view/')[-1].split('?')[0]
                            # Decode URL encoding
                            url_slug = unquote(url_slug)
                            slug_parts = url_slug.rsplit('-', 1)  # Remove trailing ID
                            if slug_parts:
                                slug = slug_parts[0]
                                title = slug.replace('-', ' ').replace('%20', ' ').title()
                                # Remove "at Company" suffix if present
                                if ' at ' in title.lower():
                                    title = title.split(' at ')[0].strip()
                    
                    title = (title or "Job").strip()

                    # Company: try multiple extraction methods
                    company = ""
                    # Method 1: look for sibling/ancestor company element
                    parent = card.parent if card else None
                    for node in [card, parent, parent.parent if parent else None]:
                        if not node:
                            continue
                        c = (node.find('h4', class_=re.compile('subtitle|company', re.I)) 
                             or node.find('span', class_=re.compile('company', re.I)) 
                             or node.find('a', class_=re.compile('company', re.I)) 
                             or node.find('h4'))
                        if c and c.get_text(strip=True):
                            company = c.get_text(strip=True)
                            if len(company.strip()) > 1:
                                break
                    
                    # Method 2: Extract from URL slug if company still missing
                    if not company or len(company.strip()) <= 1:
                        if url and '/jobs/view/' in url:
                            url_slug = url.split('/jobs/view/')[-1].split('?')[0]
                            # Decode URL encoding
                            url_slug = unquote(url_slug)
                            if '-at-' in url_slug:
                                parts = url_slug.split('-at-')
                                if len(parts) > 1:
                                    company_slug = parts[1].rsplit('-', 1)[0]  # Remove trailing ID
                                    company = company_slug.replace('-', ' ').title()
                    
                    company = (company or "").strip()

                    # Location: best-effort with multiple strategies
                    location = ""
                    # Strategy 1: Try structured selectors
                    location_selectors = [
                        ('span', re.compile('location', re.I)),
                        ('div', re.compile('location', re.I)),
                        ('span', re.compile('metadata', re.I)),
                        ('div', re.compile('metadata', re.I)),
                    ]
                    for tag, pattern in location_selectors:
                        loc_elem = card.find(tag, class_=pattern) if hasattr(card, 'find') else None
                        if loc_elem:
                            loc_text = loc_elem.get_text(strip=True)
                            if loc_text and len(loc_text) > 1:
                                location = loc_text
                                break
                    
                    # Strategy 2: Try to extract from card's text content
                    if not location or len(location.strip()) <= 1:
                        card_text = card.get_text(separator='\n', strip=True) if hasattr(card, 'get_text') else ""
                        if card_text:
                            lines = [l.strip() for l in card_text.split('\n') if l.strip()]
                            # Skip first line (usually title) and look for location patterns
                            for line in lines[1:]:  # Skip first line (title)
                                line_lower = line.lower()
                                # Check if line looks like location (has common location indicators)
                                has_location_indicator = any(indicator in line_lower for indicator in [',', '•', 'remote', 'hybrid', 'on-site', 'onsite', 'full-time', 'part-time'])
                                # Skip if it's clearly action buttons or very long (likely title)
                                is_action_button = any(skip in line_lower for skip in ['view', 'apply', 'save', 'share', 'linkedin'])
                                # Very long lines (>60 chars) with title words are likely titles, not locations
                                is_likely_title = len(line) > 60 and any(title_word in line_lower for title_word in ['manager', 'director', 'engineer', 'developer', 'lead', 'senior', 'junior', 'analyst', 'specialist'])
                                # Location should be reasonable length (usually < 80 chars)
                                is_reasonable_length = 2 < len(line) < 80
                                
                                if has_location_indicator and not is_action_button and not is_likely_title and is_reasonable_length:
                                    location = line.strip()
                                    break
                    
                    location = (location or "").strip()
                    
                    # Do not filter out if company is missing; keep minimal records
                    if title or url:
                        # Normalize URL: remove query params for external_id generation to avoid duplicates
                        normalized_url = url.split('?')[0].split('#')[0] if url else ""
                        # Extract external_id: try to get numeric ID from /jobs/view/{id} or /jobs/view/{slug}-{id}
                        external_id = ""
                        if normalized_url:
                            # Pattern 1: /jobs/view/{id} (just numeric ID)
                            match = re.search(r'/jobs/view/(\d+)$', normalized_url)
                            if match:
                                external_id = match.group(1)
                            else:
                                # Pattern 2: /jobs/view/{slug}-{id} (slug followed by numeric ID at end)
                                match = re.search(r'/jobs/view/.+-(\d+)$', normalized_url)
                                if match:
                                    external_id = match.group(1)
                                else:
                                    # Fallback: use last path segment (for other URL formats)
                                    external_id = normalized_url.split('/')[-1] if normalized_url else ""
                        jobs.append(RawJob(
                            source=self.name,
                            external_id=external_id,
                            title=title,
                            company=company or "",
                            location=location,
                            url=normalized_url,  # Store normalized URL (without query params)
                            raw_data={"card_html": str(card)[:500], "original_url": url},  # Keep original URL in raw_data
                        ))
                except Exception as e:
                    print(f"[LinkedIn] Parse card error: {e}")
                    continue

            # Fallback: regex scan for job view URLs if none parsed
            if not jobs:
                seen = set()
                for m in re.finditer(r"/jobs/view/(\d+)", html):
                    jid = m.group(1)
                    if jid in seen:
                        continue
                    seen.add(jid)
                    url = f"https://www.linkedin.com/jobs/view/{jid}"
                    jobs.append(RawJob(
                        source=self.name,
                        external_id=jid,
                        title=keywords or "Job",
                        company="LinkedIn",
                        location="",
                        url=url,  # Already normalized (no query params)
                    ))
                    if len(jobs) >= max_results:
                        break
        except Exception as e:
            print(f"[LinkedIn] HTML parse error: {e}")
        
        return jobs
    
    async def _fetch_with_playwright(self, keywords: str, location: str, max_results: int, start_offset: int = 0) -> List[RawJob]:
        """Fetch jobs using Playwright (for dynamic content)."""
        try:
            from playwright.async_api import async_playwright
            
            print(f"[LinkedIn][Playwright] Starting fetch for keywords='{keywords}', location='{location}', max_results={max_results}")
            jobs: List[RawJob] = []
            async with async_playwright() as p:
                print("[LinkedIn][Playwright] Launching browser...")
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                )
                # Inject LI cookie if provided
                if self.li_at:
                    try:
                        await context.add_cookies([
                            {"name": "li_at", "value": self.li_at, "domain": ".linkedin.com", "path": "/", "httpOnly": True, "secure": True}
                        ])
                        print("[LinkedIn][Playwright] Added li_at cookie")
                    except Exception as e:
                        print(f"[LinkedIn][Playwright] Cookie add error: {e}")
                page = await context.new_page()
                
                # Build URL params - only include location if it's not empty (to fetch from everywhere when "Any" is selected)
                params = {
                    "keywords": keywords,
                    "start": start_offset,
                }
                if location and location.strip():
                    params["location"] = location
                url = f"{self.base_url}?{'&'.join([f'{k}={v}' for k, v in params.items()])}"
                print(f"[LinkedIn][Playwright] Navigating to: {url}")
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                print("[LinkedIn][Playwright] Page loaded")

                # Attempt to accept cookie/consent gates as guest
                try:
                    # Common consent buttons
                    consent_selectors = [
                        "button:has-text('Accept all')",
                        "button:has-text('Accept')",
                        "button[aria-label*='Accept']",
                        "[data-control-name='accept']",
                        "button[aria-label*='Agree']",
                        "button:has-text('I agree')",
                    ]
                    for sel in consent_selectors:
                        btn = await page.query_selector(sel)
                        if btn:
                            try:
                                await btn.click(timeout=3000)
                                print(f"[LinkedIn][Playwright] Clicked consent via {sel}")
                                break
                            except Exception:
                                pass
                    # Small wait after consent
                    await page.wait_for_timeout(1000)
                except Exception as e:
                    print(f"[LinkedIn][Playwright] Consent handling skipped: {e}")
                
                # Wait for job cards
                try:
                    await page.wait_for_selector('a[href*="/jobs/view/"]', timeout=10000)
                except Exception:
                    # One more small scroll+wait if slow content
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await page.wait_for_timeout(1500)
                
                # Scroll multiple times to load more jobs (especially for background worker)
                scroll_count = 3 if max_results > 25 else 1  # More scrolls for larger fetches
                print(f"[LinkedIn][Playwright] Scrolling {scroll_count} times to load jobs...")
                for scroll_idx in range(scroll_count):
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await page.wait_for_timeout(2000)
                    if scroll_idx < scroll_count - 1:
                        # Small scroll back up to trigger lazy loading
                        await page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.8)")
                        await page.wait_for_timeout(1000)
                print("[LinkedIn][Playwright] Scroll complete")
                
                # Extract job cards
                print("[LinkedIn][Playwright] Extracting job cards...")
                job_cards = await page.query_selector_all('a[href*="/jobs/view/"]')
                print(f"[LinkedIn][Playwright] Found {len(job_cards)} job card elements")
                seen_urls = set()
                
                for card in job_cards[:max_results]:
                    try:
                        href = await card.get_attribute('href')
                        if not href or href in seen_urls:
                            continue
                        seen_urls.add(href)
                        
                        if not href.startswith('http'):
                            href = f"https://www.linkedin.com{href}"
                        
                        # Try to extract title from multiple sources
                        title = ""
                        # Method 1: Try structured selectors (LinkedIn's current structure)
                        title_selectors = [
                            'h3.base-search-card__title',
                            'h3[class*="job-title"]',
                            'h3',
                            '.job-title',
                            'span[class*="title"]',
                            'a[class*="title"]',
                        ]
                        for sel in title_selectors:
                            try:
                                elem = await card.query_selector(sel)
                                if elem:
                                    title = await elem.inner_text()
                                    if title and len(title.strip()) > 3:
                                        break
                            except Exception:
                                continue
                        
                        # Method 2: Try aria-label on the card itself
                        if not title or len(title.strip()) <= 3:
                            aria = await card.get_attribute('aria-label')
                            if aria and len(aria.strip()) > 3:
                                # aria-label often has format "Job title at Company - Location"
                                parts = aria.split(' at ')
                                if parts:
                                    title = parts[0].strip()
                        
                        # Method 3: Try extracting from URL slug (last resort)
                        if not title or len(title.strip()) <= 3:
                            # URL format: /jobs/view/job-title-slug-at-company-123456
                            url_slug = href.split('/jobs/view/')[-1].split('?')[0]
                            # Decode URL encoding (e.g., %E2%80%93 -> em dash)
                            url_slug = unquote(url_slug)
                            # Remove job ID and decode
                            slug_parts = url_slug.rsplit('-', 1)  # Remove trailing ID
                            if slug_parts:
                                slug = slug_parts[0]
                                # Replace hyphens with spaces and title case
                                title = slug.replace('-', ' ').replace('%20', ' ').title()
                                # Remove "at Company" suffix if present
                                if ' at ' in title.lower():
                                    title = title.split(' at ')[0].strip()
                        
                        title = (title or "Job").strip()

                        # Extract company from multiple sources
                        company = ""
                        # Method 1: Try structured selectors
                        company_selectors = [
                            'h4.base-search-card__subtitle',
                            'h4[class*="company"]',
                            'h4',
                            '.base-search-card__subtitle',
                            '.job-card-container__company-name',
                            'span[class*="company"]',
                            'a[class*="company"]',
                        ]
                        for sel in company_selectors:
                            try:
                                elem = await card.query_selector(sel)
                                if elem:
                                    company = await elem.inner_text()
                                    if company and len(company.strip()) > 1:
                                        break
                            except Exception:
                                continue
                        
                        # Method 2: Try extracting from aria-label
                        if not company or len(company.strip()) <= 1:
                            aria = await card.get_attribute('aria-label')
                            if aria and ' at ' in aria:
                                parts = aria.split(' at ')
                                if len(parts) > 1:
                                    company_part = parts[1].split(' - ')[0]  # Remove location if present
                                    company = company_part.strip()
                        
                        # Method 3: Try extracting from URL slug
                        if not company or len(company.strip()) <= 1:
                            url_slug = href.split('/jobs/view/')[-1].split('?')[0]
                            # Decode URL encoding
                            url_slug = unquote(url_slug)
                            if ' at ' in url_slug or '-at-' in url_slug:
                                # Extract company from slug
                                if '-at-' in url_slug:
                                    parts = url_slug.split('-at-')
                                    if len(parts) > 1:
                                        company_slug = parts[1].rsplit('-', 1)[0]  # Remove trailing ID
                                        company = company_slug.replace('-', ' ').title()
                        
                        company = (company or "").strip()

                        # Extract location (best-effort with multiple strategies)
                        location = ""
                        # Strategy 1: Try structured selectors
                        location_selectors = [
                            '.job-search-card__location',
                            '.base-search-card__metadata',
                            'span[class*="location"]',
                            '.job-card-container__metadata-item',
                            '.base-search-card__metadata-item',
                            '[data-test-job-location]',
                            'span[class*="metadata"]',
                        ]
                        for sel in location_selectors:
                            try:
                                elem = await card.query_selector(sel)
                                if elem:
                                    loc_text = await elem.inner_text()
                                    if loc_text and len(loc_text.strip()) > 1:
                                        location = loc_text.strip()
                                        break
                            except Exception:
                                continue
                        
                        # Strategy 2: Try aria-label (format: "Job title at Company - Location")
                        if not location or len(location.strip()) <= 1:
                            aria = await card.get_attribute('aria-label')
                            if aria:
                                # Try " - " separator first
                                if ' - ' in aria:
                                    parts = aria.split(' - ')
                                    if len(parts) > 1:
                                        location = parts[-1].strip()
                                # Try " at " then " - " (e.g., "Title at Company - Location")
                                elif ' at ' in aria:
                                    after_at = aria.split(' at ', 1)[1]
                                    if ' - ' in after_at:
                                        location = after_at.split(' - ', 1)[1].strip()
                        
                        # Strategy 3: Try to extract from card's full text content (location often appears after company)
                        if not location or len(location.strip()) <= 1:
                            try:
                                # Get all text from the card and nearby elements
                                card_text = await card.inner_text()
                                if card_text:
                                    # Look for patterns like "Company • Location" or "Company, Location"
                                    lines = [l.strip() for l in card_text.split('\n') if l.strip()]
                                    # Skip first line (usually title) and look for location patterns
                                    for line in lines[1:]:  # Skip first line (title)
                                        line_lower = line.lower()
                                        # Check if line looks like location (has common location indicators)
                                        has_location_indicator = any(indicator in line_lower for indicator in [',', '•', 'remote', 'hybrid', 'on-site', 'onsite', 'full-time', 'part-time'])
                                        # Skip if it's clearly action buttons or very long (likely title)
                                        is_action_button = any(skip in line_lower for skip in ['view', 'apply', 'save', 'share', 'linkedin'])
                                        # Very long lines (>60 chars) with title words are likely titles, not locations
                                        is_likely_title = len(line) > 60 and any(title_word in line_lower for title_word in ['manager', 'director', 'engineer', 'developer', 'lead', 'senior', 'junior', 'analyst', 'specialist'])
                                        # Location should be reasonable length (usually < 80 chars)
                                        is_reasonable_length = 2 < len(line) < 80
                                        
                                        if has_location_indicator and not is_action_button and not is_likely_title and is_reasonable_length:
                                            location = line.strip()
                                            break
                            except Exception:
                                pass
                        
                        location = (location or "").strip()
                        
                        # Debug: log first job's location extraction
                        if len(jobs) == 0:
                            try:
                                print(f"[LinkedIn][Playwright] First job location extraction: '{location}'")
                            except Exception:
                                pass

                        # Accept minimal records if we have a URL
                        # Normalize URL: remove query params for external_id generation to avoid duplicates
                        normalized_href = href.split('?')[0].split('#')[0] if href else ""
                        # Extract external_id: try to get numeric ID from /jobs/view/{id} or /jobs/view/{slug}-{id}
                        external_id = ""
                        if normalized_href:
                            # Pattern 1: /jobs/view/{id} (just numeric ID)
                            match = re.search(r'/jobs/view/(\d+)$', normalized_href)
                            if match:
                                external_id = match.group(1)
                            else:
                                # Pattern 2: /jobs/view/{slug}-{id} (slug followed by numeric ID at end)
                                match = re.search(r'/jobs/view/.+-(\d+)$', normalized_href)
                                if match:
                                    external_id = match.group(1)
                                else:
                                    # Fallback: use last path segment (for other URL formats)
                                    external_id = normalized_href.split('/')[-1] if normalized_href else ""
                        
                        jobs.append(RawJob(
                            source=self.name,
                            external_id=external_id,
                            title=title,
                            company=company,
                            location=location,
                            url=normalized_href,  # Store normalized URL (without query params)
                            raw_data={"via": "playwright", "original_href": href},  # Keep original URL in raw_data
                        ))
                    except Exception as e:
                        print(f"[LinkedIn][Playwright] Card parse error: {e}")
                        import traceback
                        traceback.print_exc()
                        continue
                
                print(f"[LinkedIn][Playwright] Successfully parsed {len(jobs)} jobs from {len(job_cards)} cards")
                await browser.close()
                print("[LinkedIn][Playwright] Browser closed")
        except ImportError:
            print("[LinkedIn] Playwright not installed, skipping")
            import traceback
            traceback.print_exc()
        except Exception as e:
            print(f"[LinkedIn][Playwright] Error: {e}")
            import traceback
            traceback.print_exc()
        
        print(f"[LinkedIn][Playwright] Returning {len(jobs)} jobs")
        return jobs

    def _fetch_description_http(self, job_url: str, return_html: bool = True) -> str:
        """Fetch job description from a LinkedIn job detail page without login using HTTP.
        Returns HTML if return_html=True (default), otherwise plain text (may be empty if blocked)."""
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }
            with httpx.Client(timeout=10.0, follow_redirects=True, headers=headers) as client:
                resp = client.get(job_url)
                if resp.status_code != 200 or not resp.text:
                    return ""
                soup = BeautifulSoup(resp.text, "html.parser")
                # Common selectors for non-auth overview/description
                # New UI
                desc = (
                    soup.select_one("section.show-more-less-html")
                    or soup.select_one("[data-test-job-description]")
                    or soup.select_one(".jobs-description__content")
                    or soup.select_one(".description__text")
                )
                if desc:
                    if return_html:
                        # Remove UI artifacts like "Show more/less" buttons but preserve HTML structure
                        import re as _re
                        # Remove show more/less buttons and their wrappers
                        for btn in desc.select("button, a"):
                            btn_text = btn.get_text(strip=True).lower()
                            if "show more" in btn_text or "show less" in btn_text:
                                btn.decompose()
                        # Get HTML content
                        html_content = str(desc)
                        # Clean up any remaining "Show more/less" text artifacts
                        html_content = _re.sub(r'<[^>]*>\s*(show\s*(more|less))\s*</[^>]*>', '', html_content, flags=_re.I)
                        return html_content
                    else:
                        text = desc.get_text(separator=" ", strip=True)
                        # Remove UI artifacts like "Show more/less"
                        import re as _re
                        text = _re.sub(r"\bshow\s*(more|less)\b", "", text, flags=_re.I)
                        return text
                # JSON-LD fallback
                ld = soup.find("script", {"type": "application/ld+json"})
                if ld and ld.string:
                    import json as _json
                    try:
                        data = _json.loads(ld.string)
                        if isinstance(data, dict) and data.get("@type") == "JobPosting":
                            d = data.get("description") or ""
                            if return_html:
                                # JSON-LD description may already be HTML or plain text
                                # If it looks like HTML, return it; otherwise wrap in <p>
                                if "<" in d and ">" in d:
                                    # Likely HTML, clean it up
                                    d_soup = BeautifulSoup(d, "html.parser")
                                    # Remove show more/less artifacts
                                    import re as _re
                                    for btn in d_soup.select("button, a"):
                                        btn_text = btn.get_text(strip=True).lower()
                                        if "show more" in btn_text or "show less" in btn_text:
                                            btn.decompose()
                                    return str(d_soup)
                                else:
                                    # Plain text, wrap in paragraphs
                                    import re as _re
                                    d_clean = _re.sub(r"\bshow\s*(more|less)\b", "", d, flags=_re.I)
                                    return f"<p>{d_clean}</p>"
                            else:
                                # strip HTML if present and remove show more/less
                                d_soup = BeautifulSoup(d, "html.parser")
                                txt = d_soup.get_text(separator=" ", strip=True)
                                import re as _re
                                txt = _re.sub(r"\bshow\s*(more|less)\b", "", txt, flags=_re.I)
                                return txt
                    except Exception:
                        pass
                return ""
        except Exception:
            return ""

    async def _fetch_detail_and_location_http_async(self, job_url: str, debug: bool = False) -> dict:
        """Async version: Return {'description_html': str|None, 'location': str|None, 'posted_at': datetime|None} from LinkedIn job detail page."""
        out = {"description_html": None, "location": None, "posted_at": None}
        try:
            # Normalize URL: convert in.linkedin.com to www.linkedin.com for consistency
            # Indian LinkedIn often has different page structures, so normalize to www
            normalized_url = job_url.replace("in.linkedin.com", "www.linkedin.com")
            
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1",
                "Referer": "https://www.linkedin.com/jobs/search/",
            }
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True, headers=headers) as client:
                resp = await client.get(normalized_url)
                
                if resp.status_code != 200:
                    if debug:
                        print(f"[LinkedIn Detail] Status {resp.status_code} for {job_url[:60]}...")
                    # Mark as blocked if 999
                    if resp.status_code == 999:
                        out["_blocked"] = True
                        out["_status_999"] = True
                    return out
                
                if not resp.text:
                    if debug:
                        print(f"[LinkedIn Detail] Empty response for {job_url[:60]}...")
                    return out
                
                # Check for common error/blocking indicators
                resp_lower = resp.text.lower()
                if len(resp.text) < 1000:
                    if debug:
                        print(f"[LinkedIn Detail] Response too short ({len(resp.text)} chars) for {job_url[:60]}...")
                    return out
                
                # Check if LinkedIn is blocking or showing login page
                blocking_indicators = [
                    "sign in to continue",
                    "join linkedin",
                    "unable to process",
                    "access denied",
                    "challenge",
                    "captcha",
                    "rate limit",
                ]
                if any(indicator in resp_lower for indicator in blocking_indicators):
                    if debug:
                        print(f"[LinkedIn Detail] Blocked/Login page detected for {job_url[:60]}...")
                    return out
                
                soup = BeautifulSoup(resp.text, "html.parser")

                # Description - try multiple selectors in order of preference
                desc = None
                selectors = [
                    "section.show-more-less-html",
                    "[data-test-job-description]",
                    ".jobs-description__content",
                    ".description__text",
                    "div.jobs-description-content__text",
                    "div[class*='description']",
                    "div[class*='job-description']",
                    "div.description",
                ]
                for sel in selectors:
                    try:
                        desc = soup.select_one(sel)
                        if desc:
                            # Verify it has content
                            text_content = desc.get_text(strip=True)
                            if len(text_content) > 50:
                                if debug:
                                    print(f"[LinkedIn Detail] Found description using selector '{sel}' ({len(text_content)} chars)")
                                break
                            desc = None
                    except Exception:
                        continue
                
                # Fallback: try to find description in JSON-LD
                if not desc:
                    try:
                        ld_scripts = soup.find_all("script", {"type": "application/ld+json"})
                        for ld in ld_scripts:
                            if ld and ld.string:
                                import json as _json
                                try:
                                    data = _json.loads(ld.string)
                                    if isinstance(data, dict) and data.get("@type") == "JobPosting":
                                        desc_text = data.get("description") or ""
                                        if desc_text and len(desc_text) > 50:
                                            # Wrap in HTML
                                            out["description_html"] = f"<div>{desc_text}</div>"
                                            if debug:
                                                print(f"[LinkedIn Detail] Found description in JSON-LD ({len(desc_text)} chars)")
                                            break
                                except Exception:
                                    continue
                    except Exception:
                        pass
                
                if desc and not out.get("description_html"):
                    # Remove UI artifacts
                    for btn in desc.select("button, a"):
                        try:
                            btn_text = btn.get_text(strip=True).lower()
                            if "show more" in btn_text or "show less" in btn_text:
                                btn.decompose()
                        except Exception:
                            pass
                    desc_html = str(desc)
                    # Only return if it has substantial content
                    if len(desc_html.strip()) > 50:
                        out["description_html"] = desc_html
                
                if debug and not out.get("description_html"):
                    # Debug: check what's on the page
                    page_title = soup.find("title")
                    title_text = page_title.get_text(strip=True) if page_title else "No title"
                    print(f"[LinkedIn Detail] No description found. Page title: {title_text[:80]}")
                    # Check if page has job-related content
                    has_job_content = any(term in resp_lower for term in ["job", "position", "role", "apply"])
                    print(f"[LinkedIn Detail] Has job content: {has_job_content}, Response length: {len(resp.text)}")

                # Location and posted_at - try JSON-LD first, then selectors
                try:
                    ld_scripts = soup.find_all("script", {"type": "application/ld+json"})
                    for ld in ld_scripts:
                        if ld and ld.string:
                            import json as _json
                            try:
                                data = _json.loads(ld.string)
                                if isinstance(data, dict) and data.get("@type") == "JobPosting":
                                    # Extract location
                                    job_loc = data.get("jobLocation")
                                    if isinstance(job_loc, dict) and not out.get("location"):
                                        addr = job_loc.get("address") or {}
                                        city = addr.get("addressLocality") or ""
                                        region = addr.get("addressRegion") or ""
                                        country = addr.get("addressCountry") or ""
                                        parts = [p for p in [city, region, country] if p]
                                        if parts:
                                            out["location"] = ", ".join(parts)
                                    
                                    # Extract posted_at (datePosted)
                                    if not out.get("posted_at"):
                                        date_posted = data.get("datePosted")
                                        if date_posted:
                                            try:
                                                from datetime import datetime
                                                if isinstance(date_posted, str):
                                                    iso = date_posted.strip().replace('Z', '+00:00')
                                                    try:
                                                        out["posted_at"] = datetime.fromisoformat(iso)
                                                        if debug:
                                                            print(f"[LinkedIn Detail] Found posted_at in JSON-LD (ISO): {out['posted_at']}")
                                                    except Exception:
                                                        # Fallback to date-only parse
                                                        try:
                                                            out["posted_at"] = datetime.strptime(date_posted[:10], "%Y-%m-%d")
                                                            if debug:
                                                                print(f"[LinkedIn Detail] Found posted_at in JSON-LD (date-only): {out['posted_at']}")
                                                        except Exception:
                                                            pass
                                            except Exception as date_err:
                                                if debug:
                                                    print(f"[LinkedIn Detail] Failed to parse datePosted: {date_err}")
                            except Exception:
                                continue
                except Exception:
                    pass

                # Top-card selectors if still missing
                if not out["location"]:
                    location_selectors = [
                        "[data-test-top-card-location]",
                        ".jobs-unified-top-card__bullet",
                        ".jobs-details-top-card__exact-location",
                        ".topcard__flavor--bullet",
                        ".jobs-unified-top-card__primary-description",
                        ".jobs-unified-top-card__primary-description-without-tagline",
                        "[data-test-job-location]",
                        ".jobs-details-top-card__job-info-text",
                        "span[class*='location']",
                        "div[class*='location']",
                    ]
                    for sel in location_selectors:
                        try:
                            elem = soup.select_one(sel)
                            if elem:
                                loc_text = elem.get_text(strip=True)
                                if loc_text and len(loc_text) > 2:
                                    out["location"] = loc_text
                                    break
                        except Exception:
                            continue
                
                # Extract posted_at from HTML if not found in JSON-LD
                if not out.get("posted_at"):
                    try:
                        from datetime import datetime, timedelta
                        import re
                        
                        # Helper function to parse relative time from text
                        def parse_relative_time(text):
                            """Parse relative time strings like '6 days ago', '2 weeks ago', '1 month ago'"""
                            if not text:
                                return None
                            text_lower = text.lower()
                            # Look for patterns like "6 days ago", "2 weeks ago", "1 month ago", "1 hour ago", "just now"
                            patterns = [
                                (r'(\d+)\s*(hour|hr)\s*ago', lambda m: timedelta(hours=int(m.group(1)))),
                                (r'(\d+)\s*(minute|min)\s*ago', lambda m: timedelta(minutes=int(m.group(1)))),
                                (r'just\s*now', lambda m: timedelta(seconds=0)),
                                (r'(\d+)\s*(day|days)\s*ago', lambda m: timedelta(days=int(m.group(1)))),
                                (r'(\d+)\s*(week|weeks)\s*ago', lambda m: timedelta(weeks=int(m.group(1)))),
                                (r'(\d+)\s*(month|months)\s*ago', lambda m: timedelta(days=int(m.group(1)) * 30)),
                            ]
                            for pattern, delta_func in patterns:
                                match = re.search(pattern, text_lower)
                                if match:
                                    delta = delta_func(match)
                                    return datetime.now() - delta
                            return None
                        
                        # Try to find posted date in various formats
                        posted_selectors = [
                            "[data-test-posted-date]",
                            ".jobs-unified-top-card__posted-date",
                            ".jobs-details-top-card__posted-date",
                            "time[datetime]",
                            "span[class*='posted']",
                            "div[class*='posted']",
                        ]
                        for sel in posted_selectors:
                            try:
                                elem = soup.select_one(sel)
                                if elem:
                                    # Try datetime attribute first
                                    datetime_attr = elem.get("datetime")
                                    if datetime_attr:
                                        try:
                                            out["posted_at"] = datetime.fromisoformat(datetime_attr.replace('Z', '+00:00'))
                                            if debug:
                                                print(f"[LinkedIn Detail] Found posted_at from datetime attr: {out['posted_at']}")
                                            break
                                        except Exception:
                                            pass
                                    
                                    # Try parsing text content
                                    text = elem.get_text(strip=True)
                                    if text:
                                        parsed = parse_relative_time(text)
                                        if parsed:
                                            out["posted_at"] = parsed
                                            if debug:
                                                print(f"[LinkedIn Detail] Found posted_at from relative time in selector '{sel}': {out['posted_at']}")
                                            break
                            except Exception:
                                continue
                        
                        # If still not found, search in top card area where location is (often contains "location · X days ago")
                        if not out.get("posted_at"):
                            top_card_selectors = [
                                ".jobs-unified-top-card__primary-description",
                                ".jobs-unified-top-card__primary-description-without-tagline",
                                ".jobs-details-top-card__job-info-text",
                                "[data-test-top-card-location]",
                                ".jobs-unified-top-card__bullet",
                            ]
                            for sel in top_card_selectors:
                                try:
                                    elem = soup.select_one(sel)
                                    if elem:
                                        text = elem.get_text(strip=True)
                                        # Text often looks like "Location · X days ago · applicants"
                                        # Split by "·" and check each part for relative time
                                        if "·" in text:
                                            parts = [p.strip() for p in text.split("·")]
                                            for part in parts:
                                                parsed = parse_relative_time(part)
                                                if parsed:
                                                    out["posted_at"] = parsed
                                                    if debug:
                                                        print(f"[LinkedIn Detail] Found posted_at from top card text: {out['posted_at']}")
                                                    break
                                            if out.get("posted_at"):
                                                break
                                        else:
                                            # Check the whole text
                                            parsed = parse_relative_time(text)
                                            if parsed:
                                                out["posted_at"] = parsed
                                                if debug:
                                                    print(f"[LinkedIn Detail] Found posted_at from top card text: {out['posted_at']}")
                                                break
                                except Exception:
                                    continue
                    except Exception as e:
                        if debug:
                            print(f"[LinkedIn Detail] Error extracting posted_at: {e}")
                        pass
        except Exception as e:
            # Don't fail silently - log errors for debugging
            pass
        return out
    
    def _fetch_detail_and_location_http(self, job_url: str) -> dict:
        """Return {'description_html': str|None, 'location': str|None, 'posted_at': datetime|None} from LinkedIn job detail page."""
        out = {"description_html": None, "location": None, "posted_at": None}
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }
            with httpx.Client(timeout=10.0, follow_redirects=True, headers=headers) as client:
                resp = client.get(job_url)
                if resp.status_code != 200 or not resp.text:
                    return out
                soup = BeautifulSoup(resp.text, "html.parser")

                # Description
                desc = (
                    soup.select_one("section.show-more-less-html")
                    or soup.select_one("[data-test-job-description]")
                    or soup.select_one(".jobs-description__content")
                    or soup.select_one(".description__text")
                )
                if desc:
                    # Remove UI artifacts
                    for btn in desc.select("button, a"):
                        try:
                            btn_text = btn.get_text(strip=True).lower()
                            if "show more" in btn_text or "show less" in btn_text:
                                btn.decompose()
                        except Exception:
                            pass
                    out["description_html"] = str(desc)

                # JSON-LD location and posted_at
                try:
                    ld = soup.find("script", {"type": "application/ld+json"})
                    if ld and ld.string:
                        import json as _json
                        data = _json.loads(ld.string)
                        if isinstance(data, dict) and data.get("@type") == "JobPosting":
                            # Extract location
                            job_loc = data.get("jobLocation")
                            if isinstance(job_loc, dict) and not out.get("location"):
                                addr = job_loc.get("address") or {}
                                city = addr.get("addressLocality") or ""
                                region = addr.get("addressRegion") or ""
                                country = addr.get("addressCountry") or ""
                                parts = [p for p in [city, region, country] if p]
                                if parts:
                                    out["location"] = ", ".join(parts)
                            
                            # Extract posted_at (datePosted)
                            if not out.get("posted_at"):
                                date_posted = data.get("datePosted")
                                if date_posted:
                                    try:
                                        from datetime import datetime
                                        if isinstance(date_posted, str):
                                            iso = date_posted.strip().replace('Z', '+00:00')
                                            try:
                                                out["posted_at"] = datetime.fromisoformat(iso)
                                            except Exception:
                                                try:
                                                    out["posted_at"] = datetime.strptime(date_posted[:10], "%Y-%m-%d")
                                                except Exception:
                                                    pass
                                    except Exception:
                                        pass
                except Exception:
                    pass

                # Top-card selectors if still missing
                if not out["location"]:
                    for sel in [
                        "[data-test-top-card-location]",
                        ".jobs-unified-top-card__bullet",
                        ".jobs-details-top-card__exact-location",
                        ".topcard__flavor--bullet",
                        ".jobs-unified-top-card__primary-description",
                    ]:
                        el = soup.select_one(sel)
                        if el and el.get_text(strip=True):
                            txt = el.get_text(strip=True)
                            if ("," in txt) or (any(w in txt.lower() for w in ["remote", "hybrid", "onsite", "on-site"])):
                                out["location"] = txt
                                break

                # Last resort: infer Remote from description
                if not out["location"] and out.get("description_html"):
                    if "remote" in out["description_html"].lower():
                        out["location"] = "Remote"
                
                # Extract posted_at from HTML if not found in JSON-LD
                if not out.get("posted_at"):
                    try:
                        from datetime import datetime, timedelta
                        import re
                        
                        # Helper function to parse relative time from text
                        def parse_relative_time(text):
                            """Parse relative time strings like '6 days ago', '2 weeks ago', '1 month ago'"""
                            if not text:
                                return None
                            text_lower = text.lower()
                            # Look for patterns like "6 days ago", "2 weeks ago", "1 month ago", "1 hour ago", "just now"
                            patterns = [
                                (r'(\d+)\s*(hour|hr)\s*ago', lambda m: timedelta(hours=int(m.group(1)))),
                                (r'(\d+)\s*(minute|min)\s*ago', lambda m: timedelta(minutes=int(m.group(1)))),
                                (r'just\s*now', lambda m: timedelta(seconds=0)),
                                (r'(\d+)\s*(day|days)\s*ago', lambda m: timedelta(days=int(m.group(1)))),
                                (r'(\d+)\s*(week|weeks)\s*ago', lambda m: timedelta(weeks=int(m.group(1)))),
                                (r'(\d+)\s*(month|months)\s*ago', lambda m: timedelta(days=int(m.group(1)) * 30)),
                            ]
                            for pattern, delta_func in patterns:
                                match = re.search(pattern, text_lower)
                                if match:
                                    delta = delta_func(match)
                                    return datetime.now() - delta
                            return None
                        
                        # Try to find posted date in various formats
                        posted_selectors = [
                            "[data-test-posted-date]",
                            ".jobs-unified-top-card__posted-date",
                            ".jobs-details-top-card__posted-date",
                            "time[datetime]",
                            "span[class*='posted']",
                            "div[class*='posted']",
                        ]
                        for sel in posted_selectors:
                            try:
                                elem = soup.select_one(sel)
                                if elem:
                                    # Try datetime attribute first
                                    datetime_attr = elem.get("datetime")
                                    if datetime_attr:
                                        try:
                                            out["posted_at"] = datetime.fromisoformat(datetime_attr.replace('Z', '+00:00'))
                                            break
                                        except Exception:
                                            pass
                                    
                                    # Try parsing text content
                                    text = elem.get_text(strip=True)
                                    if text:
                                        parsed = parse_relative_time(text)
                                        if parsed:
                                            out["posted_at"] = parsed
                                            break
                            except Exception:
                                continue
                        
                        # If still not found, search in top card area where location is (often contains "location · X days ago")
                        if not out.get("posted_at"):
                            top_card_selectors = [
                                ".jobs-unified-top-card__primary-description",
                                ".jobs-unified-top-card__primary-description-without-tagline",
                                ".jobs-details-top-card__job-info-text",
                                "[data-test-top-card-location]",
                                ".jobs-unified-top-card__bullet",
                            ]
                            for sel in top_card_selectors:
                                try:
                                    elem = soup.select_one(sel)
                                    if elem:
                                        text = elem.get_text(strip=True)
                                        # Text often looks like "Location · X days ago · applicants"
                                        # Split by "·" and check each part for relative time
                                        if "·" in text:
                                            parts = [p.strip() for p in text.split("·")]
                                            for part in parts:
                                                parsed = parse_relative_time(part)
                                                if parsed:
                                                    out["posted_at"] = parsed
                                                    break
                                            if out.get("posted_at"):
                                                break
                                        else:
                                            # Check the whole text
                                            parsed = parse_relative_time(text)
                                            if parsed:
                                                out["posted_at"] = parsed
                                                break
                                except Exception:
                                    continue
                    except Exception:
                        pass
        except Exception:
            return out
    
    async def _fetch_detail_with_playwright(self, job_url: str) -> dict:
        """Fallback: Fetch job detail using Playwright when HTTP is blocked (999)."""
        out = {"description_html": None, "location": None, "posted_at": None}
        try:
            from playwright.async_api import async_playwright
            
            # Normalize URL: convert in.linkedin.com to www.linkedin.com for consistency
            # Also remove query params to avoid duplicates
            normalized_url = job_url.replace("in.linkedin.com", "www.linkedin.com")
            normalized_url = normalized_url.split('?')[0].split('#')[0]  # Remove query params and fragments
            
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                )
                # Inject LI cookie if provided
                if self.li_at:
                    try:
                        await context.add_cookies([
                            {"name": "li_at", "value": self.li_at, "domain": ".linkedin.com", "path": "/", "httpOnly": True, "secure": True}
                        ])
                    except Exception:
                        pass
                
                page = await context.new_page()
                
                # Handle consent/blocking for Indian LinkedIn
                try:
                    await page.goto(normalized_url, wait_until="domcontentloaded", timeout=20000)
                    await page.wait_for_timeout(5000)  # Wait longer for content to load (especially for in.linkedin.com)
                    
                    # Try to handle consent dialogs (common on in.linkedin.com)
                    consent_selectors = [
                        "button:has-text('Accept all')",
                        "button:has-text('Accept')",
                        "button[aria-label*='Accept']",
                        "[data-control-name='accept']",
                        "button:has-text('I agree')",
                        "button:has-text('Continue')",
                    ]
                    for sel in consent_selectors:
                        try:
                            btn = await page.query_selector(sel)
                            if btn:
                                await btn.click(timeout=3000)
                                await page.wait_for_timeout(2000)  # Wait after consent
                                break
                        except Exception:
                            continue
                    
                    # Check if page loaded correctly - look for actual job content, not just title
                    page_title = await page.title()
                    page_url = page.url
                    
                    # Check if we were actually redirected to a login/signup page (not just has sign-in buttons)
                    # LinkedIn job pages often have "Sign in" buttons but still show job content
                    is_login_page = await page.evaluate("""
                        () => {
                            const title = document.title.toLowerCase();
                            const url = window.location.href.toLowerCase();
                            const bodyText = document.body.innerText.toLowerCase();
                            
                            // Check if we're on an actual login/signup page (not a job page with sign-in prompts)
                            const isLoginUrl = url.includes('/login') || url.includes('/signup') || url.includes('/reg/');
                            const isLoginTitle = (title.includes('sign up') || title.includes('sign in')) && 
                                                !bodyText.includes('job') && !bodyText.includes('apply') && 
                                                !bodyText.includes('company') && bodyText.length < 500;
                            
                            // Check if page has job content (even if it has sign-in prompts)
                            const hasJobContent = bodyText.includes('job') || bodyText.includes('apply') || 
                                                 bodyText.includes('company') || bodyText.includes('responsibilities') ||
                                                 bodyText.includes('qualifications') || bodyText.includes('requirements');
                            
                            return isLoginUrl || (isLoginTitle && !hasJobContent);
                        }
                    """)
                    
                    if is_login_page:
                        print(f"[LinkedIn Playwright] Actually redirected to login/signup page for {job_url[:60]}...")
                        await browser.close()
                        return out
                    
                    # Check if page has job-related content
                    page_text = await page.evaluate("document.body.innerText")
                    if not page_text or len(page_text) < 100:
                        # Page might not have loaded, try scrolling to trigger lazy loading
                        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                        await page.wait_for_timeout(2000)
                        await page.evaluate("window.scrollTo(0, 0)")
                        await page.wait_for_timeout(1000)
                        
                        # Re-check if it's actually a login page (not just has sign-in buttons)
                        is_login_page = await page.evaluate("""
                            () => {
                                const title = document.title.toLowerCase();
                                const url = window.location.href.toLowerCase();
                                const bodyText = document.body.innerText.toLowerCase();
                                
                                const isLoginUrl = url.includes('/login') || url.includes('/signup') || url.includes('/reg/');
                                const isLoginTitle = (title.includes('sign up') || title.includes('sign in')) && 
                                                    !bodyText.includes('job') && !bodyText.includes('apply') && 
                                                    !bodyText.includes('company') && bodyText.length < 500;
                                const hasJobContent = bodyText.includes('job') || bodyText.includes('apply') || 
                                                     bodyText.includes('company') || bodyText.includes('responsibilities');
                                
                                return isLoginUrl || (isLoginTitle && !hasJobContent);
                            }
                        """)
                        if is_login_page:
                            print(f"[LinkedIn Playwright] Actually redirected to login/signup page after scroll for {job_url[:60]}...")
                            await browser.close()
                            return out
                    
                except Exception as nav_err:
                    # If navigation fails, try original URL
                    try:
                        await page.goto(job_url, wait_until="domcontentloaded", timeout=20000)
                        await page.wait_for_timeout(3000)
                    except Exception:
                        await browser.close()
                        return out
                
                # Extract description - try multiple strategies
                desc_found = False
                
                # Strategy 1: Try data-test attributes (most reliable)
                test_selectors = [
                    "[data-test-job-description]",
                    "[data-test-id='job-details-description']",
                    "[data-test-id='job-details']",
                ]
                for sel in test_selectors:
                    try:
                        # Try with wait first, then without (longer timeout for in.linkedin.com)
                        try:
                            desc_elem = await page.wait_for_selector(sel, timeout=10000, state="attached")
                        except Exception:
                            desc_elem = await page.query_selector(sel)
                        
                        if desc_elem:
                            desc_html = await desc_elem.inner_html()
                            if desc_html and len(desc_html.strip()) > 50:
                                out["description_html"] = desc_html
                                desc_found = True
                                break
                    except Exception:
                        continue
                
                # Strategy 2: Try class-based selectors
                if not desc_found:
                    desc_selectors = [
                        "section.show-more-less-html",
                        ".jobs-description__content",
                        ".description__text",
                        "div.jobs-description-content__text",
                        "div[class*='description']",
                        "div[class*='job-description']",
                        "div.jobs-description",
                        "div[class*='jobs-details']",
                    ]
                    for sel in desc_selectors:
                        try:
                            # Try with wait first (longer timeout for in.linkedin.com)
                            try:
                                desc_elem = await page.wait_for_selector(sel, timeout=8000, state="attached")
                            except Exception:
                                desc_elem = await page.query_selector(sel)
                            
                            if desc_elem:
                                desc_html = await desc_elem.inner_html()
                                if desc_html and len(desc_html.strip()) > 50:
                                    out["description_html"] = desc_html
                                    desc_found = True
                                    break
                        except Exception:
                            continue
                    
                    # If still not found, try clicking "Show more" button and retry
                    if not desc_found:
                        try:
                            show_more_btn = await page.query_selector("button:has-text('Show more'), button[aria-label*='Show more']")
                            if show_more_btn:
                                await show_more_btn.click(timeout=3000)
                                await page.wait_for_timeout(1000)
                                # Retry selectors after clicking show more
                                for sel in desc_selectors[:3]:  # Try first 3 again
                                    try:
                                        desc_elem = await page.query_selector(sel)
                                        if desc_elem:
                                            desc_html = await desc_elem.inner_html()
                                            if desc_html and len(desc_html.strip()) > 50:
                                                out["description_html"] = desc_html
                                                desc_found = True
                                                break
                                    except Exception:
                                        continue
                        except Exception:
                            pass
                
                # Fallback: Try JSON-LD if selectors failed
                if not out.get("description_html"):
                    try:
                        json_ld_scripts = await page.query_selector_all('script[type="application/ld+json"]')
                        for script in json_ld_scripts:
                            try:
                                content = await script.inner_text()
                                import json as _json
                                data = _json.loads(content)
                                if isinstance(data, dict) and data.get("@type") == "JobPosting":
                                    desc_text = data.get("description") or ""
                                    if desc_text and len(desc_text) > 50:
                                        out["description_html"] = f"<div>{desc_text}</div>"
                                        if "in.linkedin.com" in job_url:
                                            print(f"[LinkedIn Playwright] Found description in JSON-LD for in.linkedin.com")
                                        break
                            except Exception:
                                continue
                    except Exception:
                        pass
                
                # Debug: If still no description, log what's available
                if not out.get("description_html"):
                    try:
                        page_title = await page.title()
                        page_url = page.url
                        
                        # Check if we're actually on a sign-up/login page (not just has sign-in buttons)
                        is_login_page = await page.evaluate("""
                            () => {
                                const title = document.title.toLowerCase();
                                const url = window.location.href.toLowerCase();
                                const bodyText = document.body.innerText.toLowerCase();
                                
                                const isLoginUrl = url.includes('/login') || url.includes('/signup') || url.includes('/reg/');
                                const isLoginTitle = (title.includes('sign up') || title.includes('sign in')) && 
                                                    !bodyText.includes('job') && !bodyText.includes('apply') && 
                                                    !bodyText.includes('company') && bodyText.length < 500;
                                const hasJobContent = bodyText.includes('job') || bodyText.includes('apply') || 
                                                     bodyText.includes('company') || bodyText.includes('responsibilities');
                                
                                return isLoginUrl || (isLoginTitle && !hasJobContent);
                            }
                        """)
                        
                        if is_login_page:
                            print(f"[LinkedIn Playwright] ⚠️  Actually on login/signup page for {job_url[:60]}... (title: {page_title[:50]})")
                            await browser.close()
                            return out
                        
                        # Find all elements with data-test attributes
                        all_data_test = await page.evaluate("""
                            () => {
                                const elems = document.querySelectorAll('[data-test]');
                                return Array.from(elems).map(e => e.getAttribute('data-test')).filter(Boolean);
                            }
                        """)
                        if all_data_test:
                            test_attrs = ', '.join(set(all_data_test[:20]))
                            print(f"[LinkedIn Playwright] No description found. Available data-test: {test_attrs}")
                        
                        # Check if page has job content
                        has_job_keywords = await page.evaluate("""
                            () => {
                                const text = document.body.innerText.toLowerCase();
                                return text.includes('job') || text.includes('position') || text.includes('role') || text.includes('apply');
                            }
                        """)
                        print(f"[LinkedIn Playwright] Page title: {page_title[:80]}, Has job content: {has_job_keywords}, URL: {page_url[:80]}")
                    except Exception as debug_err:
                        print(f"[LinkedIn Playwright] Debug error: {debug_err}")
                
                # Extract location - try multiple strategies
                loc_found = False
                
                # Strategy 1: Try data-test attributes (most reliable)
                loc_test_selectors = [
                    "[data-test-top-card-location]",
                    "[data-test-job-location]",
                    "[data-test-id='job-location']",
                ]
                for sel in loc_test_selectors:
                    try:
                        # Try with wait first
                        try:
                            loc_elem = await page.wait_for_selector(sel, timeout=3000, state="attached")
                        except Exception:
                            loc_elem = await page.query_selector(sel)
                        
                        if loc_elem:
                            loc_text = await loc_elem.inner_text()
                            if loc_text and loc_text.strip():
                                out["location"] = loc_text.strip()
                                loc_found = True
                                break
                    except Exception:
                        continue
                
                # Strategy 2: Try class-based selectors
                if not loc_found:
                    loc_selectors = [
                        ".jobs-unified-top-card__bullet",
                        ".jobs-details-top-card__exact-location",
                        ".topcard__flavor--bullet",
                        ".jobs-unified-top-card__primary-description",
                        "span[class*='location']",
                        "div[class*='location']",
                    ]
                    for sel in loc_selectors:
                        try:
                            # Try with wait first
                            try:
                                loc_elem = await page.wait_for_selector(sel, timeout=3000, state="attached")
                            except Exception:
                                loc_elem = await page.query_selector(sel)
                            
                            if loc_elem:
                                loc_text = await loc_elem.inner_text()
                                if loc_text and loc_text.strip():
                                    out["location"] = loc_text.strip()
                                    loc_found = True
                                    break
                        except Exception:
                            continue
                
                # Fallback: Try JSON-LD if selectors failed
                if not out.get("location") or not out.get("posted_at"):
                    try:
                        json_ld_scripts = await page.query_selector_all('script[type="application/ld+json"]')
                        for script in json_ld_scripts:
                            try:
                                content = await script.inner_text()
                                import json as _json
                                data = _json.loads(content)
                                if isinstance(data, dict) and data.get("@type") == "JobPosting":
                                    # Extract location
                                    if not out.get("location"):
                                        job_loc = data.get("jobLocation")
                                        if isinstance(job_loc, dict):
                                            addr = job_loc.get("address") or {}
                                            city = addr.get("addressLocality") or ""
                                            region = addr.get("addressRegion") or ""
                                            country = addr.get("addressCountry") or ""
                                            parts = [p for p in [city, region, country] if p]
                                            if parts:
                                                out["location"] = ", ".join(parts)
                                    
                                    # Extract posted_at
                                    if not out.get("posted_at"):
                                        date_posted = data.get("datePosted")
                                        if date_posted:
                                            try:
                                                from datetime import datetime
                                                if isinstance(date_posted, str):
                                                    iso = date_posted.strip().replace('Z', '+00:00')
                                                    try:
                                                        out["posted_at"] = datetime.fromisoformat(iso)
                                                    except Exception:
                                                        try:
                                                            out["posted_at"] = datetime.strptime(date_posted[:10], "%Y-%m-%d")
                                                        except Exception:
                                                            pass
                                            except Exception:
                                                pass
                                    
                                    # If we got both, we can break
                                    if out.get("location") and out.get("posted_at"):
                                        break
                            except Exception:
                                continue
                    except Exception:
                        pass
                
                # Extract posted_at from HTML if not found in JSON-LD
                if not out.get("posted_at"):
                    try:
                        from datetime import datetime, timedelta
                        import re
                        
                        # Helper function to parse relative time from text
                        def parse_relative_time(text):
                            """Parse relative time strings like '6 days ago', '2 weeks ago', '1 month ago'"""
                            if not text:
                                return None
                            text_lower = text.lower()
                            patterns = [
                                (r'(\d+)\s*(hour|hr)\s*ago', lambda m: timedelta(hours=int(m.group(1)))),
                                (r'(\d+)\s*(minute|min)\s*ago', lambda m: timedelta(minutes=int(m.group(1)))),
                                (r'just\s*now', lambda m: timedelta(seconds=0)),
                                (r'(\d+)\s*(day|days)\s*ago', lambda m: timedelta(days=int(m.group(1)))),
                                (r'(\d+)\s*(week|weeks)\s*ago', lambda m: timedelta(weeks=int(m.group(1)))),
                                (r'(\d+)\s*(month|months)\s*ago', lambda m: timedelta(days=int(m.group(1)) * 30)),
                            ]
                            for pattern, delta_func in patterns:
                                match = re.search(pattern, text_lower)
                                if match:
                                    delta = delta_func(match)
                                    return datetime.now() - delta
                            return None
                        
                        # Try to find posted date in various selectors
                        posted_selectors = [
                            "[data-test-posted-date]",
                            ".jobs-unified-top-card__posted-date",
                            ".jobs-details-top-card__posted-date",
                            "time[datetime]",
                            "span[class*='posted']",
                            "div[class*='posted']",
                        ]
                        for sel in posted_selectors:
                            try:
                                elem = await page.query_selector(sel)
                                if elem:
                                    # Try datetime attribute first
                                    datetime_attr = await elem.get_attribute("datetime")
                                    if datetime_attr:
                                        try:
                                            out["posted_at"] = datetime.fromisoformat(datetime_attr.replace('Z', '+00:00'))
                                            break
                                        except Exception:
                                            pass
                                    
                                    # Try parsing text content
                                    text = await elem.inner_text()
                                    if text:
                                        parsed = parse_relative_time(text)
                                        if parsed:
                                            out["posted_at"] = parsed
                                            break
                            except Exception:
                                continue
                        
                        # If still not found, search in top card area (often contains "location · X days ago")
                        if not out.get("posted_at"):
                            top_card_selectors = [
                                ".jobs-unified-top-card__primary-description",
                                ".jobs-unified-top-card__primary-description-without-tagline",
                                ".jobs-details-top-card__job-info-text",
                                "[data-test-top-card-location]",
                                ".jobs-unified-top-card__bullet",
                            ]
                            for sel in top_card_selectors:
                                try:
                                    elem = await page.query_selector(sel)
                                    if elem:
                                        text = await elem.inner_text()
                                        # Text often looks like "Location · X days ago · applicants"
                                        # Split by "·" and check each part for relative time
                                        if "·" in text:
                                            parts = [p.strip() for p in text.split("·")]
                                            for part in parts:
                                                parsed = parse_relative_time(part)
                                                if parsed:
                                                    out["posted_at"] = parsed
                                                    break
                                            if out.get("posted_at"):
                                                break
                                        else:
                                            # Check the whole text
                                            parsed = parse_relative_time(text)
                                            if parsed:
                                                out["posted_at"] = parsed
                                                break
                                except Exception:
                                    continue
                    except Exception:
                        pass
                
                await browser.close()
        except Exception as e:
            # Silently fail - this is a fallback
            pass
        
        return out

