"""
Dependencies and configuration.
"""
import os
import psycopg2
import redis
from psycopg2.pool import ThreadedConnectionPool
from typing import Optional

# Load environment variables from .env if present
try:
    from dotenv import load_dotenv
    # Load from project root or current directory
    load_dotenv()  # falls back to searching up the tree
except Exception:
    pass


# Supabase/Postgres connection
def get_db_pool() -> Optional[ThreadedConnectionPool]:
    """Create PostgreSQL connection pool.

    Expected envs (prefer in this order):
      - SUPABASE_DB_URL (full Postgres URI with password)
      - SUPABASE_DB_URL (Postgres URI without password) + SUPABASE_DB_PASSWORD
      - PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT
      - DATABASE_URL (full Postgres URI)
    """
    # Debug: Check which env vars are present (without showing sensitive values)
    supabase_url = os.getenv("SUPABASE_DB_URL")
    db_password = os.getenv("SUPABASE_DB_PASSWORD")
    database_url = os.getenv("DATABASE_URL")
    
    print(f"[Deps] Env check - SUPABASE_DB_URL present: {bool(supabase_url)}, "
          f"SUPABASE_DB_PASSWORD present: {bool(db_password)}, "
          f"DATABASE_URL present: {bool(database_url)}")
    
    if supabase_url:
        # Show first 50 chars of URL (before password) for debugging
        safe_url = supabase_url.split('@')[0] if '@' in supabase_url else supabase_url[:50]
        print(f"[Deps] SUPABASE_DB_URL starts with: {safe_url}...")
    
    db_url = None
    
    # First: Check if SUPABASE_DB_URL exists and SUPABASE_DB_PASSWORD is also set
    # If both are set, combine them (password takes precedence)
    if supabase_url and db_password:
        # Combine SUPABASE_DB_URL with SUPABASE_DB_PASSWORD
        try:
            import urllib.parse
            parsed = urllib.parse.urlparse(supabase_url)
            user = parsed.username or "postgres"
            # URL-encode user and password to handle special characters
            user_encoded = urllib.parse.quote(user, safe='')
            password_encoded = urllib.parse.quote(db_password, safe='')
            host = parsed.hostname
            port = parsed.port or 6543
            dbname = parsed.path.lstrip("/") or "postgres"
            # Use the password from SUPABASE_DB_PASSWORD (URL-encoded)
            db_url = f"postgresql://{user_encoded}:{password_encoded}@{host}:{port}/{dbname}"
            print(f"[Deps] Using SUPABASE_DB_URL + SUPABASE_DB_PASSWORD (host={host}, port={port}, db={dbname}, user={user})")
        except Exception as e:
            print(f"[Deps] Error parsing SUPABASE_DB_URL: {e}")
            import traceback
            print(f"[Deps] Traceback: {traceback.format_exc()}")
            db_url = None
    
    # Second: If no password override, use SUPABASE_DB_URL or DATABASE_URL as-is
    if not db_url:
        db_url = supabase_url or database_url
        if db_url:
            print(f"[Deps] Using SUPABASE_DB_URL or DATABASE_URL as-is")
    
    # Third: Fallback to discrete PG envs
    if not db_url:
        host = os.getenv("PGHOST")
        user = os.getenv("PGUSER") or "postgres"
        password = os.getenv("PGPASSWORD")
        dbname = os.getenv("PGDATABASE") or "postgres"
        port = int(os.getenv("PGPORT", "6543"))
        if host and password:
            db_url = f"postgresql://{user}:{password}@{host}:{port}/{dbname}"
            print(f"[Deps] Using discrete PG env vars (host={host}, port={port})")
    
    if not db_url:
        print("[Deps] No database configuration found. Check SUPABASE_DB_URL, SUPABASE_DB_PASSWORD, or PG* env vars.")
        print(f"[Deps] Available env vars with 'DB' or 'PG': {[k for k in os.environ.keys() if 'DB' in k or 'PG' in k]}")
        return None

    # Ensure SSL and connect timeout (increased to 20s for reliability)
    if "?" in db_url:
        if "sslmode=" not in db_url:
            db_url += "&sslmode=require"
        if "connect_timeout=" not in db_url:
            db_url += "&connect_timeout=20"
    else:
        db_url += "?sslmode=require&connect_timeout=20"

    # Show safe version of URL (without password) for debugging
    safe_url_debug = db_url.split('@')[0] + '@***' if '@' in db_url else db_url[:50] + '...'
    print(f"[Deps] Attempting connection with URL: {safe_url_debug}")

    # Try to create pool with retry logic
    max_retries = 3
    for attempt in range(max_retries):
        try:
            print(f"[Deps] Creating connection pool (attempt {attempt + 1}/{max_retries})...")
            pool = ThreadedConnectionPool(minconn=1, maxconn=10, dsn=db_url)
            # Test the connection
            print(f"[Deps] Testing connection...")
            test_conn = pool.getconn()
            try:
                with test_conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    cur.fetchone()
                print(f"[Deps] Connection test successful!")
            finally:
                pool.putconn(test_conn)
            print(f"[Deps] DB pool created successfully (attempt {attempt + 1})")
            return pool
        except psycopg2.OperationalError as e:
            error_msg = str(e)
            print(f"[Deps] DB OperationalError (attempt {attempt + 1}/{max_retries}): {error_msg}")
            if "timeout" in error_msg.lower() or "expired" in error_msg.lower():
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
                    print(f"[Deps] DB connection timeout, retrying in {wait_time}s...")
                    import time
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"[Deps] DB pool error after {max_retries} attempts: {e}")
                    # Try direct connection (port 5432) as fallback if pooler fails
                    if "pooler" in db_url or ":6543" in db_url:
                        print("[Deps] Attempting direct connection (port 5432) as fallback...")
                        try:
                            direct_url = db_url.replace(":6543", ":5432").replace("pooler", "db")
                            pool = ThreadedConnectionPool(minconn=1, maxconn=10, dsn=direct_url)
                            test_conn = pool.getconn()
                            try:
                                with test_conn.cursor() as cur:
                                    cur.execute("SELECT 1")
                                    cur.fetchone()
                            finally:
                                pool.putconn(test_conn)
                            print("[Deps] Direct connection successful!")
                            return pool
                        except Exception as direct_err:
                            print(f"[Deps] Direct connection also failed: {direct_err}")
                            import traceback
                            print(f"[Deps] Direct connection traceback: {traceback.format_exc()}")
            print(f"[Deps] DB pool error: {e}")
            if attempt == max_retries - 1:
                import traceback
                print(f"[Deps] Final error traceback: {traceback.format_exc()}")
                return None
        except Exception as e:
            error_msg = str(e)
            error_type = type(e).__name__
            print(f"[Deps] DB pool error ({error_type}): {error_msg}")
            if attempt == max_retries - 1:
                import traceback
                print(f"[Deps] Final error traceback: {traceback.format_exc()}")
                return None
            import time
            time.sleep(1)
    
    print("[Deps] Failed to create DB pool after all retries")
    return None


# Redis connection
def get_redis_client() -> Optional[redis.Redis]:
    """Create Redis client (TLS-friendly, with timeouts)."""
    url = os.getenv("REDIS_URL")
    if not url:
        return None
    try:
        kwargs = {
            "decode_responses": False,
            "socket_timeout": 15,
            "socket_connect_timeout": 15,
            "health_check_interval": 25,
            "retry_on_timeout": True,
        }
        # NOTE: For TLS, simply use the rediss:// scheme. Avoid passing unsupported ssl kwargs on older redis-py.
        client = redis.from_url(url, **kwargs)
        # Proactive ping
        client.ping()
        return client
    except Exception as e:
        print(f"[Deps] Redis error: {e}")
        return None


# Stream names
STREAM_FANOUT = "jobs:fanout"
STREAM_GROUP = "aggregators"

