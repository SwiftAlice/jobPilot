"""
Job deduplication logic (hash-based, rule-based, optional fuzzy).
"""
from typing import List, Dict, Any, Tuple
import psycopg2
from psycopg2.extras import execute_values
from pipelines.normalize import canonicalize_job, compute_content_hash
from connectors.base import RawJob


def dedupe_jobs(
    raw_jobs: List[RawJob],
    db_conn,
    source_id: int,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Deduplicate jobs against existing database.
    
    Returns:
        (new_jobs, duplicate_jobs) - both as canonical dicts ready for upsert
    """
    canonical = [canonicalize_job(raw) for raw in raw_jobs]
    new_jobs: List[Dict[str, Any]] = []
    duplicate_jobs: List[Dict[str, Any]] = []
    
    with db_conn.cursor() as cur:
        # Fast check: same (source_id, external_id)
        external_ids = [c["external_id"] for c in canonical]
        cur.execute(
            "SELECT external_id FROM jobs WHERE source_id = %s AND external_id = ANY(%s)",
            (source_id, external_ids),
        )
        existing_external_ids = {row[0] for row in cur.fetchall()}
        
        # URL check: normalize URLs and check for duplicates
        from pipelines.normalize import normalize_url
        normalized_urls_map = {}  # normalized -> original
        for c in canonical:
            orig_url = c.get("url")
            if orig_url:
                norm_url = normalize_url(orig_url)
                if norm_url:
                    normalized_urls_map[norm_url] = orig_url
        
        existing_normalized_urls = set()
        if normalized_urls_map:
            # Fetch existing URLs from same source and normalize them for comparison
            # This is more efficient than fetching all URLs
            cur.execute(
                "SELECT url FROM jobs WHERE source_id = %s AND url IS NOT NULL",
                (source_id,)
            )
            for row in cur.fetchall():
                if row[0]:
                    norm_existing = normalize_url(row[0])
                    if norm_existing and norm_existing in normalized_urls_map:
                        existing_normalized_urls.add(norm_existing)
        
        # Hash check: exact content match
        hashes = [c["hash"] for c in canonical]
        cur.execute(
            "SELECT encode(hash, 'hex') FROM jobs WHERE hash = ANY(%s)",
            (hashes,),
        )
        existing_hashes = {row[0] for row in cur.fetchall()}
        
        # Rule-based: same (normalized_company, normalized_title, location) within ±14 days
        for c in canonical:
            if c["external_id"] in existing_external_ids:
                duplicate_jobs.append(c)
                continue
            
            # Check URL uniqueness using normalized URLs
            orig_url = c.get("url")
            if orig_url:
                norm_url = normalize_url(orig_url)
                if norm_url and norm_url in existing_normalized_urls:
                    duplicate_jobs.append(c)
                    continue
            
            hash_hex = c["hash"].hex() if isinstance(c["hash"], bytes) else c["hash"]
            if hash_hex in existing_hashes:
                duplicate_jobs.append(c)
                continue
            
            # Rule-based check: same (normalized_company, normalized_title, location)
            # Only check date range if posted_at is available
            posted_at = c.get("posted_at")
            if posted_at:
                # Check with date range (±14 days)
                cur.execute(
                    """
                    SELECT id FROM jobs
                    WHERE company_id IN (SELECT id FROM companies WHERE name = %s)
                    AND normalized_title = %s
                    AND location = %s
                    AND posted_at IS NOT NULL
                    AND posted_at >= %s - INTERVAL '14 days'
                    AND posted_at <= %s + INTERVAL '14 days'
                    LIMIT 1
                    """,
                    (
                        c["company"],
                        c.get("normalized_title"),
                        c["location"],
                        posted_at,
                        posted_at,
                    ),
                )
            else:
                # Check without date range (just company, title, location)
                cur.execute(
                    """
                    SELECT id FROM jobs
                    WHERE company_id IN (SELECT id FROM companies WHERE name = %s)
                    AND normalized_title = %s
                    AND location = %s
                    LIMIT 1
                    """,
                    (
                        c["company"],
                        c.get("normalized_title"),
                        c["location"],
                    ),
                )
            if cur.fetchone():
                duplicate_jobs.append(c)
                continue
            
            new_jobs.append(c)
    
    return new_jobs, duplicate_jobs


def fuzzy_dedupe_jobs(
    new_jobs: List[Dict[str, Any]],
    db_conn,
    similarity_threshold: float = 0.8,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Optional fuzzy deduplication using pg_trgm.
    Separates definitely new vs. probable duplicates.
    """
    if not new_jobs:
        return new_jobs, []
    
    definitely_new = []
    probable_dupes = []
    
    with db_conn.cursor() as cur:
        for job in new_jobs:
            title = job.get("normalized_title") or job.get("title", "")
            if not title:
                definitely_new.append(job)
                continue
            
            cur.execute(
                """
                SELECT id, similarity(title, %s) as sim
                FROM jobs
                WHERE similarity(title, %s) >= %s
                ORDER BY sim DESC
                LIMIT 1
                """,
                (title, title, similarity_threshold),
            )
            row = cur.fetchone()
            if row:
                probable_dupes.append(job)
            else:
                definitely_new.append(job)
    
    return definitely_new, probable_dupes

