import math
import re
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Dict, Iterable, List, Optional, Tuple

__all__ = ["compute_unified_score"]

# Optional import: geonames-backed city alias resolver
_GEONAMES_AVAILABLE = False
get_city_aliases = None

try:
    import sys
    import os
    # Add parent directory to path if not already there
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(current_dir)  # job_scraper directory
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)
    
    # Now try importing
    from utils.geonames import get_city_aliases  # type: ignore
    _GEONAMES_AVAILABLE = True
    print("[Scoring] ✅ Geonames module imported successfully")
except Exception as e:
    try:
        # Fallback: try relative import
        from ..utils.geonames import get_city_aliases  # type: ignore
        _GEONAMES_AVAILABLE = True
        print("[Scoring] ✅ Geonames module imported successfully (relative)")
    except Exception as e2:
        _GEONAMES_AVAILABLE = False
        print(f"[Scoring] ⚠️  Geonames module import failed: {e}, {e2}, using fallback")
        def get_city_aliases(city: str, country: Optional[str] = None):
            return set()

_WHITESPACE_RE = re.compile(r"[^a-z0-9+]+")


def _normalize_text(value: Optional[str]) -> str:
    if not value:
        return ""
    return _WHITESPACE_RE.sub(" ", value.lower()).strip()


def _strip_html(html: str) -> str:
    """Strip HTML tags to plain text."""
    if not html:
        return ""
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
        return soup.get_text(separator=' ', strip=True)
    except:
        import re
        return re.sub(r'<[^>]+>', ' ', html)


def _split_list(value: Iterable[str]) -> List[str]:
    normalized: List[str] = []
    for item in value:
        if not item:
            continue
        parts = [part.strip() for part in re.split(r",|/|;", str(item))]
        for part in parts:
            cleaned = part.strip()
            if cleaned:
                normalized.append(cleaned)
    return normalized


def _keyword_score(phrases: List[str], title: str, description: str) -> Tuple[float, Dict[str, float]]:
    if not phrases:
        return 0.0, {}

    title_norm = _normalize_text(title)
    desc_norm = _normalize_text(description)
    combined_tokens = set((title_norm + " " + desc_norm).split())

    per_phrase: Dict[str, float] = {}
    total_score = 0.0
    valid_count = 0
    found_exact = False

    for raw_phrase in phrases:
        phrase_norm = _normalize_text(raw_phrase)
        if not phrase_norm:
            continue
        valid_count += 1

        if phrase_norm in title_norm or phrase_norm in desc_norm:
            per_phrase[raw_phrase] = 1.0
            total_score += 1.0
            found_exact = True
            continue

        phrase_tokens = set(phrase_norm.split())
        if not phrase_tokens:
            per_phrase[raw_phrase] = 0.0
            continue

        overlap = phrase_tokens & combined_tokens
        ratio = len(overlap) / len(phrase_tokens)
        partial = ratio * 0.7
        per_phrase[raw_phrase] = round(partial, 3)
        total_score += partial

    if valid_count == 0:
        return 0.0, per_phrase

    # If ANY keyword phrase matches exactly in title or description,
    # treat the overall keyword score as a perfect match.
    if found_exact:
        return 1.0, per_phrase

    average = min(1.0, max(0.0, total_score / valid_count))
    return round(average, 4), per_phrase


def _semantic_score(keywords: List[str], title: str) -> float:
    title_norm = _normalize_text(title)
    if not title_norm or not keywords:
        return 0.0

    best_ratio = 0.0
    for kw in keywords:
        kw_norm = _normalize_text(kw)
        if not kw_norm:
            continue
        ratio = SequenceMatcher(None, title_norm, kw_norm).ratio()
        best_ratio = max(best_ratio, ratio)
    return round(best_ratio, 4)


