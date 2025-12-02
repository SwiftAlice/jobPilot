"""
Hybrid ranking for job search results.
"""
import psycopg2
import re
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

# Optional import: geonames-backed city alias resolver
try:
    from utils.geonames import get_city_aliases
    _GEONAMES_AVAILABLE = True
except Exception:
    try:
        from job_scraper.utils.geonames import get_city_aliases
        _GEONAMES_AVAILABLE = True
    except Exception:
        _GEONAMES_AVAILABLE = False
        def get_city_aliases(city: str, country: Optional[str] = None):
            return set()


def _extract_city_from_location(location: str) -> str:
    """Extract the primary city name from a location string."""
    if not location:
        return ""
    
    location_lower = location.strip().lower()
    
    # First, try splitting by commas/semicolons
    parts = [p.strip() for p in re.split(r'[,;|]', location_lower)]
    if parts and parts[0]:
        city_part = parts[0]
    else:
        city_part = location_lower
    
    # Split by spaces to get individual words
    words = city_part.split()
    if not words:
        return ""
    
    # Words to skip (administrative divisions, suffixes, states, countries)
    skip_words = {
        'urban', 'metro', 'city', 'district', 'region', 'area', 'zone',
        'karnataka', 'maharashtra', 'tamil', 'nadu', 'gujarat',
        'rajasthan', 'punjab', 'haryana', 'uttar', 'pradesh', 'west', 'bengal',
        'telangana', 'andhra', 'kerala', 'odisha', 'bihar',
        'india', 'in', 'usa', 'us', 'united', 'states', 'uk', 'kingdom',
        'ca', 'california', 'tx', 'texas', 'fl', 'florida', 'ny'
    }
    
    # Extract city name: take words until we hit a skip word
    city_words = []
    i = 0
    while i < len(words) and len(city_words) < 3:
        word = words[i]
        if word in skip_words:
            break
        if city_words and word == city_words[0]:
            break
        city_words.append(word)
        i += 1
    
    if not city_words:
        city_words = [words[0]] if words else []
    
    city = ' '.join(city_words).strip()
    city = re.sub(r'\s+(urban|metro|city|district)$', '', city, flags=re.IGNORECASE)
    return city.strip()


def _city_matches_with_aliases(job_location: str, user_city: str, user_city_aliases: Optional[set] = None) -> bool:
    """Check if job location matches user city, considering aliases.
    
    Args:
        job_location: Job's location string
        user_city: User's city name
        user_city_aliases: Pre-computed set of user city aliases (for efficiency)
    """
    if not job_location or not user_city:
        return False
    
    job_location_lower = job_location.lower()
    
    # Use pre-computed aliases if provided (more efficient)
    if user_city_aliases:
        # Check if any user city alias appears in job location
        for alias in user_city_aliases:
            if alias and alias.lower() in job_location_lower:
                return True
        return False
    
    # Fallback: simple string match
    user_city_lower = user_city.lower()
    return user_city_lower in job_location_lower


