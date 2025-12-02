"""
Job normalization and canonicalization.
"""
import hashlib
import re
from typing import Dict, Any, Optional
from datetime import datetime
from connectors.base import RawJob


def normalize_title(title: str) -> str:
    """Normalize job title for deduplication."""
    if not title:
        return ""
    # Remove common artifacts
    title = re.sub(r'\s*-\s*Posted\s+(today|yesterday|\d+\s+(days?|weeks?|months?)\s+ago)\s*', '', title, flags=re.IGNORECASE)
    title = re.sub(r'\s*\d+\s*-\s*\d+\s*yrs?Location.*$', '', title, flags=re.IGNORECASE)
    title = re.sub(r'\s*Posted\s+(today|yesterday|\d+\s+(days?|weeks?|months?)\s+ago)\s*', '', title, flags=re.IGNORECASE)
    # Clean whitespace
    title = re.sub(r'\s+', ' ', title).strip()
    return title


def normalize_company(company: str) -> str:
    """Normalize company name."""
    if not company:
        return ""
    # Remove common suffixes and artifacts
    company = re.sub(r'\s*-\s*.*$', '', company)  # Remove "- Job Title" suffix
    company = re.sub(r'\s*Posted.*$', '', company, flags=re.IGNORECASE)
    company = re.sub(r'\s+', ' ', company).strip()
    return company


def normalize_url(url: str) -> str:
    """Normalize URL for deduplication: remove query params, trailing slashes, etc."""
    if not url:
        return ""
    try:
        from urllib.parse import urlparse, urlunparse
        parsed = urlparse(url)
        # Remove query and fragment, normalize path
        normalized = urlunparse((
            parsed.scheme,
            parsed.netloc,
            parsed.path.rstrip('/'),  # Remove trailing slash
            '',  # params
            '',  # query - removed for deduplication
            ''   # fragment - removed
        ))
        return normalized.lower()
    except Exception:
        # Fallback: simple normalization
        url = url.split('?')[0].split('#')[0].rstrip('/')
        return url.lower()


def compute_content_hash(raw: RawJob) -> bytes:
    """Compute SHA-1 hash of normalized job content for deduplication."""
    text = f"{normalize_title(raw.title)}|{normalize_company(raw.company)}|{raw.location or ''}|{(raw.description or '')[:1000]}"
    return hashlib.sha1(text.encode('utf-8')).digest()


def canonicalize_job(raw: RawJob) -> Dict[str, Any]:
    """Convert RawJob to canonical database dict."""
    normalized_title = normalize_title(raw.title)
    normalized_company = normalize_company(raw.company)
    content_hash = compute_content_hash(raw)
    
    # Extract experience from title/description if not present
    exp_min = raw.experience_min
    exp_max = raw.experience_max
    if not exp_min and not exp_max:
        exp_range = _extract_experience(raw.title + " " + (raw.description or ""))
        if exp_range:
            exp_min, exp_max = exp_range
    
    # Infer remote type from location/description
    remote_type = raw.remote_type
    if not remote_type:
        loc_lower = (raw.location or "").lower()
        desc_lower = (raw.description or "").lower()
        if "remote" in loc_lower or "remote" in desc_lower:
            remote_type = "remote"
        elif "hybrid" in desc_lower:
            remote_type = "hybrid"
        else:
            remote_type = "onsite"
    
    return {
        "source": raw.source,
        "external_id": raw.external_id,
        "title": raw.title,
        "normalized_title": normalized_title,
        "company": normalized_company,
        "location": raw.location,
        # Preserve HTML descriptions - don't strip them, scoring needs the full text
        "description": raw.description if raw.description else None,
        "url": raw.url,
        "posted_at": raw.posted_at,
        "min_salary": raw.salary_min,
        "max_salary": raw.salary_max,
        "currency": raw.currency,
        "experience_min": exp_min,
        "experience_max": exp_max,
        "employment_type": raw.employment_type,
        "remote_type": remote_type,
        "skills": raw.skills or [],
        "hash": content_hash,
    }


def _extract_experience(text: str) -> Optional[tuple]:
    """Extract experience range (min, max) from text."""
    # Patterns: "2-5 years", "3+ years", "5 yrs", etc.
    patterns = [
        r'(\d+)\s*-\s*(\d+)\s*(?:years?|yrs?|y\.?)',
        r'(\d+)\s*\+\s*(?:years?|yrs?|y\.?)',
        r'(\d+)\s*(?:years?|yrs?|y\.?)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            if len(match.groups()) == 2:
                return (float(match.group(1)), float(match.group(2)))
            elif len(match.groups()) == 1:
                val = float(match.group(1))
                return (val, val + 2)  # Assume +2 range
    return None


def _strip_html(html: str) -> str:
    """Strip HTML tags to plain text."""
    if not html:
        return ""
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
        return soup.get_text(separator=' ', strip=True)
    except:
        return re.sub(r'<[^>]+>', ' ', html)