def _extract_skills_from_description(description: str, user_skills: Iterable[str]) -> set:
    """Extract skills from job description by matching against user skills and common patterns."""
    if not description:
        return set()
    
    desc_lower = _normalize_text(description)
    # Filter out single characters and very short skills
    user_set = {s.strip().lower() for s in user_skills if s and s.strip() and len(s.strip()) >= 2}
    found_skills = set()
    
    # Skill synonyms/aliases for better matching
    skill_synonyms = {
        'strategy': ['strategic', 'strategic planning', 'strategic thinking', 'strategic execution'],
        'analytics': ['analytical', 'analysis', 'data analysis', 'insights', 'bi', 'business intelligence', 'data-driven'],
        'growth': ['acquisition', 'activation', 'retention', 'crm', 'lifecycle', 'expansion', 'growth marketing'],
        'product management': ['product manager', 'pm', 'product mgmt', 'backlog', 'roadmap', 'product strategy'],
        'marketing': ['digital marketing', 'performance marketing', 'brand management', 'marketing strategy'],
        'operations': ['ops', 'operational', 'business operations', 'process improvement'],
        'leadership': ['leading', 'lead', 'management', 'team leadership', 'people management'],
        'communication': ['communications', 'comms', 'presentation', 'stakeholder management'],
        'ai': ['artificial intelligence', 'machine learning', 'ml', 'ai workflows'],
        'business intelligence': ['bi', 'analytics', 'reporting', 'dashboards', 'kpi'],
        'attribution': ['attribution modeling', 'marketing attribution', 'multi-touch attribution'],
        'plg': ['product-led growth', 'product led growth'],
    }
    
    # Direct word boundary matching for user skills (more lenient)
    for skill in user_set:
        # Skip single characters
        if len(skill) < 2:
            continue
            
        # Exact match with word boundary (only for skills 3+ chars to avoid matching "a", "i", etc.)
        if len(skill) >= 3:
            pattern = r'\b' + re.escape(skill) + r'\b'
            if re.search(pattern, desc_lower):
                found_skills.add(skill)
                continue
        
        # Partial match (skill appears as part of a phrase) - only for 3+ char skills
        if len(skill) >= 3 and skill in desc_lower:
            found_skills.add(skill)
            continue
        
        # Check synonyms
        for key, synonyms in skill_synonyms.items():
            if skill == key or skill in synonyms:
                for synonym in synonyms:
                    if len(synonym) >= 3 and synonym in desc_lower:
                        found_skills.add(skill)
                        break
                if skill in found_skills:
                    break
    
    # Common skill patterns to extract (broader matching)
    common_skill_patterns = [
        # Technical
        r'\b(python|javascript|java|react|angular|vue|node\.?js|django|flask|spring|express)\b',
        r'\b(aws|azure|gcp|cloud|docker|kubernetes|terraform|ansible)\b',
        r'\b(sql|mysql|postgresql|mongodb|redis|cassandra|elasticsearch)\b',
        r'\b(html|css|sass|less|typescript|graphql|rest|api)\b',
        r'\b(git|github|gitlab|jenkins|ci/cd|devops)\b',
        # Data & Analytics
        r'\b(excel|power[_\s]?bi|tableau|analytics|data[_\s]?analysis|etl|spark|airflow)\b',
        r'\b(machine[_\s]?learning|ml|ai|artificial[_\s]?intelligence|data[_\s]?science|ai[_\s]?workflows)\b',
        r'\b(pandas|numpy|scikit|tensorflow|pytorch|keras)\b',
        # Business & Strategy
        r'\b(sales|marketing|brand[_\s]?management|digital[_\s]?marketing|growth|strategy|strategic)\b',
        r'\b(product[_\s]?management|pm|product[_\s]?manager|agile|scrum|product[_\s]?led[_\s]?growth|plg)\b',
        r'\b(consulting|strategy|business[_\s]?development|operations|go-to-market|gtm)\b',
        r'\b(analytics|insights|data[_\s]?driven|kpi|metrics|reporting|business[_\s]?intelligence|bi)\b',
        r'\b(performance[_\s]?marketing|attribution|attribution[_\s]?modeling|multi-touch[_\s]?attribution)\b',
        # Other
        r'\b(project[_\s]?management|pmp|leadership|team[_\s]?management|people[_\s]?management)\b',
        r'\b(communication|presentation|stakeholder[_\s]?management|comms)\b',
    ]
    
    # Extract skills from patterns and match against user skills
    for pattern in common_skill_patterns:
        matches = re.findall(pattern, desc_lower)
        for match in matches:
            skill = match if isinstance(match, str) else match[0]
            skill_normalized = skill.strip().lower()
            # Check if this matches any user skill (exact or partial)
            for user_skill in user_set:
                if skill_normalized in user_skill or user_skill in skill_normalized:
                    found_skills.add(user_skill)
                    break
                # Also check for common variations
                normalized_match = skill_normalized.replace('_', ' ').replace('-', ' ')
                normalized_user = user_skill.replace('_', ' ').replace('-', ' ')
                if normalized_match == normalized_user or normalized_match in normalized_user or normalized_user in normalized_match:
                    found_skills.add(user_skill)
                    break
    
    return found_skills