def get_country_variants(country_str):
    """Returns a set of country name and code variants for matching."""
    if not country_str:
        return set()
    
    country_lower = country_str.strip().lower()
    variants = {country_lower}
    
    # Country name to code mapping
    country_to_code = {
        'india': 'in',
        'united states': 'us',
        'usa': 'us',
        'united kingdom': 'gb',
        'uk': 'gb',
        'canada': 'ca',
        'australia': 'au',
        'germany': 'de',
        'france': 'fr',
        'spain': 'es',
        'italy': 'it',
        'netherlands': 'nl',
        'belgium': 'be',
        'switzerland': 'ch',
        'austria': 'at',
        'sweden': 'se',
        'norway': 'no',
        'denmark': 'dk',
        'finland': 'fi',
        'poland': 'pl',
        'portugal': 'pt',
        'greece': 'gr',
        'ireland': 'ie',
        'japan': 'jp',
        'china': 'cn',
        'south korea': 'kr',
        'singapore': 'sg',
        'malaysia': 'my',
        'thailand': 'th',
        'indonesia': 'id',
        'philippines': 'ph',
        'vietnam': 'vn',
        'brazil': 'br',
        'mexico': 'mx',
        'argentina': 'ar',
        'chile': 'cl',
        'colombia': 'co',
        'south africa': 'za',
        'egypt': 'eg',
        'uae': 'ae',
        'united arab emirates': 'ae',
        'saudi arabia': 'sa',
        'israel': 'il',
        'turkey': 'tr',
        'russia': 'ru',
        'new zealand': 'nz',
    }
    
    # Code to country name mapping
    code_to_country = {v: k for k, v in country_to_code.items()}
    
    # If it's a 2-letter code, add the country name
    if len(country_lower) == 2 and country_lower.isalpha():
        variants.add(country_lower)
        if country_lower in code_to_country:
            variants.add(code_to_country[country_lower])
    
    # If it's a country name, add the code
    if country_lower in country_to_code:
        variants.add(country_to_code[country_lower])
    
    return variants


