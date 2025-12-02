"""
Rate limiting utilities using Redis token bucket.
"""
import time
import redis
from typing import Optional


class TokenBucket:
    """Token bucket rate limiter."""
    
    def __init__(self, redis_client: redis.Redis, key: str, rate: int, capacity: int):
        """
        Args:
            redis_client: Redis client
            key: Redis key prefix
            rate: Tokens per second
            capacity: Max tokens
        """
        self.redis = redis_client
        self.key = key
        self.rate = rate
        self.capacity = capacity
    
    def acquire(self, tokens: int = 1) -> bool:
        """Try to acquire tokens. Returns True if successful."""
        now = time.time()
        key = f"ratelimit:{self.key}"
        
        # Lua script for atomic token bucket
        script = """
        local key = KEYS[1]
        local rate = tonumber(ARGV[1])
        local capacity = tonumber(ARGV[2])
        local tokens = tonumber(ARGV[3])
        local now = tonumber(ARGV[4])
        
        local bucket = redis.call('HMGET', key, 'tokens', 'last_update')
        local current_tokens = tonumber(bucket[1]) or capacity
        local last_update = tonumber(bucket[2]) or now
        
        -- Add tokens based on elapsed time
        local elapsed = now - last_update
        current_tokens = math.min(capacity, current_tokens + (elapsed * rate))
        
        if current_tokens >= tokens then
            current_tokens = current_tokens - tokens
            redis.call('HMSET', key, 'tokens', current_tokens, 'last_update', now)
            redis.call('EXPIRE', key, 3600)
            return 1
        else
            redis.call('HSET', key, 'last_update', now)
            redis.call('EXPIRE', key, 3600)
            return 0
        end
        """
        
        result = self.redis.eval(
            script,
            1,
            key,
            self.rate,
            self.capacity,
            tokens,
            now,
        )
        return bool(result)


def get_rate_limiter(redis_client: redis.Redis, source: str) -> TokenBucket:
    """Get rate limiter for a source."""
    # Rate limits per source (requests per minute)
    limits = {
        "adzuna": (10, 20),  # 10 req/min, capacity 20
        "jooble": (10, 20),
        "remoteok": (5, 10),
        "linkedin": (5, 10),  # HTTP-first, can be faster
        "iimjobs": (2, 5),  # Playwright, slower
    }
    rate, capacity = limits.get(source, (5, 10))
    return TokenBucket(redis_client, f"source:{source}", rate / 60.0, capacity)