def _skill_score(job_skills: Iterable[str], user_skills: Iterable[str], description: str) -> Tuple[float, Dict[str, List[str]]]:
    # Filter out single characters and very short skills (less than 2 chars)
    user_set = {s.strip().lower() for s in user_skills if s and s.strip() and len(s.strip()) >= 2}
    if not user_set:
        return 0.0, {"matched": [], "missing": []}

    job_set = {s.strip().lower() for s in job_skills if s and s.strip() and len(s.strip()) >= 2}

    if not job_set:
        # Fallback: extract skills from description intelligently
        job_set = _extract_skills_from_description(description, user_skills)

    if not job_set:
        # Even if no exact matches, give partial credit if description contains relevant terms
        desc_lower = _normalize_text(description) if description else ""
        if desc_lower:
            # Check if any user skill appears in description (even partially)
            partial_matches = 0
            for user_skill in user_set:
                # More lenient: check if skill words appear in description
                skill_words = user_skill.split()
                if len(skill_words) > 0:
                    # If at least one word from the skill appears, give partial credit
                    # Only consider words with 3+ characters to avoid matching single letters
                    if any(word in desc_lower for word in skill_words if len(word) >= 3):
                        partial_matches += 1
            
            if partial_matches > 0:
                # Give partial score based on how many skills have partial matches
                partial_score = (partial_matches / len(user_set)) * 0.5  # Max 50% for partial matches
                return round(partial_score, 4), {"matched": [], "missing": sorted(user_set)}
        
        return 0.0, {"matched": [], "missing": sorted(user_set)}

    # Filter matched skills to exclude single characters
    matched = sorted([s for s in (user_set & job_set) if len(s) >= 2])
    missing = sorted([s for s in (user_set - job_set) if len(s) >= 2])

    # Calculate base score
    base_score = len(matched) / len(user_set) if user_set else 0.0
    
    # Boost score if we have a good ratio (more than 50% match gets a boost)
    if base_score >= 0.5:
        # Boost by up to 20% for high matches
        boost = min(0.2, (base_score - 0.5) * 0.4)
        base_score = min(1.0, base_score + boost)
    elif base_score > 0:
        # Small boost for any matches
        base_score = min(1.0, base_score * 1.1)
    
    return round(min(1.0, max(0.0, base_score)), 4), {"matched": matched, "missing": missing}


