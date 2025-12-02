"""
Utility to enqueue search queries to Redis Streams.
"""
import json
import redis
import hashlib
from typing import Dict, Any, List, Optional
from deps import get_redis_client, STREAM_FANOUT


def enqueue_search_query(
    keywords: List[str],
    location: Optional[str] = None,
    sources: Optional[List[str]] = None,
    experience_level: Optional[str] = None,
    remote_type: Optional[str] = None,
    skills: Optional[List[str]] = None,
    max_results: int = 20,
    page: int = 1,
    page_size: int = 25,
    user_id: Optional[str] = None,  # User ID for user-specific scoring
) -> str:
    """
    Enqueue a search query to Redis Streams for async processing.
    
    Returns:
        Message ID
    """
    redis_client = get_redis_client()
    if not redis_client:
        raise ValueError("Redis not configured")
    
    sources = sources or ["remoteok"]
    
    payload = {
        "sources": sources,
        "query": {
            "keywords": keywords,
            "location": location,
            "experience_level": experience_level,
            "remote_type": remote_type,
            "max_results": max_results,
            "page": page,
            "page_size": page_size,
            "start_offset": max(0, (page - 1) * page_size),
            "skills": skills or [],
        },
        "user_id": user_id,  # User ID for user-specific scoring
        "since": None,  # Full refresh for search queries
    }
    
    print(f"[Enqueue] Enqueuing fetch task: sources={sources}, keywords={keywords}, location={location}")
    msg_id = redis_client.xadd(STREAM_FANOUT, {"payload": json.dumps(payload)})
    msg_id_str = msg_id.decode() if isinstance(msg_id, bytes) else msg_id
    print(f"[Enqueue] Enqueued message ID: {msg_id_str}")
    return msg_id_str


def get_cache_key(keywords: List[str], location: Optional[str] = None, **kwargs) -> str:
    """Generate cache key for search query."""
    key_parts = [",".join(sorted(keywords)), location or "", json.dumps(kwargs, sort_keys=True)]
    key_str = "|".join(key_parts)
    return hashlib.md5(key_str.encode()).hexdigest()

