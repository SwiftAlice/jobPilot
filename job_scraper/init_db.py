#!/usr/bin/env python3
"""
Initialize the database schema for the new job aggregator architecture.
Run this script once to set up all required tables and indexes.
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from deps import get_db_pool

def init_database():
    """Run all SQL migration files to initialize the database."""
    db_pool = get_db_pool()
    if not db_pool:
        print("❌ Error: Database not configured. Please set SUPABASE_DB_URL or PG* environment variables.")
        sys.exit(1)
    
    sql_dir = Path(__file__).parent / "sql"
    # Run migrations in order: init, indexes, then any migration scripts
    migration_files = sorted(sql_dir.glob("*.sql"))
    
    if not migration_files:
        print(f"❌ Error: No SQL migration files found in {sql_dir}")
        sys.exit(1)
    
    print(f"📦 Found {len(migration_files)} migration file(s)")
    
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            for migration_file in migration_files:
                print(f"\n📄 Running {migration_file.name}...")
                with open(migration_file, 'r') as f:
                    sql = f.read()
                    
                    # Split SQL into individual statements
                    # Handle dollar-quoted strings properly (DO $$ ... END $$;)
                    statements = []
                    current = []
                    in_dollar_quote = False
                    dollar_delimiter = None  # Will be '$$' or '$tag$'
                    
                    lines = sql.split('\n')
                    i = 0
                    while i < len(lines):
                        line = lines[i]
                        line_stripped = line.strip()
                        
                        # Skip empty lines and full-line comments (but not inline comments within DO blocks)
                        if not line_stripped:
                            if current or in_dollar_quote:
                                current.append('')
                            i += 1
                            continue
                        if line_stripped.startswith('--') and not in_dollar_quote:
                            i += 1
                            continue
                        
                        current.append(line)
                        
                        # Check for dollar-quoted string boundaries
                        # Dollar quotes can appear in: DO $$ ... END $$; or FUNCTION ... AS $$ ... $$ LANGUAGE
                        if not in_dollar_quote:
                            # Look for start of dollar quote: $$ or $tag$ (can be after DO, AS, etc.)
                            if '$$' in line:
                                dollar_delimiter = '$$'
                                in_dollar_quote = True
                            elif '$' in line:
                                # Might be tagged quote like $tag$
                                import re
                                # Look for pattern $tag$ where tag doesn't contain $
                                tag_match = re.search(r'\$([^$\s]+)\$', line)
                                if tag_match:
                                    dollar_delimiter = f'${tag_match.group(1)}$'
                                    in_dollar_quote = True
                        else:
                            # We're inside a dollar quote, look for the closing delimiter
                            if dollar_delimiter and dollar_delimiter in line:
                                # Found closing delimiter
                                in_dollar_quote = False
                                dollar_delimiter = None
                        
                        # If line ends with semicolon and we're not in a dollar quote, it's end of statement
                        if line.rstrip().endswith(';') and not in_dollar_quote:
                            stmt = '\n'.join(current).strip()
                            if stmt:
                                statements.append(stmt)
                            current = []
                        
                        i += 1
                    
                    # Add any remaining statement
                    if current:
                        stmt = '\n'.join(current).strip()
                        if stmt:
                            statements.append(stmt)
                    
                    # Execute each statement
                    executed = 0
                    for i, stmt in enumerate(statements, 1):
                        try:
                            cur.execute(stmt)
                            executed += 1
                        except Exception as e:
                            error_msg = str(e).lower()
                            # Skip if already exists (CREATE IF NOT EXISTS should handle this, but indexes might fail)
                            if any(phrase in error_msg for phrase in [
                                "already exists", "duplicate key", "relation .* already exists"
                            ]):
                                print(f"  ⚠️  Statement {i} skipped (already exists)")
                            else:
                                # For other errors, show but continue if it's a non-critical error
                                if "does not exist" in error_msg and ("index" in error_msg or "constraint" in error_msg):
                                    print(f"  ⚠️  Statement {i} skipped (dependency not ready): {error_msg.split('.')[0]}")
                                else:
                                    print(f"  ❌ Statement {i} failed: {stmt[:80]}...")
                                    print(f"     Error: {e}")
                                    # Don't raise - try to continue with other statements
                    
                    conn.commit()
                    print(f"  ✅ {migration_file.name} completed ({executed}/{len(statements)} statements executed)")
        
        print("\n✅ Database initialization complete!")
        print("\n📊 Verifying tables...")
        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_type = 'BASE TABLE'
                ORDER BY table_name
            """)
            tables = [row[0] for row in cur.fetchall()]
            print(f"   Found {len(tables)} tables: {', '.join(tables)}")
            
            # Check sources
            cur.execute("SELECT code, display_name FROM sources ORDER BY code")
            sources = cur.fetchall()
            print(f"\n📋 Sources configured: {len(sources)}")
            for code, name in sources:
                print(f"   • {code}: {name}")
        
    except Exception as e:
        print(f"\n❌ Error initializing database: {e}")
        import traceback
        traceback.print_exc()
        conn.rollback()
        sys.exit(1)
    finally:
        db_pool.putconn(conn)

if __name__ == "__main__":
    print("🚀 Initializing database schema...")
    init_database()