def _experience_score(job: Dict[str, any], experience_level: Optional[str]) -> float:
    if not experience_level:
        return 0.5  # Neutral weight when user did not specify

    level_map: Dict[str, Tuple[int, int]] = {
        "entry": (0, 2),
        "junior": (0, 3),
        "mid": (2, 5),
        "senior": (5, 10),
        "leadership": (8, 30),
        "lead": (7, 20),
    }

    target = level_map.get(experience_level.lower())
    if not target:
        return 0.5

    min_exp = job.get("experience_min")
    max_exp = job.get("experience_max")

    if min_exp is None and max_exp is None:
        # Try to infer from title/description if available
        title = (job.get("title") or "").lower()
        desc = (job.get("description") or "").lower()
        combined = title + " " + desc
        
        # Check for experience indicators in text
        if any(term in combined for term in ["senior", "sr", "lead", "principal", "director", "vp", "head"]):
            return 0.7  # Likely senior role
        elif any(term in combined for term in ["junior", "jr", "entry", "intern", "graduate"]):
            return 0.3  # Likely entry level
        elif any(term in combined for term in ["mid", "middle", "intermediate"]):
            return 0.5  # Likely mid-level
        return 0.5  # Default neutral

    job_min = float(min_exp) if min_exp is not None else 0.0
    job_max = float(max_exp) if max_exp is not None else job_min
    if job_max < job_min:
        job_max = job_min

    target_min, target_max = target

    # Overlap ratio between ranges
    overlap_min = max(job_min, target_min)
    overlap_max = min(job_max, target_max)

    if overlap_max < overlap_min:
        # No overlap, compute distance penalty (more gradual)
        gap = min(abs(job_min - target_max), abs(job_max - target_min))
        # More gradual penalty: 0-2 years gap = 0.8-1.0, 2-5 years = 0.5-0.8, 5+ years = 0.0-0.5
        if gap <= 2:
            penalty = gap / 10.0  # Small gap, small penalty
            return round(max(0.6, 1.0 - penalty), 4)
        elif gap <= 5:
            penalty = 0.2 + (gap - 2) / 15.0  # Medium gap
            return round(max(0.3, 1.0 - penalty), 4)
        else:
            penalty = min(1.0, 0.5 + (gap - 5) / 20.0)  # Large gap
            return round(max(0.0, 1.0 - penalty), 4)

    # Normalize overlap relative to target range
    target_range = max(1.0, float(target_max - target_min))
    overlap = (overlap_max - overlap_min) / target_range
    
    # Ensure we return a value between 0.2 and 1.0 (never 0%)
    score = max(0.2, min(1.0, overlap))
    return round(score, 4)


def _extract_city_from_location(location: str) -> str:
    """Extract the primary city name from a location string like 'Bangalore, India' or 'Bangalore Urban, Karnataka, India'."""
    if not location:
        return ""
    
    location_lower = location.strip().lower()
    
    # First, try splitting by commas/semicolons (common delimiters)
    parts = [p.strip() for p in re.split(r'[,;|]', location_lower)]
    if parts and parts[0]:
        city_part = parts[0]
    else:
        # If no delimiters, use the whole string
        city_part = location_lower
    
    # Split by spaces to get individual words
    words = city_part.split()
    if not words:
        return ""
    
    # Words to skip (administrative divisions, suffixes, states, countries)
    # These should appear AFTER the city name
    skip_words = {
        'urban', 'metro', 'city', 'district', 'region', 'area', 'zone',
        'karnataka', 'maharashtra', 'tamil', 'nadu', 'gujarat',
        'rajasthan', 'punjab', 'haryana', 'uttar', 'pradesh', 'west', 'bengal',
        'telangana', 'andhra', 'kerala', 'odisha', 'bihar',
        'india', 'in', 'usa', 'us', 'united', 'states', 'uk', 'kingdom',
        'ca', 'california', 'tx', 'texas', 'fl', 'florida', 'ny'
    }
    
    # Extract city name: take words until we hit a skip word
    # But handle special cases for multi-word cities
    city_words = []
    i = 0
    while i < len(words) and len(city_words) < 3:  # Max 3 words for city names
        word = words[i]
        
        # If we hit a skip word, stop
        if word in skip_words:
            break
        
        # If we see the same word again (e.g., "Delhi, Delhi"), stop at first occurrence
        if city_words and word == city_words[0]:
            break
        
        city_words.append(word)
        i += 1
    
    if not city_words:
        # Fallback: use first word if all were skipped
        city_words = [words[0]] if words else []
    
    city = ' '.join(city_words).strip()
    
    # Remove trailing suffixes that might have been included
    city = re.sub(r'\s+(urban|metro|city|district)$', '', city, flags=re.IGNORECASE)
    
    return city.strip()


