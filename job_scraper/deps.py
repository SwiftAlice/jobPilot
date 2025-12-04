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
    db_url = None
    
    # First: Check if SUPABASE_DB_URL exists and SUPABASE_DB_PASSWORD is also set
    # If both are set, combine them (password takes precedence)
    supabase_url = os.getenv("SUPABASE_DB_URL")
    db_password = os.getenv("SUPABASE_DB_PASSWORD")
    
    if supabase_url and db_password:
        # Combine SUPABASE_DB_URL with SUPABASE_DB_PASSWORD
        try:
            import urllib.parse
            parsed = urllib.parse.urlparse(supabase_url)
            user = parsed.username or "postgres"
            host = parsed.hostname
            port = parsed.port or 6543
            dbname = parsed.path.lstrip("/") or "postgres"
            # Use the password from SUPABASE_DB_PASSWORD
            db_url = f"postgresql://{user}:{db_password}@{host}:{port}/{dbname}"
            print(f"[Deps] Using SUPABASE_DB_URL + SUPABASE_DB_PASSWORD (host={host}, port={port}, db={dbname})")
        except Exception as e:
            print(f"[Deps] Error parsing SUPABASE_DB_URL: {e}")
            db_url = None
    
    # Second: If no password override, use SUPABASE_DB_URL or DATABASE_URL as-is
    if not db_url:
        db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
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
        return None

    # Ensure SSL and connect timeout (increased to 20s for reliability)
    if "?" in db_url:
        if "sslmode=" not in db_url:
            db_url += "&sslmode=require"
        if "connect_timeout=" not in db_url:
            db_url += "&connect_timeout=20"
    else:
        db_url += "?sslmode=require&connect_timeout=20"

    # Try to create pool with retry logic
    max_retries = 3
    for attempt in range(max_retries):
        try:
            pool = ThreadedConnectionPool(minconn=1, maxconn=10, dsn=db_url)
            # Test the connection
            test_conn = pool.getconn()
            try:
                with test_conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    cur.fetchone()
            finally:
                pool.putconn(test_conn)
            print(f"[Deps] DB pool created successfully (attempt {attempt + 1})")
            return pool
        except psycopg2.OperationalError as e:
            if "timeout" in str(e).lower() or "expired" in str(e).lower():
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
                    print(f"[Deps] DB connection timeout (attempt {attempt + 1}/{max_retries}), retrying in {wait_time}s...")
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
            print(f"[Deps] DB pool error: {e}")
            if attempt == max_retries - 1:
                return None
        except Exception as e:
            print(f"[Deps] DB pool error: {e}")
            if attempt == max_retries - 1:
                return None
            import time
            time.sleep(1)
    
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

