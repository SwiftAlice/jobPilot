#!/usr/bin/env python3
"""
Backfill script to fetch and update missing job locations and descriptions from the database.
This script will:
1. Find all jobs with NULL or empty location/description
2. For LinkedIn jobs, fetch location and description from job detail pages
3. Update the database with fetched data
"""
import asyncio
import sys
import os
from typing import List, Dict, Any, Optional
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from deps import get_db_pool
from connectors.linkedin import LinkedInConnector


async def backfill_linkedin_locations(
    limit: Optional[int] = None,
    batch_size: int = 25,
    dry_run: bool = False,
    backfill_descriptions: bool = True,
) -> Dict[str, Any]:
    """
    Backfill missing locations and descriptions for LinkedIn jobs.
    
    Args:
        limit: Maximum number of jobs to process (None = all)
        batch_size: Number of jobs to process in parallel
        dry_run: If True, don't update database, just show what would be updated
        backfill_descriptions: If True, also backfill missing descriptions
    
    Returns:
        Dictionary with statistics about the backfill operation
    """
    stats = {
        'total_found': 0,
        'processed': 0,
        'locations_updated': 0,
        'descriptions_updated': 0,
        'failed': 0,
        'skipped': 0,
    }
    
    db_pool = get_db_pool()
    if not db_pool:
        print("[Backfill] ❌ Failed to get database pool")
        return stats
    
    conn = None
    try:
        conn = db_pool.getconn()
        if not conn:
            print("[Backfill] ❌ Failed to get database connection")
            return stats
        
        # Get LinkedIn source ID
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM sources WHERE code = 'linkedin'")
            row = cur.fetchone()
            if not row:
                print("[Backfill] ❌ LinkedIn source not found in database")
                return stats
            linkedin_source_id = row[0]
        
        # Find jobs with missing locations or descriptions
        with conn.cursor() as cur:
            # Build query to find jobs missing location or description
            conditions = []
            if backfill_descriptions:
                conditions.append("(description IS NULL OR description = '' OR description = 'N/A')")
            conditions.append("(location IS NULL OR location = '' OR location = 'N/A')")
            
            where_clause = " OR ".join(conditions)
            
            query = f"""
                SELECT external_id, url, location, description
                FROM jobs
                WHERE source_id = %s
                AND ({where_clause})
                AND url IS NOT NULL
                AND url != ''
                AND external_id IS NOT NULL
                AND external_id != ''
                ORDER BY scraped_at DESC
            """
            if limit:
                query += f" LIMIT {limit}"
            
            cur.execute(query, (linkedin_source_id,))
            rows = cur.fetchall()
            stats['total_found'] = len(rows)
            
            if stats['total_found'] == 0:
                print("[Backfill] ✅ No jobs with missing locations/descriptions found")
                return stats
            
            missing_desc = sum(1 for r in rows if not r[3] or not r[3].strip() or r[3] == 'N/A')
            missing_loc = sum(1 for r in rows if not r[2] or not r[2].strip() or r[2] == 'N/A')
            print(f"[Backfill] Found {stats['total_found']} LinkedIn jobs needing updates:")
            print(f"[Backfill]   - Missing locations: {missing_loc}")
            if backfill_descriptions:
                print(f"[Backfill]   - Missing descriptions: {missing_desc}")
            if dry_run:
                print("[Backfill] 🔍 DRY RUN MODE - No database updates will be made")
            
            # Process jobs in batches
            connector = LinkedInConnector()
            updates = []
            
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i + batch_size]
                batch_num = i // batch_size + 1
                total_batches = (len(rows) + batch_size - 1) // batch_size
                print(f"\n[Backfill] Processing batch {batch_num}/{total_batches} ({len(batch)} jobs)...")
                
                # Fetch locations and descriptions in parallel
                tasks = []
                for row in batch:
                    external_id, url, current_location, current_description = row
                    if not url or not external_id:
                        stats['skipped'] += 1
                        stats['processed'] += 1
                        continue
                    tasks.append((external_id, url, current_location, current_description, connector._fetch_detail_and_location_http_async(url)))
                
                # Wait for all fetches to complete
                for external_id, url, current_location, current_description, task in tasks:
                    stats['processed'] += 1
                    try:
                        detail = await task
                        location = detail.get('location')
                        description = detail.get('description_html')
                        
                        has_updates = False
                        update_location = None
                        update_description = None
                        
                        # Check if location needs updating
                        if location and location.strip() and location != 'N/A':
                            if not current_location or current_location.strip() == '' or current_location == 'N/A':
                                update_location = location
                                has_updates = True
                        
                        # Check if description needs updating
                        if backfill_descriptions and description and description.strip():
                            # Update if missing or if new one is longer (more complete)
                            if not current_description or not current_description.strip() or current_description == 'N/A':
                                update_description = description
                                has_updates = True
                            elif len(description.strip()) > len(current_description.strip()):
                                # New description is longer, prefer it
                                update_description = description
                                has_updates = True
                        
                        if has_updates:
                            updates.append((external_id, update_location, update_description))
                            updates_str = []
                            if update_location:
                                updates_str.append(f"location='{update_location}'")
                                stats['locations_updated'] += 1
                            if update_description:
                                updates_str.append(f"description ({len(update_description)} chars)")
                                stats['descriptions_updated'] += 1
                            print(f"[Backfill] ✅ Job {external_id[:40] if external_id else 'N/A'}...): {', '.join(updates_str)}")
                        else:
                            stats['skipped'] += 1
                            print(f"[Backfill] ⏭️  Job {external_id[:40] if external_id else 'N/A'}...): No updates needed")
                    except Exception as e:
                        stats['failed'] += 1
                        print(f"[Backfill] ❌ Job {external_id[:40] if external_id else 'N/A'}...): Error - {e}")
                
                # Update database with fetched locations and descriptions
                if updates and not dry_run:
                    from psycopg2.extras import execute_values
                    with conn.cursor() as update_cur:
                        # Create temporary table (using external_id only, not job_id)
                        update_cur.execute("""
                            CREATE TEMPORARY TABLE IF NOT EXISTS temp_location_updates (
                                external_id TEXT,
                                location TEXT,
                                description TEXT
                            ) ON COMMIT DROP
                        """)
                        
                        # Insert updates
                        execute_values(
                            update_cur,
                            "INSERT INTO temp_location_updates (external_id, location, description) VALUES %s",
                            updates
                        )
                        
                        # Update jobs using external_id (which is unique per source)
                        # Prefer longer descriptions if both exist
                        update_cur.execute("""
                            UPDATE jobs j
                            SET 
                                location = COALESCE(NULLIF(t.location, ''), j.location),
                                description = CASE 
                                    WHEN t.description IS NOT NULL AND t.description != '' 
                                         AND (j.description IS NULL OR j.description = '' OR LENGTH(t.description) > LENGTH(j.description))
                                    THEN t.description
                                    ELSE COALESCE(NULLIF(j.description, ''), t.description)
                                END
                            FROM temp_location_updates t
                            WHERE j.source_id = %s AND j.external_id = t.external_id
                        """, (linkedin_source_id,))
                        
                        batch_updated = update_cur.rowcount
                        print(f"[Backfill] ✅ Updated {batch_updated} jobs in database")
                        
                        conn.commit()
                        updates = []  # Clear for next batch
                
                # Progress update
                print(f"[Backfill] Progress: {stats['processed']}/{stats['total_found']} processed, {stats['locations_updated']} locations, {stats['descriptions_updated']} descriptions, {stats['failed']} failed, {stats['skipped']} skipped")
        
        print(f"\n[Backfill] ========================================")
        print(f"[Backfill] Summary:")
        print(f"[Backfill]   Total found: {stats['total_found']}")
        print(f"[Backfill]   Processed: {stats['processed']}")
        print(f"[Backfill]   Locations updated: {stats['locations_updated']}")
        if backfill_descriptions:
            print(f"[Backfill]   Descriptions updated: {stats['descriptions_updated']}")
        print(f"[Backfill]   Failed: {stats['failed']}")
        print(f"[Backfill]   Skipped: {stats['skipped']}")
        print(f"[Backfill] ========================================")
        
    except Exception as e:
        print(f"[Backfill] ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
    finally:
        if conn:
            db_pool.putconn(conn)
    
    return stats


async def backfill_all_sources(limit: Optional[int] = None, dry_run: bool = False, backfill_descriptions: bool = True):
    """
    Backfill locations and descriptions for all job sources.
    Currently only LinkedIn is supported.
    """
    print("[Backfill] Starting location/description backfill for all sources...")
    print(f"[Backfill] Limit: {limit or 'unlimited'}")
    print(f"[Backfill] Dry run: {dry_run}")
    print(f"[Backfill] Backfill descriptions: {backfill_descriptions}")
    print()
    
    # LinkedIn
    linkedin_stats = await backfill_linkedin_locations(limit=limit, dry_run=dry_run, backfill_descriptions=backfill_descriptions)
    
    # Add other sources here as needed
    # For now, only LinkedIn has location/description fetching capability
    
    return {
        'linkedin': linkedin_stats,
    }


def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Backfill missing job locations')
    parser.add_argument('--limit', type=int, help='Maximum number of jobs to process (default: all)')
    parser.add_argument('--batch-size', type=int, default=25, help='Number of jobs to process in parallel (default: 25)')
    parser.add_argument('--dry-run', action='store_true', help='Dry run mode (no database updates)')
    parser.add_argument('--source', type=str, choices=['linkedin', 'all'], default='all', help='Source to backfill (default: all)')
    parser.add_argument('--no-descriptions', action='store_true', help='Skip description backfill (only update locations)')
    
    args = parser.parse_args()
    
    backfill_descriptions = not args.no_descriptions
    
    if args.source == 'linkedin':
        stats = asyncio.run(backfill_linkedin_locations(
            limit=args.limit,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
            backfill_descriptions=backfill_descriptions
        ))
    else:
        stats = asyncio.run(backfill_all_sources(
            limit=args.limit,
            dry_run=args.dry_run,
            backfill_descriptions=backfill_descriptions
        ))
    
    if args.dry_run:
        print("\n[Backfill] 🔍 This was a dry run. Use without --dry-run to actually update the database.")


if __name__ == '__main__':
    main()

