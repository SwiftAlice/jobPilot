"""
Worker that consumes from Redis Streams and processes job fetch tasks.
"""
import asyncio
import json
import os
import time
from typing import Dict, Any, List, Optional
from datetime import datetime
import psycopg2
from psycopg2.extras import execute_values
import redis

# Flag to skip fetching (for DB testing only)
SKIP_FETCH = os.getenv("WORKER_SKIP_FETCH", "0") == "1"

from deps import get_db_pool, get_redis_client, STREAM_FANOUT, STREAM_GROUP
from connectors.base import SearchQuery, JobConnector
from connectors.adzuna import AdzunaConnector
from connectors.jooble import JoobleConnector
from connectors.remoteok import RemoteOKConnector
from pipelines.normalize import canonicalize_job
from pipelines.dedupe import dedupe_jobs
from utils.rate_limit import get_rate_limiter
from utils.circuit_breaker import CircuitBreaker
from scoring import compute_unified_score


async def _process_and_upsert_job_batch(
    source: str,
    source_id: int,
    raw_jobs: List[Any],
    query: SearchQuery,
    conn: Any,
    cur: Any,
    seen_external_ids_global: set,
    user_id: Optional[str] = None,  # User ID for scoring
) -> Dict[str, int]:
    """
    Process a batch of jobs (dedupe, score, company upserts, DB upsert) incrementally.
    Returns: {'new': int, 'duplicates': int}
    """
    if not raw_jobs:
        return {'new': 0, 'duplicates': 0}
    
    # Debug: check location on jobs at the start of processing
    for i, job in enumerate(raw_jobs[:3]):  # Check first 3 jobs
        job_loc = getattr(job, 'location', None) if hasattr(job, 'location') else (job.get('location') if isinstance(job, dict) else None)
        job_ext_id = getattr(job, 'external_id', None) or (job.get('external_id') if isinstance(job, dict) else None)
        if job_loc and job_loc.strip():
            print(f"[Worker][{source}] ✅ Job {i} in batch has location: '{job_loc}' (external_id: {job_ext_id[:50] if job_ext_id else 'unknown'})")
        else:
            print(f"[Worker][{source}] ⚠️  Job {i} in batch has NO location (external_id: {job_ext_id[:50] if job_ext_id else 'unknown'})")
    
    # Process and insert jobs one by one (check + insert in single operation)
    # This is more efficient than batch checking then batch inserting
    context_keywords = query.keywords or []
    context_skills = getattr(query, "skills", []) or []
    context_location = query.location
    
    # Fetch search location aliases once (for efficiency)
    search_location_aliases = None
    if context_location:
        try:
            from utils.geonames import get_city_aliases
            from scoring.unified import _extract_city_from_location
            search_city = _extract_city_from_location(context_location.lower())
            if search_city:
                search_location_aliases = {search_city} | set(get_city_aliases(search_city))
                print(f"[Worker][{source}] ✅ Fetched {len(search_location_aliases)} aliases for search location '{context_location}': {sorted(list(search_location_aliases))[:10]}")
        except Exception as e:
            print(f"[Worker][{source}] ⚠️  Failed to fetch search location aliases: {e}")
    context_experience = query.experience_level
    context_remote = query.remote_type
    
    inserted_count = 0
    duplicate_count = 0
    error_count = 0
    scoring_error_logged = False
    
    # Company cache to avoid repeated queries
    company_map = {}
    
    import time
    batch_start_time = time.time()
    
    for idx, job in enumerate(raw_jobs):
        job_start_time = time.time()
        try:
            # Get external_id for deduplication check
            external_id = getattr(job, 'external_id', None) if hasattr(job, 'external_id') else (job.get('external_id') if isinstance(job, dict) else None)
            
            # Check if job exists in DB (but still process it to update location/description)
            db_check_start = time.time()
            db_check_time = 0.0
            is_existing_job = False
            if external_id:
                cur.execute(
                    "SELECT id FROM jobs WHERE source_id = %s AND external_id = %s",
                    (source_id, external_id)
                )
                if cur.fetchone():
                    is_existing_job = True
                db_check_time = time.time() - db_check_start
            
            # Do not skip duplicates based on lack of updates; always upsert to refresh scraped_at and allow later enrichments
            
            # Debug: check location on RawJob object before canonicalization
            raw_location = getattr(job, 'location', None) if hasattr(job, 'location') else (job.get('location') if isinstance(job, dict) else None)
            job_external_id = getattr(job, 'external_id', None) or (job.get('external_id') if isinstance(job, dict) else None)
            if raw_location and raw_location.strip():
                print(f"[Worker][{source}] ✅ RawJob location before canonicalize: '{raw_location}' (external_id: {job_external_id[:50] if job_external_id else 'unknown'}, job type: {type(job)})")
            elif idx < 10:  # Log more jobs to see the pattern
                print(f"[Worker][{source}] ⚠️  RawJob has no location: '{raw_location}' (external_id: {job_external_id[:50] if job_external_id else 'unknown'}, job type: {type(job)})")
                # Try to inspect the job object more deeply
                if hasattr(job, '__dict__'):
                    print(f"[Worker][{source}]    Job attributes: {list(job.__dict__.keys())[:10]}")
                elif isinstance(job, dict):
                    print(f"[Worker][{source}]    Job dict keys: {list(job.keys())[:10]}")
            
            # Canonicalize job
            canon_start = time.time()
            try:
                job_dict = canonicalize_job(job)
            except Exception as canon_err:
                print(f"[Worker][{source}] Canonicalization error for job {idx}: {canon_err}")
                error_count += 1
                continue
            canon_time = time.time() - canon_start
            
            # Debug: check location after canonicalization
            canon_location = job_dict.get("location")
            if canon_location and canon_location.strip() and idx < 5:
                print(f"[Worker][{source}] Location after canonicalize: '{canon_location}'")
            elif idx < 3 and raw_location and raw_location.strip():
                print(f"[Worker][{source}] ⚠️  Location lost during canonicalization! Raw had: '{raw_location}', canonicalized has: '{canon_location}'")
            
            # Hash check (for deduplication stats, but don't skip - we still want to update)
            hash_check_start = time.time()
            hash_check_time = 0.0
            try:
                # Quick hash check (for stats only, don't skip)
                job_hash = job_dict.get("hash")
                if job_hash and not is_existing_job:  # Only check hash if not already found by external_id
                    cur.execute(
                        "SELECT id FROM jobs WHERE source_id = %s AND hash = %s",
                        (source_id, job_hash)
                    )
                    if cur.fetchone():
                        # Mark as duplicate but still process to allow updates
                        is_existing_job = True
            except Exception:
                pass  # Continue even if hash check fails
            hash_check_time = time.time() - hash_check_start
            
            # Get or create company
            company_start = time.time()
            company = job_dict.get("company") or ''
            company_id = None
            if company:
                if company not in company_map:
                    cur.execute("SELECT id FROM companies WHERE name = %s", (company,))
                    row = cur.fetchone()
                    if row:
                        company_map[company] = row[0]
                    else:
                        cur.execute("INSERT INTO companies (name) VALUES (%s) RETURNING id", (company,))
                        company_map[company] = cur.fetchone()[0]
                company_id = company_map[company]
            company_time = time.time() - company_start
            
            # Don't set placeholder here - only set it when reading from DB for display
            # For scoring, use empty string if no description (scoring handles this)
            job_description = job_dict.get("description") or ""
            
            # Debug: log description status for first few jobs
            if idx < 5:
                desc_len = len(job_description) if job_description else 0
                print(f"[Worker][{source}] Job {idx + 1}: Description status - has_desc={bool(job_description)}, desc_len={desc_len}, desc_preview={job_description[:100] if job_description else 'None'}...")
                print(f"[Worker][{source}] Job {idx + 1}: user_id={user_id}, will compute score: {bool(user_id and job_description)}")
            
            # Initialize scoring_time for timing logs
            scoring_time = 0.0
            
            # NOTE: Scores are computed and stored per-user in user_job_scores table
            # after the job is inserted (see below)
            match_score = None  # Don't store in jobs table (user-specific)
            
            # Insert job immediately (check + insert in one operation)
            insert_query = """
                INSERT INTO jobs (
                    source_id, external_id, company_id, company, title, normalized_title,
                    description, location, url, posted_at, min_salary, max_salary, currency,
                    experience_min, experience_max, employment_type, remote_type, skills, hash, last_match_score
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (source_id, external_id) DO UPDATE SET
                    company_id = COALESCE(EXCLUDED.company_id, jobs.company_id),
                    company = COALESCE(NULLIF(EXCLUDED.company, ''), jobs.company),
                    title = COALESCE(NULLIF(EXCLUDED.title, ''), jobs.title),
                    normalized_title = COALESCE(EXCLUDED.normalized_title, jobs.normalized_title),
                    -- Always update description if new one is provided and is not NULL/empty
                    -- Priority: new non-empty description > existing description (always replace NULL/empty)
                    description = CASE 
                        -- If new description is valid (not NULL/empty), always use it if existing is NULL/empty
                        WHEN EXCLUDED.description IS NOT NULL AND EXCLUDED.description != '' 
                             AND (jobs.description IS NULL OR jobs.description = '' 
                                  OR jobs.description = 'No description available as of now')
                        THEN EXCLUDED.description
                        -- If new description is valid and longer than existing, use it
                        WHEN EXCLUDED.description IS NOT NULL AND EXCLUDED.description != '' 
                             AND LENGTH(EXCLUDED.description) > LENGTH(COALESCE(jobs.description, ''))
                        THEN EXCLUDED.description
                        -- Keep existing description if it's valid and new one is NULL/empty
                        ELSE COALESCE(jobs.description, EXCLUDED.description, 'No description available as of now')
                    END,
                    -- Always update location if new one is provided (non-empty)
                    -- Priority: new non-empty location > existing location > new empty location
                    location = CASE 
                        WHEN EXCLUDED.location IS NOT NULL AND EXCLUDED.location != '' AND EXCLUDED.location != 'N/A'
                        THEN EXCLUDED.location  -- Always use new non-empty location
                        WHEN jobs.location IS NOT NULL AND jobs.location != '' AND jobs.location != 'N/A'
                        THEN jobs.location  -- Keep existing non-empty location if new is empty
                        ELSE COALESCE(EXCLUDED.location, jobs.location)  -- Fallback to new or existing
                    END,
                    url = COALESCE(NULLIF(EXCLUDED.url, ''), jobs.url),
                    posted_at = COALESCE(EXCLUDED.posted_at, jobs.posted_at),
                    min_salary = COALESCE(EXCLUDED.min_salary, jobs.min_salary),
                    max_salary = COALESCE(EXCLUDED.max_salary, jobs.max_salary),
                    currency = COALESCE(EXCLUDED.currency, jobs.currency),
                    experience_min = COALESCE(EXCLUDED.experience_min, jobs.experience_min),
                    experience_max = COALESCE(EXCLUDED.experience_max, jobs.experience_max),
                    employment_type = COALESCE(EXCLUDED.employment_type, jobs.employment_type),
                    remote_type = COALESCE(EXCLUDED.remote_type, jobs.remote_type),
                    skills = COALESCE(EXCLUDED.skills, jobs.skills),
                    hash = COALESCE(EXCLUDED.hash, jobs.hash),
                    -- Don't store last_match_score - it's user-specific and computed on fetch
                    -- last_match_score = NULL (scores are computed per-user on fetch and cached in Redis)
                    scraped_at = NOW()
            """
            
            # Debug: log location for jobs with location data
            job_location = job_dict.get("location")
            if job_location and job_location.strip():
                if idx < 10:  # Log first 10 to see pattern
                    print(f"[Worker][{source}] Job location before insert/update: '{job_location}' (external_id: {job_dict.get('external_id', 'unknown')[:50]})")
            elif idx < 5:
                print(f"[Worker][{source}] ⚠️  Job has no location: '{job_location}' (external_id: {job_dict.get('external_id', 'unknown')[:50]})")
            
            # Use NULL for description if empty/placeholder (let DB handle placeholder on read)
            job_description_for_db = job_dict.get("description") or None
            if job_description_for_db and job_description_for_db.strip() == "No description available as of now":
                job_description_for_db = None  # Store as NULL, not placeholder
            
            row = (
                source_id,
                job_dict.get("external_id"),
                company_id,
                job_dict.get("company"),
                job_dict.get("title"),
                job_dict.get("normalized_title"),
                job_description_for_db,  # NULL if empty/placeholder
                job_location,  # Use explicit variable
                job_dict.get("url"),
                job_dict.get("posted_at"),
                job_dict.get("min_salary"),
                job_dict.get("max_salary"),
                job_dict.get("currency"),
                job_dict.get("experience_min"),
                job_dict.get("experience_max"),
                job_dict.get("employment_type"),
                job_dict.get("remote_type"),
                job_dict.get("skills", []),
                job_dict.get("hash"),
                None,  # last_match_score = NULL (user-specific, computed on fetch)
            )
            
            insert_start = time.time()
            try:
                # Log what we're about to insert/update
                has_location_update = job_location and job_location.strip() and job_location != 'N/A'
                has_description_update = job_dict.get("description") and str(job_dict.get("description", "")).strip() and job_dict.get("description") != "No description available as of now"
                
                # Always log for duplicate jobs to see what's happening
                if is_existing_job:
                    print(f"[Worker][{source}] 🔍 Duplicate job detected: external_id={job_dict.get('external_id', 'unknown')[:50]}, is_existing={is_existing_job}, has_loc={has_location_update}, has_desc={has_description_update}, location='{job_location}', desc_len={len(job_dict.get('description', '') or '')}")
                
                if is_existing_job and (has_location_update or has_description_update):
                    print(f"[Worker][{source}] 🔄 Updating existing job {job_dict.get('external_id', 'unknown')[:50]}: location='{job_location}', desc_len={len(job_dict.get('description', '') or '')}, has_loc={has_location_update}, has_desc={has_description_update}")
                
                cur.execute(insert_query, row)
                rows_affected = cur.rowcount
                print(f"[Worker][{source}] 📊 INSERT/UPDATE executed: rows_affected={rows_affected}, is_existing={is_existing_job}, external_id={job_dict.get('external_id', 'unknown')[:50]}")
                conn.commit()  # Commit immediately so Realtime picks it up
                
                # Get the job_id from the inserted/updated job
                job_id = None
                if not is_existing_job:
                    # For new jobs, get the ID from the insert
                    cur.execute("SELECT id FROM jobs WHERE source_id = %s AND external_id = %s", (source_id, job_dict.get("external_id")))
                    id_row = cur.fetchone()
                    if id_row:
                        job_id = str(id_row[0])  # Convert to string (jobs.id is TEXT)
                else:
                    # For existing jobs, get the ID
                    cur.execute("SELECT id FROM jobs WHERE source_id = %s AND external_id = %s", (source_id, job_dict.get("external_id")))
                    id_row = cur.fetchone()
                    if id_row:
                        job_id = str(id_row[0])  # Convert to string (jobs.id is TEXT)
                
                # Compute and store score if user_id is provided and job has description
                scoring_start = time.time()
                if user_id and job_id:
                    job_desc = job_dict.get('description') or ''
                    if job_desc and job_desc.strip() and job_desc != "No description available as of now":
                        try:
                            from scoring.unified import compute_unified_score
                            from utils.geonames import get_city_aliases
                            from scoring.unified import _extract_city_from_location
                            
                            if idx < 5:
                                print(f"[Worker][{source}] Computing score for job {job_id}: user_id={user_id}, has_desc={bool(job_desc)}, desc_len={len(job_desc)}")
                            
                            # Fetch search location aliases for scoring
                            search_location_aliases = None
                            if context_location:
                                try:
                                    search_city = _extract_city_from_location(context_location.lower())
                                    if search_city:
                                        search_location_aliases = {search_city} | set(get_city_aliases(search_city))
                                except Exception:
                                    pass
                            
                            # Compute score
                            scoring_result = compute_unified_score(
                                job_dict,
                                keywords=context_keywords,
                                skills=context_skills,
                                location=context_location,
                                experience_level=context_experience,
                                remote_preference=context_remote,
                                search_location_aliases=search_location_aliases,
                            )
                            match_score = scoring_result['score']
                            match_components = scoring_result.get('components', {})
                            match_details = scoring_result.get('details', {})
                            
                            # Apply user-specific location tier boost before persisting
                            try:
                                from ranking.rank import _city_matches_with_aliases, get_country_variants
                                from scoring.unified import _extract_city_from_location
                                from utils.geonames import get_city_aliases
                                user_city = None
                                user_country = None
                                if context_location:
                                    parts = [p.strip() for p in str(context_location).split(',') if p.strip()]
                                    user_city = parts[0] if parts else None
                                    user_country = parts[-1] if len(parts) > 1 else None
                                job_location_raw = str(job_dict.get('location') or '')
                                location_tier = 'other'
                                city_match = False
                                country_match = False
                                if user_city:
                                    try:
                                        aliases = {user_city.lower()} | set(get_city_aliases(user_city.lower()))
                                    except Exception:
                                        aliases = {user_city.lower()}
                                    city_match = _city_matches_with_aliases(job_location_raw, user_city, aliases)
                                if user_country:
                                    variants = get_country_variants(user_country)
                                    jl = job_location_raw.lower()
                                    country_match = any(v.lower() in jl for v in variants)
                                if city_match and country_match:
                                    location_tier = 'exact'
                                elif city_match:
                                    location_tier = 'city'
                                elif country_match:
                                    location_tier = 'country'
                                tier_boost = {'exact': 1.3, 'city': 1.2, 'country': 1.1, 'other': 1.0}
                                match_score = min(1.0, match_score * tier_boost.get(location_tier, 1.0))
                            except Exception:
                                pass
                            
                            if idx < 5:
                                print(f"[Worker][{source}] Score computed: {match_score*100:.1f}% (components: {match_components})")
                            
                            # Store in user_job_scores table
                            import json
                            components_json = json.dumps(match_components) if match_components else None
                            details_json = json.dumps(match_details) if match_details else None
                            
                            cur.execute(
                                """
                                INSERT INTO user_job_scores (user_id, job_id, last_match_score, match_components, match_details)
                                VALUES (%s, %s, %s, %s::jsonb, %s::jsonb)
                                ON CONFLICT (user_id, job_id) 
                                DO UPDATE SET 
                                    last_match_score = EXCLUDED.last_match_score,
                                    match_components = EXCLUDED.match_components,
                                    match_details = EXCLUDED.match_details,
                                    updated_at = now()
                                """,
                                (user_id, job_id, float(match_score), components_json, details_json)
                            )
                            conn.commit()
                            if idx < 5:
                                print(f"[Worker][{source}] ✅ Computed and stored score {match_score*100:.1f}% for job {job_id} (user_id={user_id})")
                        except Exception as score_err:
                            print(f"[Worker][{source}] ⚠️  Score computation failed for job {job_id}: {score_err}")
                            import traceback
                            traceback.print_exc()
                    else:
                        if idx < 5:
                            print(f"[Worker][{source}] ⚠️  Skipping score computation: no description (desc='{job_desc[:50] if job_desc else 'None'}...')")
                else:
                    if idx < 5:
                        print(f"[Worker][{source}] ⚠️  Skipping score computation: user_id={user_id}, job_id={job_id}")
                scoring_time = time.time() - scoring_start
                
                # Debug: verify location AND description were updated (always check for duplicates)
                if is_existing_job:
                    cur.execute(
                        "SELECT location, description, last_match_score FROM jobs WHERE source_id = %s AND external_id = %s",
                        (source_id, job_dict.get("external_id"))
                    )
                    db_row = cur.fetchone()
                    if db_row:
                        db_loc_value = db_row[0] or ''
                        db_desc_value = db_row[1] or ''
                        db_score = db_row[2] or 0.0
                        
                        print(f"[Worker][{source}] 🔍 DB verification for duplicate: external_id={job_dict.get('external_id', 'unknown')[:50]}")
                        print(f"[Worker][{source}]    DB location: '{db_loc_value}' (expected: '{job_location}')")
                        print(f"[Worker][{source}]    DB description len: {len(db_desc_value or '')} (expected len: {len(job_dict.get('description', '') or '')})")
                        # Note: match_score is None in worker (scores computed on fetch per-user)
                        if db_score is not None:
                            print(f"[Worker][{source}]    DB match_score: {db_score:.2%} (scores computed on fetch per-user)")
                        else:
                            print(f"[Worker][{source}]    DB match_score: NULL (scores computed on fetch per-user)")
                        
                        # Check location
                        if has_location_update:
                            if db_loc_value != job_location:
                                print(f"[Worker][{source}] ❌ Location NOT updated! Expected: '{job_location}', DB has: '{db_loc_value}' (rows_affected: {rows_affected})")
                            else:
                                print(f"[Worker][{source}] ✅ Location updated correctly: '{db_loc_value}'")
                        elif job_location and job_location.strip():
                            print(f"[Worker][{source}] ⚠️  Location update skipped (has_location_update=False): job_location='{job_location}'")
                        
                        # Check description
                        job_desc = job_dict.get("description") or ''
                        if has_description_update:
                            if (not db_desc_value or db_desc_value == "No description available as of now" or len(db_desc_value) < len(job_desc)) and db_desc_value != job_desc:
                                print(f"[Worker][{source}] ❌ Description NOT updated! Expected len: {len(job_desc)}, DB has len: {len(db_desc_value or '')} (rows_affected: {rows_affected})")
                            else:
                                print(f"[Worker][{source}] ✅ Description updated correctly: len={len(db_desc_value or '')}")
                        elif job_desc and job_desc.strip() and job_desc != "No description available as of now":
                            print(f"[Worker][{source}] ⚠️  Description update skipped (has_description_update=False): desc_len={len(job_desc)}")
                        
                        # Note: Match scores are computed on fetch per-user, not in worker
                    else:
                        print(f"[Worker][{source}] ⚠️  Job not found in DB after update! external_id={job_dict.get('external_id', 'unknown')[:50]}")
                elif job_location and job_location.strip() and not is_existing_job:
                    # For new jobs, just verify location
                    cur.execute(
                        "SELECT location FROM jobs WHERE source_id = %s AND external_id = %s",
                        (source_id, job_dict.get("external_id"))
                    )
                    db_location = cur.fetchone()
                    if db_location:
                        db_loc_value = db_location[0] or ''
                        if db_loc_value != job_location:
                            print(f"[Worker][{source}] ⚠️  Location mismatch for NEW job {job_dict.get('external_id', 'unknown')[:50]}! Expected: '{job_location}', DB has: '{db_loc_value}'")
                        elif idx < 10:
                            print(f"[Worker][{source}] ✅ New job location saved: '{db_loc_value}'")
                elif (job_location is None or not job_location.strip()) and idx < 5:
                    print(f"[Worker][{source}] ⚠️  Job {job_dict.get('external_id', 'unknown')[:50]} has no location to update (location: '{job_location}')")
            except Exception as insert_err:
                print(f"[Worker][{source}] Insert error for job {idx + 1}: {insert_err}")
                import traceback
                traceback.print_exc()
                conn.rollback()
                error_count += 1
                continue
            insert_time = time.time() - insert_start
            if is_existing_job:
                duplicate_count += 1
            else:
                inserted_count += 1
            
            job_total_time = time.time() - job_start_time
            
            # Log timing for first few jobs and every 5th job to identify bottlenecks
            if idx < 3 or (inserted_count) % 5 == 0:
                print(f"[Worker][{source}] Job {idx + 1}/{len(raw_jobs)} timing: total={job_total_time:.3f}s, db_check={db_check_time:.3f}s, canon={canon_time:.3f}s, hash={hash_check_time:.3f}s, company={company_time:.3f}s, scoring={scoring_time:.3f}s, insert={insert_time:.3f}s")
                if (inserted_count) % 5 == 0:
                    print(f"[Worker][{source}] Processed {idx + 1}/{len(raw_jobs)} jobs: {inserted_count} inserted, {duplicate_count} duplicates")
        
        except Exception as job_err:
            conn.rollback()
            error_count += 1
            if error_count <= 3:  # Only log first few errors
                print(f"[Worker][{source}] Error processing job {idx + 1}: {job_err}")
            continue
    
    batch_total_time = time.time() - batch_start_time
    avg_time_per_job = batch_total_time / len(raw_jobs) if raw_jobs else 0
    print(f"[Worker][{source}] Batch complete: {inserted_count} inserted, {duplicate_count} duplicates, {error_count} errors in {batch_total_time:.2f}s (avg {avg_time_per_job:.3f}s/job, one-by-one mode)")
    
    return {'new': inserted_count, 'duplicates': duplicate_count}


