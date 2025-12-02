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
      - SUPABASE_DB_URL (full Postgres URI)
      - PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT
      - SUPABASE_DB_URL (Postgres URI) + SUPABASE_DB_PASSWORD (NOT service role key)
    """
    # Preferred: full DB URL
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    # Fallback: discrete PG envs
    if not db_url:
        host = os.getenv("PGHOST")
        user = os.getenv("PGUSER") or "postgres"
        password = os.getenv("PGPASSWORD")
        dbname = os.getenv("PGDATABASE") or "postgres"
        port = int(os.getenv("PGPORT", "6543"))
        if host and password:
            db_url = f"postgresql://{user}:{password}@{host}:{port}/{dbname}"
    # Legacy fallback: Supabase Postgres URL + explicit DB password
    if not db_url:
        SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")  # should be a Postgres URI
        db_password = os.getenv("SUPABASE_DB_PASSWORD")
        if SUPABASE_DB_URL and db_password:
            try:
                import urllib.parse
                parsed = urllib.parse.urlparse(SUPABASE_DB_URL)
                user = parsed.username or "postgres"
                host = parsed.hostname
                port = parsed.port or 6543
                dbname = parsed.path.lstrip("/") or "postgres"
                db_url = f"postgresql://{user}:{db_password}@{host}:{port}/{dbname}"
            except Exception:
                pass
    if not db_url:
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