def _location_score(job_location: Optional[str], search_location: Optional[str], remote_preference: Optional[str], search_location_aliases: Optional[set] = None) -> float:
    if not search_location:
        return 0.7 if remote_preference else 1.0

    job_loc_norm = _normalize_text(job_location)
    search_loc_norm = _normalize_text(search_location)

    if not job_loc_norm:
        if remote_preference and "remote" in remote_preference.lower():
            return 0.75
        return 0.4

    # Exact match
    if search_loc_norm in job_loc_norm or job_loc_norm in search_loc_norm:
        return 1.0

    # Geonames alias matching (Bengaluru/Bangalore, Gurugram/Gurgaon, etc.)
    # Use pre-computed search location aliases if provided (more efficient)
    if search_location_aliases:
        # Check if any search location alias appears in job location
        job_loc_lower = job_loc_norm.lower()
        for alias in search_location_aliases:
            if alias and alias.lower() in job_loc_lower:
                return 1.0
    else:
        # Fallback: extract and check aliases (less efficient, but works if aliases not pre-computed)
        job_city = _extract_city_from_location(job_loc_norm)
        search_city = _extract_city_from_location(search_loc_norm)
        
        if job_city and search_city:
            try:
                search_aliases = {search_city} | set(get_city_aliases(search_city))
                job_aliases = {job_city} | set(get_city_aliases(job_city))
                if search_aliases & job_aliases:
                    return 1.0
            except Exception:
                pass  # Fail silently, continue with other checks

    job_tokens = set(job_loc_norm.split())
    search_tokens = set(search_loc_norm.split())
    if not job_tokens or not search_tokens:
        return 0.4

    # Calculate overlap ratio for more nuanced scoring
    overlap = job_tokens & search_tokens
    if overlap:
        # More tokens matching = higher score
        overlap_ratio = len(overlap) / max(len(search_tokens), 1)
        # Score between 0.6 and 1.0 based on overlap
        score = 0.6 + (overlap_ratio * 0.4)
        return round(min(1.0, score), 4)

    # Check for country/state matches (partial)
    # Extract country codes and major cities
    common_countries = {'us', 'usa', 'united states', 'uk', 'united kingdom', 'in', 'india', 'ca', 'canada'}
    common_cities = {'new york', 'ny', 'san francisco', 'sf', 'los angeles', 'la', 'chicago', 'boston', 
                     'seattle', 'austin', 'denver', 'mumbai', 'bangalore', 'delhi', 'hyderabad', 'pune'}
    
    job_country = None
    search_country = None
    for country in common_countries:
        if country in job_loc_norm:
            job_country = country
        if country in search_loc_norm:
            search_country = country
    
    if job_country and search_country and job_country == search_country:
        return 0.9  # Same country
    
    # Check for city matches in common_cities list
    job_city_common = None
    search_city_common = None
    for city in common_cities:
        if city in job_loc_norm:
            job_city_common = city
        if city in search_loc_norm:
            search_city_common = city
    
    if job_city_common and search_city_common and job_city_common == search_city_common:
        return 1.0  # Same city

    if remote_preference and "remote" in remote_preference.lower():
        if "remote" in job_tokens:
            return 0.85

    # Ensure we return a value between 0.2 and 1.0 (never 0%)
    return 0.35