# Import M2 connectors (with fallback if not available)
try:
    from connectors.linkedin import LinkedInConnector
    LINKEDIN_AVAILABLE = True
except Exception as e:
    print(f"[Worker] LinkedIn connector not available: {e}")
    LINKEDIN_AVAILABLE = False
    LinkedInConnector = None


try:
    from connectors.iimjobs import IIMJobsConnector
    IIMJOBS_AVAILABLE = True
except Exception as e:
    print(f"[Worker] IIMJobs connector not available: {e}")
    IIMJOBS_AVAILABLE = False
    IIMJobsConnector = None


# Registry of connectors
CONNECTORS: Dict[str, JobConnector] = {
    "adzuna": AdzunaConnector(),
    "jooble": JoobleConnector(),
    "remoteok": RemoteOKConnector(),
}

# Add M2 connectors if available
if LINKEDIN_AVAILABLE and LinkedInConnector:
    linkedin_conn = LinkedInConnector()
    # Allow Playwright to be enabled via environment variable
    # Set LINKEDIN_DISABLE_PLAYWRIGHT=0 to enable Playwright for description fetching
    # Default is disabled (1) to avoid timeouts, but can be enabled for better description fetching
    import os
    worker_playwright_setting = os.getenv("LINKEDIN_DISABLE_PLAYWRIGHT", None)
    if worker_playwright_setting is not None:
        # Override with environment variable if set
        linkedin_conn.disable_playwright = worker_playwright_setting == "1"
        print(f"[Worker] LinkedIn Playwright setting from env: disable_playwright={linkedin_conn.disable_playwright}")
    else:
        # Default: enable Playwright for description fetching (it's useful for in.linkedin.com URLs)
        linkedin_conn.disable_playwright = False
        print(f"[Worker] LinkedIn Playwright enabled by default for description fetching")
    CONNECTORS["linkedin"] = linkedin_conn
