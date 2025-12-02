"""
Circuit breaker pattern for connector resilience.
"""
import time
import redis
from enum import Enum
from typing import Optional


class CircuitState(Enum):
    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, short-circuit
    HALF_OPEN = "half_open"  # Testing recovery


class CircuitBreaker:
    """Circuit breaker for source connectors."""
    
    def __init__(
        self,
        redis_client: redis.Redis,
        key: str,
        failure_threshold: int = 5,
        timeout: int = 60,
        half_open_timeout: int = 30,
    ):
        """
        Args:
            redis_client: Redis client
            key: Source identifier
            failure_threshold: Failures before opening
            timeout: Seconds to wait before half-open
            half_open_timeout: Seconds to wait in half-open before allowing retry
        """
        self.redis = redis_client
        self.key = f"circuit:{key}"
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.half_open_timeout = half_open_timeout
    
    def record_success(self):
        """Record a successful operation."""
        self.redis.delete(f"{self.key}:failures")
        self.redis.delete(f"{self.key}:opened_at")
        self.redis.delete(f"{self.key}:half_open_at")
    
    def record_failure(self):
        """Record a failed operation."""
        failures = self.redis.incr(f"{self.key}:failures")
        self.redis.expire(f"{self.key}:failures", self.timeout * 2)
        if failures >= self.failure_threshold:
            self.redis.set(f"{self.key}:opened_at", time.time(), ex=self.timeout)
    
    def is_open(self) -> bool:
        """Check if circuit is open."""
        opened_at = self.redis.get(f"{self.key}:opened_at")
        if not opened_at:
            return False
        opened_time = float(opened_at)
        if time.time() - opened_time > self.timeout:
            # Move to half-open
            self.redis.set(f"{self.key}:half_open_at", time.time(), ex=self.half_open_timeout)
            self.redis.delete(f"{self.key}:opened_at")
            return False
        return True
    
    def is_half_open(self) -> bool:
        """Check if circuit is half-open."""
        return bool(self.redis.get(f"{self.key}:half_open_at"))
    
    def can_proceed(self) -> bool:
        """Check if operation can proceed."""
        if self.is_open():
            return False
        if self.is_half_open():
            return True  # Allow one attempt
        return True

