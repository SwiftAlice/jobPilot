"""
Scheduler that enqueues periodic refresh tasks to Redis Streams.
"""
import asyncio
import json
import time
from datetime import datetime, timedelta
import redis
from deps import get_redis_client, STREAM_FANOUT


async def scheduler_loop(redis_client: redis.Redis):
    """Scheduler loop that enqueues refresh tasks."""
    # Per-source refresh cadence (seconds)
    cadences = {
        "adzuna": 300,  # 5 min
        "jooble": 300,
        "remoteok": 600,  # 10 min
        "linkedin": 300,
        "iimjobs": 600,
    }
    
    last_enqueued = {}
    
    print("[Scheduler] Started")
    
    while True:
        try:
            now = time.time()
            for source, cadence in cadences.items():
                last = last_enqueued.get(source, 0)
                if now - last >= cadence:
                    # Get last seen timestamp
                    last_seen_key = f"source:last_seen:{source}"
                    last_seen_bytes = redis_client.get(last_seen_key)
                    since = None
                    if last_seen_bytes:
                        try:
                            since = datetime.fromisoformat(last_seen_bytes.decode())
                        except:
                            pass
                    
                    # Enqueue refresh task
                    payload = {
                        "sources": [source],
                        "query": {
                            "keywords": [],  # Will be filled by search queries
                            "max_results": 50,
                        },
                        "since": since.isoformat() if since else None,
                    }
                    
                    redis_client.xadd(STREAM_FANOUT, {"payload": json.dumps(payload)})
                    last_enqueued[source] = now
                    print(f"[Scheduler] Enqueued refresh for {source}")
            
            await asyncio.sleep(60)  # Check every minute
        except Exception as e:
            print(f"[Scheduler] Error: {e}")
            await asyncio.sleep(60)


if __name__ == "__main__":
    redis_client = get_redis_client()
    if not redis_client:
        print("[Scheduler] Missing Redis config")
        exit(1)
    
    asyncio.run(scheduler_loop(redis_client))