if IIMJOBS_AVAILABLE and IIMJobsConnector:
    CONNECTORS["iimjobs"] = IIMJobsConnector()


async def process_fetch_task(
    source: str,
    query: SearchQuery,
    since: Optional[datetime],
    db_pool,
    redis_client: redis.Redis,
    user_id: Optional[str] = None,  # User ID for scoring
) -> Dict[str, Any]:
    """Process a single fetch task for a source."""
    print(f"[Worker][{source}] Starting fetch task...")
    connector = CONNECTORS.get(source)
    if not connector:
        print(f"[Worker][{source}] ERROR: Connector not found")
        return {"source": source, "status": "error", "error": "connector_not_found"}
    
    # Check circuit breaker
    breaker = CircuitBreaker(redis_client, source)
    if not breaker.can_proceed():
        print(f"[Worker][{source}] SKIPPED: Circuit breaker open")
        return {"source": source, "status": "skipped", "reason": "circuit_open"}
    
    # Check rate limit
    limiter = get_rate_limiter(redis_client, source)
    if not limiter.acquire():
        print(f"[Worker][{source}] SKIPPED: Rate limit exceeded")
        return {"source": source, "status": "skipped", "reason": "rate_limited"}
    
    print(f"[Worker][{source}] Fetching jobs with keywords={query.keywords}, location={query.location}, max_results={query.max_results}")
    
    try:
        # Enforce daily cap for LinkedIn: disable Playwright after 75 entries today
        daily_cap_reached = False
        if source.lower() == "linkedin":
            try:
                conn_cap = db_pool.getconn()
                cur_cap = conn_cap.cursor()
                cur_cap.execute("""
                    SELECT COUNT(*)
                    FROM jobs j
                    JOIN sources s ON s.id = j.source_id
                    WHERE s.code = %s
                      AND j.created_at::date = CURRENT_DATE
                """, ("linkedin",))
                row = cur_cap.fetchone()
                today_count = int(row[0]) if row and row[0] is not None else 0
                try:
                    cur_cap.close()
                except Exception:
                    pass
                try:
                    db_pool.putconn(conn_cap)
                except Exception:
                    pass
                print(f"[Worker][{source}] Daily cap check: today_count={today_count}")
                if today_count >= 75:
                    try:
                        if hasattr(connector, "disable_playwright"):
                            connector.disable_playwright = True
                            print(f"[Worker][{source}] Daily cap reached ({today_count} >= 75). Disabling Playwright for this run.")
                        daily_cap_reached = True
                    except Exception:
                        pass
            except Exception as cap_err:
                print(f"[Worker][{source}] Daily cap check failed: {cap_err}")

        # For LinkedIn, make parallel calls with different location priorities
        # This ensures we get jobs from user's location first, then country, then everywhere
        if source.lower() == 'linkedin':
            # If cap reached, stop fetching new listings (but allow any ongoing enrichment elsewhere to continue)
            if daily_cap_reached:
                print(f"[Worker][{source}] Daily cap reached: skipping listing fetch (no new jobs will be fetched).")
                breaker.record_success()
                return {
                    "source": source,
                    "status": "success",
                    "fetched": 0,
                    "new": 0,
                    "duplicates": 0,
                }
            # Extract location components for tiered fetching
            location = query.location or ""
            
            # Skip parallel calls if location is "Remote" or empty (these are not real locations)
            # "Remote" should be handled via remote_type, not location
            original_location = location
            if location and isinstance(location, str):
                location_lower = location.strip().lower()
                # If location is "Remote", "Any", or similar, treat as empty
                if location_lower in ('remote', 'any', 'anywhere', ''):
                    location = ""
                    print(f"[Worker][{source}] Location '{original_location}' is not a real location, treating as empty for parallel calls")
            
            location_city = None
            location_country = None
            
            if location and isinstance(location, str) and location.strip():
                # Parse location like "Bangalore, India" or "Bangalore, IN"
                parts = [p.strip() for p in location.split(',')]
                if len(parts) >= 2:
                    location_city = parts[0]
                    location_country = parts[-1]  # Last part is usually country
                    print(f"[Worker][{source}] Parsed location: city='{location_city}', country='{location_country}'")
                elif len(parts) == 1:
                    # Could be just city or just country
                    location_city = parts[0]
                    print(f"[Worker][{source}] Single-part location: '{location_city}' (treating as city)")
            
            # Determine which location queries to make
            location_queries = []
            if location_city and location_country:
                # Priority 1: Exact location (city, country)
                location_queries.append((f"{location_city}, {location_country}", 1))
                print(f"[Worker][{source}] Added exact location query: '{location_city}, {location_country}' (priority 1)")
            if location_country:
                # Priority 2: Country only
                location_queries.append((location_country, 2))
                print(f"[Worker][{source}] Added country query: '{location_country}' (priority 2)")
            # Priority 3: Everywhere (empty string)
            location_queries.append(("", 3))
            print(f"[Worker][{source}] Added everywhere query: '' (priority 3)")
            
            # If we have a specific location but couldn't parse it, use it as-is
            if location and location.strip() and not location_queries:
                location_queries.append((location, 1))
                print(f"[Worker][{source}] Added unparsed location query: '{location}' (priority 1)")
            
            # Make SEQUENTIAL calls with different locations: city → country → everywhere
            from connectors.base import SearchQuery
            max_results_per_query = max(25, (query.max_results or 75) // max(1, len(location_queries)))
            print(f"[Worker][{source}] Making {len(location_queries)} sequential LinkedIn calls (city → country → anywhere)")

            # Get DB connection early for incremental upserts
            conn = None
            cur = None
            source_id = None
            max_retries = 2
            for db_attempt in range(max_retries):
                try:
                    conn = db_pool.getconn()
                    if not conn:
                        if db_attempt < max_retries - 1:
                            print(f"[Worker][{source}] DB connection failed (attempt {db_attempt + 1}), retrying...")
                            import time
                            time.sleep(1)
                            continue
                        return {"source": source, "status": "error", "error": "db_connection_failed"}
                    
                    cur = conn.cursor()
                    cur.execute("SELECT id FROM sources WHERE code = %s", (source,))
                    row = cur.fetchone()
                    if not row:
                        print(f"[Worker][{source}] Source not found in database")
                        cur.close()
                        if conn:
                            db_pool.putconn(conn)
                        return {"source": source, "status": "error", "error": "source_not_found"}
                    source_id = row[0]
                    print(f"[Worker][{source}] Source ID: {source_id}")
                    break
                except Exception as db_err:
                    if db_attempt < max_retries - 1:
                        print(f"[Worker][{source}] DB error (attempt {db_attempt + 1}), retrying...")
                        if cur:
                            try:
                                cur.close()
                            except:
                                pass
                        if conn:
                            try:
                                db_pool.putconn(conn)
                            except:
                                pass
                        conn = None
                        cur = None
                        import time
                        time.sleep(1)
                        continue
                    else:
                        print(f"[Worker][{source}] DB connection failed after {max_retries} attempts: {db_err}")
                        return {"source": source, "status": "error", "error": "db_connection_failed"}
            
            if not conn or not cur:
                return {"source": source, "status": "error", "error": "db_connection_failed"}
            
            # Sequential processing counts
            total_fetched = 0
            total_new = 0
            total_duplicates = 0
            seen_external_ids_global = set()
            
            # Create callback factory that captures location for per-location tracking
            def create_callback_for_location(loc: str, is_initial: bool = False):
                async def process_job_immediately(job: Any):
                    """Callback to process and insert/update a job in DB."""
                    nonlocal total_new, total_duplicates, location_counts
                    # user_id is captured from closure (from process_fetch_task)
                    try:
                        # Debug: verify user_id is available
                        if not user_id:
                            print(f"[Worker][{source}] ⚠️  WARNING: user_id is None in callback! Cannot compute scores.")
                        # Debug: check location on job object in callback
                        callback_location = getattr(job, 'location', None) if hasattr(job, 'location') else (job.get('location') if isinstance(job, dict) else None)
                        job_external_id = getattr(job, 'external_id', None) or (job.get('external_id') if isinstance(job, dict) else None)
                        if callback_location and callback_location.strip():
                            print(f"[Worker][{source}] ✅ Callback received job with location: '{callback_location}' (external_id: {job_external_id[:50] if job_external_id else 'unknown'}, job type: {type(job)})")
                            # Double-check: verify location is actually on the object
                            if hasattr(job, 'location'):
                                print(f"[Worker][{source}] ✅ Verified: job.location = '{job.location}'")
                            else:
                                print(f"[Worker][{source}] ⚠️  Job object doesn't have 'location' attribute!")
                        elif not is_initial:  # Only log if this is an enrichment callback (not initial insert)
                            print(f"[Worker][{source}] ⚠️  Callback received job WITHOUT location (external_id: {job_external_id[:50] if job_external_id else 'unknown'}, job type: {type(job)})")
                        
                        # Process single job: dedupe, score, and upsert immediately
                        # Make sure we pass the exact same job object
                        # Double-check location is still there right before passing to batch
                        final_check_loc = getattr(job, 'location', None) if hasattr(job, 'location') else (job.get('location') if isinstance(job, dict) else None)
                        if callback_location and callback_location.strip() and (not final_check_loc or not final_check_loc.strip()):
                            print(f"[Worker][{source}] ⚠️  Location lost between callback check and batch! Had: '{callback_location}', now: '{final_check_loc}'")
                        elif callback_location and callback_location.strip():
                            print(f"[Worker][{source}] ✅ Location preserved: '{final_check_loc}'")
                        
                        single_job_batch = [job]
                        # Get user_id from closure or query context
                        # user_id should be passed from the worker loop
                        batch_result = await _process_and_upsert_job_batch(
                            source, source_id, single_job_batch, query, conn, cur, seen_external_ids_global, user_id=user_id
                        )
                        # Update totals
                        total_new += batch_result['new']
                        total_duplicates += batch_result['duplicates']
                        # Update per-location counts
                        if loc not in location_counts:
                            location_counts[loc] = {'new': 0, 'duplicates': 0}
                        location_counts[loc]['new'] += batch_result['new']
                        location_counts[loc]['duplicates'] += batch_result['duplicates']
                        return batch_result
                    except Exception as e:
                        print(f"[Worker][{source}] Error in processing callback: {e}")
                        import traceback
                        traceback.print_exc()
                        return {'new': 0, 'duplicates': 0}
                return process_job_immediately
            
            # Track counts from callback per location (for immediate processing)
            location_counts = {}  # {location: {'new': int, 'duplicates': int}}

            # Sequentially process each location priority
            for loc_idx, (loc, priority) in enumerate(location_queries):
                try:
                    fetch_query = SearchQuery(
                        keywords=query.keywords,
                        location=loc,
                        max_results=max_results_per_query,
                        page=query.page,
                        page_size=query.page_size,
                        start_offset=query.start_offset if hasattr(query, 'start_offset') else None,
                        skills=getattr(query, 'skills', []) or [],
                    )
                    callback = create_callback_for_location(loc)
                    jobs_from_loc = await connector.fetch(fetch_query, since=since, on_job_ready=callback)
                    jobs_from_loc = jobs_from_loc or []
                    total_fetched += len(jobs_from_loc)
                    loc_counts = location_counts.get(loc, {'new': 0, 'duplicates': 0})
                    print(f"[Worker][{source}] Location '{loc}' (priority {priority}) processed: fetched={len(jobs_from_loc)}, new={loc_counts.get('new',0)}, dup={loc_counts.get('duplicates',0)}; totals: new={total_new}, dup={total_duplicates}")
                    # Optional: if we already inserted enough jobs, break early
                    if total_new >= query.page_size:
                        print(f"[Worker][{source}] Reached page_size ({query.page_size}) new jobs after priority {priority}; stopping sequential fetch")
                        break
                except Exception as e:
                    print(f"[Worker][{source}] Error processing location '{loc}': {e}")
                    import traceback
                    traceback.print_exc()
                    continue
            
            # Close cursor and return connection
            try:
                cur.close()
            except:
                pass
            
            # Return connection to pool
            try:
                if conn:
                    db_pool.putconn(conn)
            except:
                pass
            
            print(f"[Worker][{source}] All location queries processed (sequential): {total_fetched} fetched, {total_new} new, {total_duplicates} duplicates")
            breaker.record_success()
            
            # Return early - jobs already upserted incrementally
            return {
                "source": source,
                "status": "success",
                "fetched": total_fetched,
                "new": total_new,
                "duplicates": total_duplicates,
            }
        else:
            # For other sources, use the requested max_results
            fetch_query = query
            
            # Fetch jobs
            print(f"[Worker][{source}] Fetching jobs with keywords={fetch_query.keywords}, location={fetch_query.location}")
            try:
                raw_jobs = await connector.fetch(fetch_query, since=since)
                print(f"[Worker][{source}] Fetched {len(raw_jobs)} raw jobs")
            except Exception as fetch_error:
                print(f"[Worker][{source}] Fetch error: {fetch_error}")
                import traceback
                traceback.print_exc()
                raise
            breaker.record_success()
        
        if not raw_jobs:
            print(f"[Worker][{source}] No jobs fetched, returning")
            return {"source": source, "status": "success", "fetched": 0, "new": 0, "duplicates": 0}
        
        # Get source_id from DB (with retry on connection errors)
        conn = None
        max_retries = 2
        source_id = None
        for db_attempt in range(max_retries):
            try:
                conn = db_pool.getconn()
                if not conn:
                    if db_attempt < max_retries - 1:
                        print(f"[Worker][{source}] DB connection failed (attempt {db_attempt + 1}), retrying...")
                        import time
                        time.sleep(1)
                        continue
                    return {"source": source, "status": "error", "error": "db_connection_failed"}
                
                try:
                    # Use a single cursor for all database operations (don't use context manager)
                    cur = None
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT id FROM sources WHERE code = %s", (source,))
                        row = cur.fetchone()
                        if not row:
                            print(f"[Worker][{source}] Source not found in database")
                            cur.close()
                            if conn:
                                db_pool.putconn(conn)
                            return {"source": source, "status": "error", "error": "source_not_found"}
                        source_id = row[0]
                        print(f"[Worker][{source}] Source ID: {source_id}")
                        
                        # First, deduplicate fetched jobs by external_id (LinkedIn may return same job on multiple pages)
                        # This reduces the number of jobs we need to check against the DB
                        seen_external_ids = set()
                        deduplicated_raw_jobs = []
                        for job in raw_jobs:
                            if job.external_id and job.external_id not in seen_external_ids:
                                seen_external_ids.add(job.external_id)
                                deduplicated_raw_jobs.append(job)
                        if len(deduplicated_raw_jobs) < len(raw_jobs):
                            print(f"[Worker][{source}] Deduplicated fetched jobs: {len(raw_jobs)} -> {len(deduplicated_raw_jobs)} (removed {len(raw_jobs) - len(deduplicated_raw_jobs)} duplicates from fetch)")
                        raw_jobs = deduplicated_raw_jobs
                        
                        # Early duplicate check: filter out jobs that already exist by external_id
                        # This avoids expensive parsing/extraction for known duplicates
                        external_ids = [job.external_id for job in raw_jobs if job.external_id]
                        if external_ids:
                            print(f"[Worker][{source}] Checking {len(external_ids)} unique external_ids against DB...")
                            cur.execute(
                                "SELECT external_id FROM jobs WHERE source_id = %s AND external_id = ANY(%s)",
                                (source_id, external_ids)
                            )
                            existing_external_ids = {row[0] for row in cur.fetchall()}
                            print(f"[Worker][{source}] Found {len(existing_external_ids)} existing external_ids in DB")
                            # Also check total count in DB for this source
                            cur.execute("SELECT COUNT(*) FROM jobs WHERE source_id = %s", (source_id,))
                            total_in_db = cur.fetchone()[0]
                            print(f"[Worker][{source}] Total jobs in DB for this source: {total_in_db}")
                            if existing_external_ids:
                                before_count = len(raw_jobs)
                                raw_jobs = [job for job in raw_jobs if job.external_id not in existing_external_ids]
                                filtered_count = before_count - len(raw_jobs)
                                if filtered_count > 0:
                                    print(f"[Worker][{source}] Early filter: removed {filtered_count} jobs with existing external_ids (before dedupe)")
                                    print(f"[Worker][{source}] Remaining jobs after early filter: {len(raw_jobs)}")
                        
                        if not raw_jobs:
                            print(f"[Worker][{source}] All jobs filtered out by early duplicate check")
                            cur.close()
                            return {"source": source, "status": "success", "fetched": len(external_ids), "new": 0, "duplicates": len(external_ids)}
                        
                        # Dedupe and upsert (for remaining jobs)
                        print(f"[Worker][{source}] Deduplicating {len(raw_jobs)} jobs...")
                        try:
                            new_jobs, dup_jobs = dedupe_jobs(raw_jobs, conn, source_id)
                            print(f"[Worker][{source}] Dedupe result: {len(new_jobs)} new, {len(dup_jobs)} duplicates")
                        except Exception as dedupe_error:
                            print(f"[Worker][{source}] Dedupe error: {dedupe_error}")
                            import traceback
                            traceback.print_exc()
                            raise
                        
                        # Upsert companies
                        company_map = {}
                        for job in new_jobs:
                            company = job["company"]
                            if not company:
                                continue
                            cur.execute("SELECT id FROM companies WHERE name = %s", (company,))
                            row = cur.fetchone()
                            if row:
                                company_map[company] = row[0]
                            else:
                                cur.execute("INSERT INTO companies (name) VALUES (%s) RETURNING id", (company,))
                                new_id = cur.fetchone()[0]
                                company_map[company] = new_id
                        
                        # Convert to rows for batch upsert
                        rows = []
                        inserted_count = 0
                        if new_jobs:
                            context_keywords = query.keywords or []
                            context_skills = getattr(query, "skills", []) or []
                            context_location = query.location
                            context_experience = query.experience_level
                            context_remote = query.remote_type
                            
                            # Fetch search location aliases once (for efficiency)
                            search_location_aliases_batch = None
                            if context_location:
                                try:
                                    from utils.geonames import get_city_aliases
                                    from scoring.unified import _extract_city_from_location
                                    search_city = _extract_city_from_location(context_location.lower())
                                    if search_city:
                                        search_location_aliases_batch = {search_city} | set(get_city_aliases(search_city))
                                except Exception:
                                    pass
                            
                            context_experience = query.experience_level
                            context_remote = query.remote_type
                            scoring_error_logged = False

                            for idx, job in enumerate(new_jobs):
                                company_id = company_map.get(job["company"])
                                if idx < 3:
                                    print(f"[Worker][{source}] Job {idx} location before insert: '{job.get('location')}' (type: {type(job.get('location'))})")

                                # NOTE: Scores are computed and stored per-user in user_job_scores table
                                # after the job is inserted (see below)

                                rows.append((
                                    source_id,
                                    job["external_id"],
                                    company_id,
                                    job["company"],
                                    job["title"],
                                    job.get("normalized_title"),
                                    job.get("description"),
                                    job.get("location"),
                                    job.get("url"),
                                    job.get("posted_at"),
                                    job.get("min_salary"),
                                    job.get("max_salary"),
                                    job.get("currency"),
                                    job.get("experience_min"),
                                    job.get("experience_max"),
                                    job.get("employment_type"),
                                    job.get("remote_type"),
                                    job.get("skills", []),
                                    job["hash"],
                                    None,  # last_match_score = NULL (user-specific, computed on fetch)
                                ))

                            # Additional URL uniqueness check using normalized URLs
                            # Filter out rows with URLs that already exist (normalized comparison)
                            from pipelines.normalize import normalize_url
                            urls_to_check = [r[8] for r in rows if r[8]]  # url is at index 8
                            existing_normalized_urls = set()
                            if urls_to_check and source_id:
                                # Normalize incoming URLs
                                normalized_incoming = set()
                                for orig_url in urls_to_check:
                                    norm = normalize_url(orig_url)
                                    if norm:
                                        normalized_incoming.add(norm)
                                
                                # Fetch existing URLs from same source and normalize them for comparison
                                # This catches duplicates even if query params differ
                                cur.execute(
                                    "SELECT url FROM jobs WHERE source_id = %s AND url IS NOT NULL",
                                    (source_id,)
                                )
                                for row in cur.fetchall():
                                    if row[0]:
                                        norm_existing = normalize_url(row[0])
                                        if norm_existing and norm_existing in normalized_incoming:
                                            existing_normalized_urls.add(norm_existing)
                            
                            # Filter rows to exclude those with duplicate normalized URLs
                            filtered_rows = []
                            for r in rows:
                                url_val = r[8]  # url is at index 8
                                if url_val:
                                    norm_url = normalize_url(url_val)
                                    if norm_url and norm_url in existing_normalized_urls:
                                        continue  # Skip duplicate URL (normalized)
                                filtered_rows.append(r)
                            
                            if not filtered_rows:
                                print(f"[Worker][{source}] All {len(rows)} jobs filtered out due to duplicate URLs")
                                inserted_count = 0
                            else:
                                insert_query = (
                                    "INSERT INTO jobs ("
                                    "source_id, external_id, company_id, company, title, normalized_title, "
                                    "description, location, url, posted_at, min_salary, max_salary, "
                                    "currency, experience_min, experience_max, employment_type, "
                                    "remote_type, skills, hash, last_match_score) VALUES %s "
                                    "ON CONFLICT (source_id, external_id) DO UPDATE SET "
                                    "title = EXCLUDED.title, "
                                    "description = EXCLUDED.description, "
                                    "location = COALESCE(NULLIF(EXCLUDED.location, ''), jobs.location), "
                                    "posted_at = EXCLUDED.posted_at, "
                                    "company = COALESCE(EXCLUDED.company, jobs.company), "
                                    "company_id = COALESCE(EXCLUDED.company_id, jobs.company_id), "
                                    "scraped_at = NOW(), "
                                    "last_match_score = COALESCE(jobs.last_match_score, EXCLUDED.last_match_score)"
                                )

                                try:
                                    from psycopg2.extras import execute_values as _exec_vals
                                    chunk_size = 100
                                    for i in range(0, len(filtered_rows), chunk_size):
                                        _exec_vals(cur, insert_query, filtered_rows[i:i+chunk_size])
                                    inserted_count = len(filtered_rows)
                                    if len(filtered_rows) < len(rows):
                                        print(f"[Worker][{source}] Filtered {len(rows) - len(filtered_rows)} duplicate URLs before insert")
                                except Exception as e:
                                    print(f"[Worker] Batch upsert error: {e}")
                                    import traceback
                                    traceback.print_exc()

                            conn.commit()
                            print(f"[Worker][{source}] Upserted {inserted_count} jobs to database")
                            
                            # Compute and store scores for inserted jobs if user_id is provided
                            if user_id and inserted_count > 0:
                                try:
                                    from scoring.unified import compute_unified_score
                                    from utils.geonames import get_city_aliases
                                    from scoring.unified import _extract_city_from_location
                                    import json
                                    
                                    # Fetch search location aliases for scoring
                                    search_location_aliases_batch = None
                                    if context_location:
                                        try:
                                            search_city = _extract_city_from_location(context_location.lower())
                                            if search_city:
                                                search_location_aliases_batch = {search_city} | set(get_city_aliases(search_city))
                                        except Exception:
                                            pass
                                    
                                    # Get job_ids for inserted jobs
                                    external_ids_inserted = [job["external_id"] for job in new_jobs[:inserted_count]]
                                    if external_ids_inserted:
                                        cur.execute(
                                            "SELECT id, external_id, description, location FROM jobs WHERE source_id = %s AND external_id = ANY(%s)",
                                            (source_id, external_ids_inserted)
                                        )
                                        db_jobs = cur.fetchall()
                                        
                                        # Create a map of external_id -> job data for quick lookup
                                        job_map = {job["external_id"]: job for job in new_jobs}
                                        
                                        score_rows = []
                                        for job_id_str, external_id, job_desc, job_loc in db_jobs:
                                            if not job_desc:  # Skip jobs without description
                                                continue
                                            
                                            # Get original job data
                                            original_job = job_map.get(external_id, {})
                                            
                                            # Create job dict for scoring
                                            job_dict_for_scoring = {
                                                'title': original_job.get('title', ''),
                                                'description': job_desc,
                                                'location': job_loc,
                                                'skills': original_job.get('skills', []),
                                            }
                                            
                                            # Compute score
                                            scoring_result = compute_unified_score(
                                                job_dict_for_scoring,
                                                keywords=context_keywords,
                                                skills=context_skills,
                                                location=context_location,
                                                experience_level=context_experience,
                                                remote_preference=context_remote,
                                                search_location_aliases=search_location_aliases_batch,
                                            )
                                            match_score = scoring_result['score']
                                            match_components = scoring_result.get('components', {})
                                            match_details = scoring_result.get('details', {})

                                            # Apply user-specific location tier boost before persisting (batch)
                                            try:
                                                from ranking.rank import _city_matches_with_aliases, get_country_variants
                                                from scoring.unified import _extract_city_from_location
                                                from utils.geonames import get_city_aliases
                                                user_city = None
                                                user_country = None
                                                if context_location:
                                                    parts = [p.strip() for p in str(context_location).split(',') if p.strip()]
                                                    user_city = parts[0] if parts else None
                                                    user_country = parts[-1] if len(parts) > 1 else None
                                                job_location_raw = str(job_loc or '')
                                                location_tier = 'other'
                                                city_match = False
                                                country_match = False
                                                if user_city:
                                                    try:
                                                        aliases = {user_city.lower()} | set(get_city_aliases(user_city.lower()))
                                                    except Exception:
                                                        aliases = {user_city.lower()}
                                                    city_match = _city_matches_with_aliases(job_location_raw, user_city, aliases)
                                                if user_country:
                                                    variants = get_country_variants(user_country)
                                                    jl = job_location_raw.lower()
                                                    country_match = any(v.lower() in jl for v in variants)
                                                if city_match and country_match:
                                                    location_tier = 'exact'
                                                elif city_match:
                                                    location_tier = 'city'
                                                elif country_match:
                                                    location_tier = 'country'
                                                tier_boost = {'exact': 1.3, 'city': 1.2, 'country': 1.1, 'other': 1.0}
                                                match_score = min(1.0, match_score * tier_boost.get(location_tier, 1.0))
                                            except Exception:
                                                pass
                                            
                                            components_json = json.dumps(match_components) if match_components else None
                                            details_json = json.dumps(match_details) if match_details else None
                                            
                                            score_rows.append((
                                                user_id,
                                                str(job_id_str),  # Convert to string (jobs.id is TEXT)
                                                float(match_score),
                                                components_json,
                                                details_json
                                            ))
                                        
                                        # Bulk insert scores
                                        if score_rows:
                                            from psycopg2.extras import execute_values as _exec_vals
                                            _exec_vals(
                                                cur,
                                                """
                                                INSERT INTO user_job_scores (user_id, job_id, last_match_score, match_components, match_details)
                                                VALUES %s
                                                ON CONFLICT (user_id, job_id) 
                                                DO UPDATE SET 
                                                    last_match_score = EXCLUDED.last_match_score,
                                                    match_components = EXCLUDED.match_components,
                                                    match_details = EXCLUDED.match_details,
                                                    updated_at = now()
                                                """,
                                                score_rows,
                                                template="(%s, %s, %s, %s::jsonb, %s::jsonb)"
                                            )
                                            conn.commit()
                                            print(f"[Worker][{source}] ✅ Computed and stored {len(score_rows)} scores for batch (user_id={user_id})")
                                except Exception as score_err:
                                    print(f"[Worker][{source}] ⚠️  Batch score computation failed: {score_err}")
                                    import traceback
                                    traceback.print_exc()
                    finally:
                        # Always close cursor
                        if cur:
                            try:
                                cur.close()
                            except Exception:
                                pass
                except Exception as inner_err:
                    # Error in inner try block - rollback and re-raise
                    if conn:
                        try:
                            conn.rollback()
                        except Exception:
                            pass
                    raise
                
                # Success - break out of retry loop after returning connection
                if conn:
                    try:
                        db_pool.putconn(conn)
                    except Exception:
                        pass
                    conn = None
                break
                
            except psycopg2.OperationalError as op_err:
                # Connection errors - retry
                if conn:
                    try:
                        db_pool.putconn(conn, close=True)  # Close bad connection
                    except Exception:
                        pass
                    conn = None
                if db_attempt < max_retries - 1:
                    print(f"[Worker][{source}] DB operational error (attempt {db_attempt + 1}/{max_retries}): {op_err}")
                    import time
                    time.sleep(2 ** db_attempt)  # Exponential backoff
                    continue
                else:
                    print(f"[Worker][{source}] DB connection failed after {max_retries} attempts: {op_err}")
                    return {"source": source, "status": "error", "error": "db_connection_failed"}
            except Exception as e:
                # Other errors - rollback and return connection
                if conn:
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                    try:
                        db_pool.putconn(conn)
                    except Exception:
                        pass
                print(f"[Worker][{source}] DB error: {e}")
                import traceback
                traceback.print_exc()
                if db_attempt < max_retries - 1:
                    import time
                    time.sleep(1)
                    continue
                return {"source": source, "status": "error", "error": str(e)}
            finally:
                # Always return connection to pool if we got one and haven't returned it yet
                if conn:
                    try:
                        db_pool.putconn(conn)
                    except Exception:
                        pass
        
        return {
            "source": source,
            "status": "success",
            "fetched": len(raw_jobs),
            "new": len(new_jobs),
            "duplicates": len(dup_jobs),
        }
    except Exception as e:
        breaker.record_failure()
        print(f"[Worker][{source}] Exception in process_fetch_task: {e}")
        import traceback
        traceback.print_exc()
        return {"source": source, "status": "error", "error": str(e)}


async def worker_loop(db_pool, redis_client: redis.Redis, consumer_name: str = "worker-1"):
    """Main worker loop consuming from Redis Streams."""
    # Skip fetching if flag is set (for DB testing)
    if SKIP_FETCH:
        print(f"[Worker] ⚠️  SKIP_FETCH is enabled - worker will not process fetch tasks (DB testing mode)")
        print(f"[Worker] Set WORKER_SKIP_FETCH=0 to re-enable fetching")
        return
    print(f"[Worker] Starting worker loop, consumer: {consumer_name}, stream: {STREAM_FANOUT}, group: {STREAM_GROUP}")
    
    # Create consumer group if not exists
    try:
        redis_client.xgroup_create(STREAM_FANOUT, STREAM_GROUP, id="0", mkstream=True)
        print(f"[Worker] Consumer group '{STREAM_GROUP}' created/verified")
    except redis.exceptions.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            print(f"[Worker] Error creating consumer group: {e}")
            raise
        else:
            print(f"[Worker] Consumer group '{STREAM_GROUP}' already exists")
    
    print(f"[Worker] {consumer_name} started, waiting for messages...")
    
    while True:
        try:
            # Read from stream with BLOCK
            messages = redis_client.xreadgroup(
                STREAM_GROUP,
                consumer_name,
                {STREAM_FANOUT: ">"},
                count=1,
                block=1000,  # 1s block
            )
            
            if not messages:
                # Log every 10 seconds that we're waiting
                import time
                if not hasattr(worker_loop, '_last_wait_log'):
                    worker_loop._last_wait_log = time.time()
                elif time.time() - worker_loop._last_wait_log > 10:
                    print(f"[Worker] Waiting for messages from Redis Stream '{STREAM_FANOUT}' (group: {STREAM_GROUP}, consumer: {consumer_name})...")
                    worker_loop._last_wait_log = time.time()
                continue
            
            for stream, msgs in messages:
                for msg_id, data in msgs:
                    try:
                        # Parse message
                        payload_raw = data.get(b"payload", b"{}")
                        print(f"[Worker] Processing message {msg_id}, payload length: {len(payload_raw)}")
                        payload = json.loads(payload_raw)
                        sources = payload.get("sources", [])
                        query_dict = payload.get("query", {})
                        since_str = payload.get("since")
                        since = datetime.fromisoformat(since_str) if since_str else None
                        user_id = payload.get("user_id")  # Use the provided user_id (may be None)
                        
                        print(f"[Worker] Parsed: sources={sources}, keywords={query_dict.get('keywords', [])}, location={query_dict.get('location')}, user_id={user_id}")
                        
                        # Compute pagination hints
                        page = int(query_dict.get("page", 1) or 1)
                        page_size = int(query_dict.get("page_size", 25) or 25)
                        start_offset = int(query_dict.get("start_offset", max(0, (page - 1) * page_size)))

                        query = SearchQuery(
                            keywords=query_dict.get("keywords", []),
                            location=query_dict.get("location"),
                            experience_level=query_dict.get("experience_level"),
                            remote_type=query_dict.get("remote_type"),
                            max_results=query_dict.get("max_results", page_size),
                            page=page,
                            page_size=page_size,
                            start_offset=start_offset,
                            skills=query_dict.get("skills", []) or [],
                        )
                        
                        # Process each source concurrently
                        available_sources = [src for src in sources if src in CONNECTORS]
                        missing_sources = [src for src in sources if src not in CONNECTORS]
                        if missing_sources:
                            print(f"[Worker] Missing connectors for: {missing_sources}")
                        
                        if not available_sources:
                            print(f"[Worker] No available connectors for sources: {sources}")
                            redis_client.xack(STREAM_FANOUT, STREAM_GROUP, msg_id)
                            continue
                        
                        # Log which sources will be processed
                        print(f"[Worker] Processing {len(available_sources)} source(s): {available_sources}")
                        
                        tasks = [
                            process_fetch_task(src, query, since, db_pool, redis_client, user_id=user_id)
                            for src in available_sources
                        ]
                        results = await asyncio.gather(*tasks, return_exceptions=True)
                        
                        # Log results
                        for i, result in enumerate(results):
                            if isinstance(result, Exception):
                                print(f"[Worker] Source {available_sources[i]} exception: {result}")
                                import traceback
                                traceback.print_exc()
                            else:
                                status = result.get('status', 'unknown')
                                if status == 'error':
                                    error_msg = result.get('error', 'unknown error')
                                    print(f"[Worker] Source {result.get('source')}: ERROR - {error_msg}")
                                else:
                                    print(f"[Worker] Source {result.get('source')}: {status}, fetched={result.get('fetched', 0)}, new={result.get('new', 0)}, duplicates={result.get('duplicates', 0)}")
                        
                        # ACK message
                        redis_client.xack(STREAM_FANOUT, STREAM_GROUP, msg_id)
                        
                        print(f"[Worker] Processed {msg_id}: {len(results)} sources")
                    except Exception as e:
                        print(f"[Worker] Error processing {msg_id}: {e}")
                        import traceback
                        traceback.print_exc()
                        redis_client.xack(STREAM_FANOUT, STREAM_GROUP, msg_id)  # ACK to avoid reprocessing
        except Exception as e:
            print(f"[Worker] Loop error: {e}")
            await asyncio.sleep(5)


if __name__ == "__main__":
    db_pool = get_db_pool()
    redis_client = get_redis_client()
    if not db_pool or not redis_client:
        print("[Worker] Missing DB or Redis config")
        exit(1)
    
    asyncio.run(worker_loop(db_pool, redis_client))