def _recency_score(posted_at: Optional[datetime], scraped_at: Optional[datetime] = None) -> float:
    """
    Compute a recency score:
    - If posted_at is available, score 1.0..0.1 based on days since posting
    - If posted_at is missing but scraped_at exists, use a dampened proxy (<= 0.6)
    - If both missing, return a conservative default
    """
    if not posted_at and scraped_at:
        ref = scraped_at
        if ref.tzinfo is None:
            ref = ref.replace(tzinfo=timezone.utc)
        delta = datetime.now(timezone.utc) - ref
        days = max(0.0, delta.total_seconds() / 86400.0)
        if days <= 1:
            return 1.0
        if days <= 7:
            # Decrease from 0.6 toward ~0.2 in first week
            return round(max(0.2, 1.0 - (days - 1) * 0.08), 4)
        if days <= 30:
            return round(max(0.2, 1.0 - (days - 7) * 0.02), 4)
        return 0.2
    if not posted_at:
        return 0.3

    if posted_at.tzinfo is None:
        posted_at = posted_at.replace(tzinfo=timezone.utc)

    delta = datetime.now(timezone.utc) - posted_at
    days = max(0.0, delta.total_seconds() / 86400.0)

    if days <= 1:
        return 1.0
    if days <= 7:
        return round(1.0 - (days - 1) * 0.08, 4)
    if days <= 30:
        return round(max(0.2, 1.0 - (days - 7) * 0.03), 4)
    return 0.1


def compute_unified_score(
    job: Dict[str, any],
    *,
    keywords: Iterable[str],
    skills: Iterable[str],
    location: Optional[str] = None,
    experience_level: Optional[str] = None,
    remote_preference: Optional[str] = None,
    search_location_aliases: Optional[set] = None,
) -> Dict[str, any]:
    """Compute a unified match score for a job given the current search criteria."""

    keyword_list = _split_list(keywords)
    skill_list = _split_list(skills)

    title = job.get("title") or ""
    # Get description - handle both HTML and plain text
    description = job.get("description") or ""
    # If description is HTML, convert to plain text for skill extraction
    if description and ("<" in description and ">" in description):
        # It's HTML, strip it for skill extraction
        description = _strip_html(description)
    
    keyword_score, keyword_details = _keyword_score(keyword_list, title, description)
    semantic_score = _semantic_score(keyword_list, title)

    job_skills_field = job.get("skills") or job.get("skills_required") or []
    if isinstance(job_skills_field, str):
        job_skills = _split_list([job_skills_field])
    else:
        job_skills = _split_list(job_skills_field)

    skill_score, skill_details = _skill_score(job_skills, skill_list, description)
    experience_score = _experience_score(job, experience_level)
    location_score = _location_score(job.get("location"), location, remote_preference, search_location_aliases)
    # Use posted_at primarily; if missing, use scraped_at as a dampened proxy
    recency_score = _recency_score(job.get("posted_at"), job.get("scraped_at"))

    weights = {
        "keywords": 0.30,
        "semantic": 0.10,
        "skills": 0.30,  # Increased from 0.25 to give more weight to skills
        "experience": 0.12,
        "location": 0.10,
        "recency": 0.08,
    }

    total = (
        keyword_score * weights["keywords"]
        + semantic_score * weights["semantic"]
        + skill_score * weights["skills"]
        + experience_score * weights["experience"]
        + location_score * weights["location"]
        + recency_score * weights["recency"]
    )

    # Apply a boost for high-performing jobs (if multiple components are strong)
    strong_components = sum([
        keyword_score >= 0.7,
        skill_score >= 0.5,
        experience_score >= 0.5,
        semantic_score >= 0.4,
    ])
    
    # Boost by 5-15% if 3+ components are strong
    if strong_components >= 3:
        boost = min(0.15, (strong_components - 2) * 0.05)
        total = min(1.0, total * (1 + boost))
    elif strong_components >= 2:
        # Small boost for 2 strong components
        total = min(1.0, total * 1.05)

    final_score = round(min(1.0, max(0.0, total)), 4)

    return {
        "score": final_score,
        "components": {
            "keywords": keyword_score,
            "semantic": semantic_score,
            "skills": skill_score,
            "experience": experience_score,
            "location": location_score,
            "recency": recency_score,
        },
        "details": {
            "matched_skills": skill_details.get("matched", []),
            "missing_skills": skill_details.get("missing", []),
            "keyword_hits": keyword_details,
        },
    }