def rank_jobs(
    db_conn,
    query_text: str,
    location: Optional[str] = None,
    experience_level: Optional[str] = None,
    remote_type: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    query_keywords: Optional[List[str]] = None,  # Original keyword phrases
    user_location_city: Optional[str] = None,  # User's city for tiered location matching
    user_location_country: Optional[str] = None,  # User's country for tiered location matching
    user_id: Optional[str] = None,  # Current user for per-user score ordering
) -> List[Dict[str, Any]]:
    """
    Rank jobs using hybrid FTS + boosts.
    
    Returns list of job dicts with ranking metadata.
    """
    with db_conn.cursor() as cur:
        # Build FTS query using websearch_to_tsquery with OR between phrases (best for user-entered phrases)
        # Compose a websearch query string like: "phrase one" OR "phrase two" OR term
        terms: List[str] = []
        if query_keywords:
            for kw in query_keywords:
                kw_str = (kw or "").strip()
                if not kw_str:
                    continue
                if " " in kw_str:
                    terms.append(f'"{kw_str}"')
                else:
                    terms.append(kw_str)
        else:
            # Fallback: split query_text into terms
            terms = [t for t in (query_text or "").split() if t]

        if not terms:
            terms = [query_text] if query_text else []

        websearch_query = " OR ".join(terms)
        fts_func = "websearch_to_tsquery"
        ts_query_param = websearch_query
        
        # Debug logging
        print(f"[Rank] FTS query: '{ts_query_param}', terms={terms}, query_keywords={query_keywords}")
        
        # When explicit keyword phrases are provided, ignore historical per-user scores.
        # This prevents stale growth-domain scores from influencing engineering searches.
        if query_keywords:
            user_id = None
        
        # Short-circuit path: If user_id is provided (and not disabled above), prioritize jobs already scored for this user.
        # Fetch directly from user_job_scores ordered by last_match_score, and join job details.
        # This guarantees the highest user-specific scores show first.
        if user_id and not query_keywords:
            try:
                # First, check total count to ensure we have enough jobs for this offset
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM user_job_scores ujs
                    JOIN jobs j ON j.id::text = ujs.job_id
                    WHERE ujs.user_id = %s
                      AND (j.is_active IS NULL OR j.is_active = TRUE)
                    """,
                    (user_id,),
                )
                total_count = cur.fetchone()[0]
                print(f"[Rank] User-first query: user_id={user_id}, limit={limit}, offset={offset}, total_available={total_count}")
                
                if offset >= total_count:
                    print(f"[Rank] ⚠️  Offset {offset} >= total count {total_count}, returning empty (no more jobs available)")
                    return []
                
                cur.execute(
                    """
                    SELECT j.*, ujs.last_match_score AS _user_score
                    FROM user_job_scores ujs
                    JOIN jobs j ON j.id::text = ujs.job_id
                    WHERE ujs.user_id = %s
                      AND (j.is_active IS NULL OR j.is_active = TRUE)
                    ORDER BY ujs.last_match_score DESC NULLS LAST, j.posted_at DESC NULLS LAST, j.id ASC
                    LIMIT %s OFFSET %s
                    """,
                    (user_id, limit, offset),
                )
                direct_cols = [d[0] for d in cur.description]
                direct_rows = [dict(zip(direct_cols, r)) for r in cur.fetchall()]
                if direct_rows:
                    job_ids = [r.get('id') for r in direct_rows[:10]]
                    print(f"[Rank] User-first query returned {len(direct_rows)} jobs (offset={offset}, total={total_count}). First 10 job IDs: {job_ids}")
                    return direct_rows
                else:
                    print(f"[Rank] User-first query returned 0 jobs (offset={offset}, limit={limit}, total={total_count})")
            except Exception as e:
                print(f"[Rank] ⚠️ User-first selection failed, falling back to FTS. Error: {e}")
                import traceback
                traceback.print_exc()
        
        # Optional join to user_job_scores for per-user ordering
        user_score_join = ""
        user_score_select = ""
        user_score_params: List[Any] = []
        if user_id:
            # Cast j.id to text to match user_job_scores.job_id TEXT column
            user_score_join = "LEFT JOIN user_job_scores ujs ON ujs.job_id = j.id::text AND ujs.user_id = %s"
            user_score_select = ", ujs.last_match_score AS _user_score"
            user_score_params.append(user_id)

        # Simple query: fetch jobs with FTS matching
        base_query = f"""
        SELECT
            j.*,
            (
                ts_rank_cd(
                to_tsvector('english', coalesce(j.title, '') || ' ' || coalesce(j.description, '')),
                {fts_func}('english', %s)
            ) * 1.5
            +
            ts_rank_cd(
                to_tsvector('english', coalesce(j.description, '')),
                {fts_func}('english', %s)
            ) * 0.5
            ) AS score
            {user_score_select}
        FROM jobs j
        {user_score_join}
        WHERE (j.is_active IS NULL OR j.is_active = TRUE)
        AND (
            to_tsvector('english', coalesce(j.title, '') || ' ' || coalesce(j.description, '')) @@ {fts_func}('english', %s)
            {f"OR (ujs.last_match_score IS NOT NULL AND ujs.last_match_score >= 0.7)" if user_id else ""}
        )
        """
        
        # IMPORTANT: Parameter order must match placeholder order in SQL
        # Order of placeholders:
        # 1-2: score calculation (title+desc and desc only) - 2 placeholders
        # then (if present) JOIN user_job_scores ... %s (user_id)
        # 3: WHERE ts_query - 1 placeholder
        params = [ts_query_param, ts_query_param]  # 2 params for SELECT score calculation
        if user_score_params:
            params.extend(user_score_params)  # user_id for JOIN
        params.append(ts_query_param)  # WHERE ts_query
        
        # Add filters
        # NOTE: Location is NOT used for filtering - it's only used for ranking/boosting.
        # We *do* hard-filter on title vs. explicit keyword phrases below.
        filters = []
        # Removed location filter - we want to show all jobs, just rank by location proximity
        # if location:
        #     filters.append("(j.location ILIKE %s OR j.location = %s)")
        #     params.extend([f"%{location}%", location])
        if remote_type:
            # Relax remote_type filter to include rows where remote_type is NULL
            filters.append("(j.remote_type = %s OR j.remote_type IS NULL)")
            params.append(remote_type)
        if experience_level:
            # Map experience level to ranges
            exp_ranges = {
                "entry": (0, 2),
                "mid": (2, 5),
                "senior": (5, 10),
                "leadership": (10, 999),
            }
            min_exp, max_exp = exp_ranges.get(experience_level, (0, 999))
            # Handle NULL experience bounds in data
            filters.append("((j.experience_min IS NULL OR j.experience_min <= %s) AND (j.experience_max IS NULL OR j.experience_max >= %s))")
            params.extend([max_exp, min_exp])

        # Hard filter: only fetch rows whose titles exactly match one of the keyword phrases (case-insensitive).
        # This completely blocks unrelated domains like "Director Growth Monetization" when searching engineering titles.
        if query_keywords:
            normalized_title_phrases: List[str] = []
            for kw in query_keywords:
                kw_str = (kw or "").strip()
                if not kw_str:
                    continue
                normalized_title_phrases.append(" ".join(kw_str.lower().split()))
            if normalized_title_phrases:
                title_placeholders = ", ".join(["%s"] * len(normalized_title_phrases))
                filters.append(f"LOWER(j.title) IN ({title_placeholders})")
                params.extend(normalized_title_phrases)
        
        if filters:
            base_query += " AND " + " AND ".join(filters)
        
        # Simple ORDER BY: FTS score, then posted date, then id for uniqueness
        order_by_parts = [
            "score DESC",  # FTS relevance score (primary sort)
        ]
        if user_id:
            order_by_parts.append("ujs.last_match_score DESC NULLS LAST")
        order_by_parts.extend([
            "j.posted_at DESC NULLS LAST",  # Recent jobs first
            "j.id ASC"  # Deterministic tie-breaker
        ])
        
        base_query += f"""
        ORDER BY {', '.join(order_by_parts)}
        LIMIT %s OFFSET %s
        """
        
        # Simple params: just the FTS queries for WHERE and SELECT, plus limit/offset
        params.extend([limit, offset])
        
        # Debug: verify parameter count matches placeholders
        placeholder_count = base_query.count('%s')
        param_count = len(params)
        
        # Always log for debugging
        # Count placeholders more accurately
        base_query_placeholders = base_query[:base_query.find('ORDER BY')].count('%s') if 'ORDER BY' in base_query else base_query.count('%s')
        order_by_placeholders = placeholder_count - base_query_placeholders
        
        print(f"[Rank] Parameter check: {placeholder_count} placeholders, {param_count} params")
        print(f"[Rank] Simple query: limit={limit}, offset={offset}, FTS query='{ts_query_param[:100]}'")
        
        if placeholder_count != param_count:
            print(f"[Rank] ERROR: Parameter count mismatch! Placeholders: {placeholder_count}, Params: {param_count}")
            print(f"[Rank] Base query placeholders: {base_query[:200].count('%s')} (showing first 200 chars)")
            print(f"[Rank] ORDER BY placeholders: {base_query[base_query.find('ORDER BY'):].count('%s') if 'ORDER BY' in base_query else 0}")
            # Print a sample of the query to debug
            order_by_start = base_query.find('ORDER BY')
            if order_by_start > 0:
                print(f"[Rank] ORDER BY clause sample: {base_query[order_by_start:order_by_start+500]}")
            raise ValueError(f"SQL parameter count mismatch: {placeholder_count} placeholders but {param_count} parameters")
        
        try:
            # Debug: Print full parameter list with indices
            print(f"[Rank] Full params list ({len(params)} items):")
            for i, p in enumerate(params):
                print(f"  [{i}] {repr(p)[:100]}")
            # Also print the ORDER BY part of the query to see placeholders
            order_by_idx = base_query.find('ORDER BY')
            if order_by_idx > 0:
                order_by_part = base_query[order_by_idx:]
                print(f"[Rank] ORDER BY part has {order_by_part.count('%s')} placeholders")
                print(f"[Rank]   - LIMIT/OFFSET: 2")
            
            # Debug: Print a sample of the actual query to see if % characters are causing issues
            # Check if there are any unescaped % characters that might confuse psycopg2
            # (psycopg2 uses %s for parameters, but % inside string literals should be fine)
            order_by_sample = base_query[base_query.find('ORDER BY'):base_query.find('ORDER BY')+300] if 'ORDER BY' in base_query else ""
            print(f"[Rank] ORDER BY sample (first 300 chars): {order_by_sample}")
            
            # Try to identify if there's a % that's not %s or %%
            # Count %s, %%, and other % patterns
            percent_s_count = base_query.count('%s')
            percent_percent_count = base_query.count('%%')
            total_percent_count = base_query.count('%')
            other_percent_count = total_percent_count - percent_s_count - percent_percent_count
            print(f"[Rank] % analysis: %s={percent_s_count}, %%= {percent_percent_count}, other %={other_percent_count}, total %={total_percent_count}")
            
            # Convert params to tuple to ensure proper handling
            params_tuple = tuple(params)
            cur.execute(base_query, params_tuple)
        except Exception as e:
            print(f"[Rank] Execute error: {e}")
            print(f"[Rank] Query length: {len(base_query)}")
            print(f"[Rank] Params: {params[:10]}... (showing first 10)")
            # Try to find which parameter index is causing the issue
            import traceback
            print(f"[Rank] Traceback: {traceback.format_exc()}")
            raise
        columns = [desc[0] for desc in cur.description]
        jobs = [dict(zip(columns, row)) for row in cur.fetchall()]
        
        
        # Helper function to check if country variant matches in job location
        def country_matches(job_location: str, country_variants: set) -> bool:
            """Check if any country variant (name or code) appears in job location."""
            if not country_variants or not job_location:
                return False
            
            # Normalize job location: split by comma and check each part
            location_parts = [part.strip().lower() for part in job_location.split(',')]
            job_location_lower = job_location.lower()
            
            for variant in country_variants:
                variant_lower = variant.lower().strip()
                
                # For country codes (2 letters), check if it appears as the last part
                # or as a standalone word in any part
                if len(variant_lower) == 2:
                    # Check if code appears as the last part (most common case: "City, Country Code")
                    if location_parts and location_parts[-1].strip() == variant_lower:
                        return True
                    # Check if code appears as a standalone word in any part (word boundary)
                    for part in location_parts:
                        part_clean = part.strip()
                        if part_clean == variant_lower:
                            return True
                        # Use word boundary to match standalone country codes
                        if re.search(r'\b' + re.escape(variant_lower) + r'\b', part_clean):
                            return True
                    # Also check the full location string with word boundaries
                    if re.search(r'\b' + re.escape(variant_lower) + r'\b', job_location_lower):
                        return True
                else:
                    # For country names, check if it appears in any part or anywhere in the location
                    for part in location_parts:
                        part_clean = part.strip()
                        if variant_lower in part_clean:
                            return True
                    # Also check the full location string for partial matches
                    if variant_lower in job_location_lower:
                        return True
            
            return False
        
        # Add location_tier to each job for frontend grouping
        # Also boost match scores based on location tier to ensure location-matched jobs appear first
        # Only add tier when user_location is provided (for "Any" searches)
        if user_location_city or user_location_country:
            # Get country variants (name and code) for matching
            country_variants = get_country_variants(user_location_country) if user_location_country else set()
            
            # Location tier boost multipliers (higher = better location match)
            tier_boost = {
                'exact': 1.3,    # 30% boost for exact location match
                'city': 1.2,     # 20% boost for city match
                'country': 1.1,  # 10% boost for country match
                'other': 1.0,    # No boost for other locations
            }
            
            # Debug logging
            if country_variants:
                print(f"[Rank] Country variants for matching: {country_variants}")
            
            # Fetch user city aliases once (for efficiency)
            user_city_aliases = None
            if user_location_city and _GEONAMES_AVAILABLE:
                try:
                    user_city_lower = user_location_city.lower()
                    user_city_aliases = {user_city_lower} | set(get_city_aliases(user_city_lower))
                    print(f"[Rank] ✅ Fetched {len(user_city_aliases)} aliases for user city '{user_location_city}': {sorted(list(user_city_aliases))[:10]}")
                except Exception as e:
                    print(f"[Rank] ⚠️  Failed to fetch city aliases: {e}")
                    user_city_aliases = {user_location_city.lower()}
            elif user_location_city:
                user_city_aliases = {user_location_city.lower()}
            
            for job in jobs:
                job_location_raw = job.get('location') or ''
                job_location = job_location_raw.lower()
                
                # Determine location tier
                if user_location_city and user_location_country:
                    # Check for exact match (city + country/code) using aliases
                    city_match = _city_matches_with_aliases(job_location_raw, user_location_city, user_city_aliases)
                    country_match = country_matches(job_location, country_variants)
                    
                    if city_match and country_match:
                        job['location_tier'] = 'exact'  # Exact match (city + country)
                    elif city_match:
                        job['location_tier'] = 'city'  # City match (including aliases)
                    elif country_match:
                        job['location_tier'] = 'country'  # Country match
                    else:
                        job['location_tier'] = 'other'  # Rest of world
                elif user_location_city:
                    # Check city match using aliases
                    if _city_matches_with_aliases(job_location_raw, user_location_city, user_city_aliases):
                        job['location_tier'] = 'city'
                    else:
                        job['location_tier'] = 'other'
                elif user_location_country:
                    # Check if any country variant (name or code) matches
                    country_match = country_matches(job_location, country_variants)
                    if country_match:
                        job['location_tier'] = 'country'
                        # Debug logging
                        if len([j for j in jobs if j.get('location')]) <= 3:
                            print(f"[Rank] ✅ Matched country for job: '{job_location_raw}' -> tier: country")
                    else:
                        job['location_tier'] = 'other'
                        # Debug logging
                        if len([j for j in jobs if j.get('location')]) <= 3:
                            print(f"[Rank] ❌ No country match for job: '{job_location_raw}' -> tier: other")
                else:
                    job['location_tier'] = None
                
                # Boost match score based on location tier
                # This ensures location-matched jobs rank higher across all pages
                location_tier = job.get('location_tier', 'other')
                boost_multiplier = tier_boost.get(location_tier, 1.0)
                
                # Get current score (from last_match_score or compute)
                current_score = job.get('last_match_score')
                if current_score is None:
                    # If no stored score, use a default based on FTS ranking
                    # The score column should be available from the query
                    current_score = job.get('score', 0.0)
                
                # Apply location boost (cap at 1.0)
                boosted_score = min(1.0, (current_score or 0.0) * boost_multiplier)
                job['match_score'] = boosted_score
                job['_original_score'] = current_score  # Keep original for reference
        
        # Ensure uniqueness by job ID (in case of any duplicates)
        seen_ids = set()
        unique_jobs = []
        for job in jobs:
            job_id = job.get('id')
            if job_id and job_id not in seen_ids:
                seen_ids.add(job_id)
                unique_jobs.append(job)
        jobs = unique_jobs
        
        # Debug: log how many jobs matched
        print(f"[Rank] FTS query matched {len(jobs)} unique jobs (requested limit={limit}, offset={offset})")
        
        # If no jobs matched and we have keywords, try a simpler query (just ILIKE on title/description)
        if not jobs and terms:
            print(f"[Rank] FTS returned 0 jobs, trying ILIKE fallback")
            try:
                # Build ILIKE conditions for each term
                ilike_conditions = []
                ilike_params = []
                for term in terms:
                    # Remove quotes if present
                    clean_term = term.strip('"')
                    ilike_conditions.append("(j.title ILIKE %s OR j.description ILIKE %s)")
                    ilike_params.extend([f"%{clean_term}%", f"%{clean_term}%"])
                
                ilike_query = f"""
                SELECT j.*, 0.5 as score
                FROM jobs j
                WHERE (j.is_active IS NULL OR j.is_active = TRUE)
                AND ({' OR '.join(ilike_conditions)})
                """
                
                # Rebuild filter conditions and params for ILIKE query
                # NOTE: Location is NOT used for filtering - it's only used for ranking/boosting
                ilike_filters = []
                # Removed location filter - we want to show all jobs, just rank by location proximity
                # if location:
                #     ilike_filters.append("(j.location ILIKE %s OR j.location = %s)")
                #     ilike_params.extend([f"%{location}%", location])
                if remote_type:
                    ilike_filters.append("(j.remote_type = %s OR j.remote_type IS NULL)")
                    ilike_params.append(remote_type)
                if experience_level:
                    exp_ranges = {
                        "entry": (0, 2),
                        "mid": (2, 5),
                        "senior": (5, 10),
                        "leadership": (10, 999),
                    }
                    min_exp, max_exp = exp_ranges.get(experience_level, (0, 999))
                    ilike_filters.append("((j.experience_min IS NULL OR j.experience_min <= %s) AND (j.experience_max IS NULL OR j.experience_max >= %s))")
                    ilike_params.extend([max_exp, min_exp])
                
                if ilike_filters:
                    ilike_query += " AND " + " AND ".join(ilike_filters)
                
                # Simple ORDER BY for ILIKE fallback
                ilike_query += f"""
                ORDER BY COALESCE(j.last_match_score, 0.5) DESC,
                j.posted_at DESC NULLS LAST, j.id ASC
                LIMIT %s OFFSET %s
                """
                
                ilike_params.extend([limit, offset])
                cur.execute(ilike_query, ilike_params)
                ilike_columns = [desc[0] for desc in cur.description]
                ilike_jobs = [dict(zip(ilike_columns, row)) for row in cur.fetchall()]
                print(f"[Rank] ILIKE fallback returned {len(ilike_jobs)} jobs")
                if ilike_jobs:
                    jobs = ilike_jobs
            except Exception as ilike_err:
                print(f"[Rank] ILIKE fallback error: {ilike_err}")
                import traceback
                traceback.print_exc()

        # If too few results, broaden by pulling recent LinkedIn jobs not already included
        # BUT: Only do this on the first page (offset=0) to avoid pagination issues
        if len(jobs) < limit and offset == 0:
            try:
                # Collect existing ids to avoid duplicates
                existing_ids = {j.get('id') for j in jobs if j.get('id') is not None}
                remaining = limit - len(jobs)
                # Supplemental broader query: prefer LinkedIn, recent, loose match
                # Add a low score (0.1) for supplemental jobs so they sort after main results
                supplemental_query = f"""
                WITH li AS (
                    SELECT id FROM sources WHERE code = 'linkedin'
                )
                SELECT j.*, 0.1 as score
                FROM jobs j, li
                WHERE (j.is_active IS NULL OR j.is_active = TRUE)
                  AND j.source_id = li.id
                  AND to_tsvector('english', coalesce(j.title,'') || ' ' || coalesce(j.description,'')) @@ {fts_func}('english', %s)
                  {"AND j.id NOT IN (" + ",".join(["%s"] * len(existing_ids)) + ")" if existing_ids else ""}
                ORDER BY COALESCE(j.last_match_score, 0.1) DESC, j.posted_at DESC NULLS LAST, j.id ASC
                LIMIT %s OFFSET 0
                """
                supp_params: List[Any] = []  # type: ignore
                supp_params.append(ts_query_param if ts_query_param else '')
                # Removed location params - we're not filtering by location, just ranking
                if existing_ids:
                    supp_params.extend(list(existing_ids))
                supp_params.append(remaining)

                cur.execute(supplemental_query, supp_params)
                supp_rows = [dict(zip([d[0] for d in cur.description], row)) for row in cur.fetchall()]
                # Append supplemental rows
                for r in supp_rows:
                    jobs.append(r)
                    if len(jobs) >= limit:
                        break
            except Exception:
                # If supplemental fetch fails, return what we have
                pass

        return jobs

