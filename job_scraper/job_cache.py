"""
Job search caching system
"""
import time
import hashlib
import json
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from datetime import datetime, timedelta
import threading

@dataclass
class CacheEntry:
    """Represents a cached job search result"""
    data: Dict[str, Any]
    timestamp: datetime
    ttl_seconds: int
    total_jobs: int  # Total jobs found across all pages
    
    def is_expired(self) -> bool:
        """Check if cache entry has expired"""
        return datetime.now() > self.timestamp + timedelta(seconds=self.ttl_seconds)

class JobSearchCache:
    """Thread-safe job search cache with TTL and size limits"""
    
    def __init__(self, max_size: int = 100, default_ttl: int = 300):
        self.cache: Dict[str, CacheEntry] = {}
        self.max_size = max_size
        self.default_ttl = default_ttl
        self.lock = threading.RLock()
        self.access_times: Dict[str, datetime] = {}
    
    def _generate_cache_key(self, query_params: Dict[str, Any]) -> str:
        """Generate a cache key from query parameters"""
        # Remove pagination parameters for cache key generation
        cache_params = {k: v for k, v in query_params.items() 
                       if k not in ['page', 'page_size']}
        
        # Sort keys for consistent hashing
        sorted_params = json.dumps(cache_params, sort_keys=True)
        cache_key = hashlib.md5(sorted_params.encode()).hexdigest()
        
        # Debug: log what's being cached
        print(f"[CACHE KEY] Generating cache key from: keywords={query_params.get('keywords')}, location={query_params.get('location')}, skills={query_params.get('skills')}")
        print(f"[CACHE KEY] Cache key: {cache_key}")
        
        return cache_key
    
    def get_page(self, query_params: Dict[str, Any], page: int) -> Optional[Dict[str, Any]]:
        """Get a specific page from cache"""
        with self.lock:
            cache_key = self._generate_cache_key(query_params)
            
            print(f"[CACHE GET] Looking for page {page} with key {cache_key}")
            print(f"[CACHE GET] Cache contains keys: {list(self.cache.keys())}")
            
            if cache_key not in self.cache:
                print(f"[CACHE GET] MISS - Key {cache_key} not found in cache")
                return None
            
            entry = self.cache[cache_key]
            
            # Check if expired
            if entry.is_expired():
                del self.cache[cache_key]
                if cache_key in self.access_times:
                    del self.access_times[cache_key]
                return None
            
            # Update access time for LRU
            self.access_times[cache_key] = datetime.now()
            
            # Get page size from query params
            page_size = query_params.get('page_size', 20)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            
            # Get jobs from cache, filtering out None placeholders
            cached_jobs = [job for job in entry.data['jobs'] if job is not None]
            
            # Check if we have this page in cache
            if start_idx >= len(cached_jobs):
                return None  # Page not cached yet
            
            # Create paginated response for this page
            paginated_jobs = cached_jobs[start_idx:end_idx]
            
            # Estimate total pages - show more pages upfront to encourage exploration
            # If we have 100+ jobs, estimate there might be more available
            estimated_total_jobs = max(len(cached_jobs), 200)  # Assume at least 200 jobs available
            estimated_total_pages = (estimated_total_jobs + page_size - 1) // page_size
            
            return {
                **entry.data,
                'jobs': paginated_jobs,
                'pagination': {
                    'page': page,
                    'page_size': page_size,
                    'total_pages': estimated_total_pages,  # Show estimated total pages
                    'has_next_page': page < estimated_total_pages,  # Always show next if not on last estimated page
                    'has_previous_page': page > 1
                },
                'total_found': len(cached_jobs),  # Actual jobs found
                'estimated_total': estimated_total_jobs,  # Estimated total available
                'cached': True,
                'cache_timestamp': entry.timestamp.isoformat()
            }
    
    def has_page(self, query_params: Dict[str, Any], page: int) -> bool:
        """Check if a specific page is cached"""
        with self.lock:
            cache_key = self._generate_cache_key(query_params)
            
            if cache_key not in self.cache:
                return False
            
            entry = self.cache[cache_key]
            
            if entry.is_expired():
                del self.cache[cache_key]
                if cache_key in self.access_times:
                    del self.access_times[cache_key]
                return False
            
            page_size = query_params.get('page_size', 20)
            start_idx = (page - 1) * page_size
            
            return start_idx < len(entry.data['jobs'])
    
    def get(self, query_params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Get cached result for query parameters"""
        with self.lock:
            cache_key = self._generate_cache_key(query_params)
            
            if cache_key not in self.cache:
                return None
            
            entry = self.cache[cache_key]
            
            # Check if expired
            if entry.is_expired():
                del self.cache[cache_key]
                if cache_key in self.access_times:
                    del self.access_times[cache_key]
                return None
            
            # Update access time for LRU
            self.access_times[cache_key] = datetime.now()
            
            # Return paginated result
            page = query_params.get('page', 1)
            page_size = query_params.get('page_size', 20)
            
            # Get all non-None jobs from cache
            all_jobs = [job for job in entry.data['jobs'] if job is not None]
            
            # Calculate pagination
            total_cached_jobs = len(all_jobs)
            total_pages = (total_cached_jobs + page_size - 1) // page_size if page_size > 0 else 1
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            
            # Slice the jobs for this page
            paginated_jobs = all_jobs[start_idx:end_idx]
            
            print(f"[CACHE] Page {page}: Returning {len(paginated_jobs)} jobs from {total_cached_jobs} cached")
            print(f"[CACHE] total_pages: {total_pages}, has_next: {page < total_pages}, has_prev: {page > 1}")
            
            return {
                **entry.data,
                'jobs': paginated_jobs,
                'pagination': {
                    'page': page,
                    'page_size': page_size,
                    'total_pages': total_pages,
                    'has_next_page': page < total_pages,
                    'has_previous_page': page > 1
                },
                'total_found': total_cached_jobs,
                'cached': True,
                'cache_timestamp': entry.timestamp.isoformat()
            }
    
    def get_partial(self, query_params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Get partial cached result - returns what we have even if incomplete"""
        with self.lock:
            cache_key = self._generate_cache_key(query_params)
            
            if cache_key not in self.cache:
                return None
            
            entry = self.cache[cache_key]
            
            # Check if expired
            if entry.is_expired():
                del self.cache[cache_key]
                if cache_key in self.access_times:
                    del self.access_times[cache_key]
                return None
            
            # Update access time for LRU
            self.access_times[cache_key] = datetime.now()
            
            # Return what we have, even if incomplete
            page = query_params.get('page', 1)
            page_size = query_params.get('page_size', 20)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            
            # Create paginated response
            paginated_jobs = entry.data['jobs'][start_idx:end_idx]
            
            return {
                **entry.data,
                'jobs': paginated_jobs,
                'pagination': {
                    'page': page,
                    'page_size': page_size,
                    'total_pages': max(1, (len(entry.data['jobs']) + page_size - 1) // page_size),
                    'has_next_page': len(entry.data['jobs']) > end_idx,
                    'has_previous_page': page > 1
                },
                'total_found': len(entry.data['jobs']),  # Current cached count
                'cached': True,
                'partial': True,  # Indicates this might be incomplete
                'cache_timestamp': entry.timestamp.isoformat()
            }
    
    def set_page(self, query_params: Dict[str, Any], page_data: Dict[str, Any], 
                 ttl_seconds: Optional[int] = None) -> None:
        """Cache a specific page of results"""
        with self.lock:
            cache_key = self._generate_cache_key(query_params)
            ttl = ttl_seconds or self.default_ttl
            
            print(f"[CACHE SET] Setting page {page_data.get('pagination', {}).get('page', 1)} with key {cache_key}")
            
            # Get existing cache entry if it exists
            existing_jobs = []
            if cache_key in self.cache and not self.cache[cache_key].is_expired():
                existing_jobs = self.cache[cache_key].data.get('jobs', [])
            
            # Get new jobs from this page
            new_jobs = page_data.get('jobs', [])
            page = page_data.get('pagination', {}).get('page', 1)
            page_size = page_data.get('pagination', {}).get('page_size', 20)
            
            # Calculate where these jobs should be inserted
            start_idx = (page - 1) * page_size
            
            # Extend existing jobs list if needed
            while len(existing_jobs) < start_idx + len(new_jobs):
                existing_jobs.append(None)  # Placeholder for missing pages
            
            # Insert new jobs at the correct position
            for i, job in enumerate(new_jobs):
                existing_jobs[start_idx + i] = job
            
            # Keep None placeholders to maintain page structure
            # Only count actual jobs for total_found
            actual_jobs = [job for job in existing_jobs if job is not None]
            
            # Store updated results
            cache_data = {
                **page_data,
                'jobs': existing_jobs,  # Keep the full structure with None placeholders
                'total_found': len(actual_jobs)  # Count only actual jobs
            }
            
            # Remove pagination info from cached data
            if 'pagination' in cache_data:
                del cache_data['pagination']
            
            entry = CacheEntry(
                data=cache_data,
                timestamp=datetime.now(),
                ttl_seconds=ttl,
                total_jobs=len(actual_jobs)
            )
            
            # Implement LRU eviction if cache is full
            if len(self.cache) >= self.max_size:
                self._evict_lru()
            
            self.cache[cache_key] = entry
            self.access_times[cache_key] = datetime.now()
            
            print(f"[CACHE PAGE] Cached page {page} with {len(new_jobs)} jobs, total cached: {len(actual_jobs)}")
    
    def merge_and_set(self, query_params: Dict[str, Any], new_result: Dict[str, Any], 
                     ttl_seconds: Optional[int] = None) -> None:
        """Merge new results with existing cache and update"""
        with self.lock:
            cache_key = self._generate_cache_key(query_params)
            ttl = ttl_seconds or self.default_ttl
            
            # Get existing cache entry if it exists
            existing_jobs = []
            existing_total = 0
            if cache_key in self.cache and not self.cache[cache_key].is_expired():
                existing_jobs = self.cache[cache_key].data.get('jobs', [])
                existing_total = self.cache[cache_key].total_jobs
            
            # Merge jobs (avoid duplicates by ID)
            existing_ids = {job.get('id') for job in existing_jobs}
            new_jobs = new_result.get('jobs', [])
            
            # Add new jobs that aren't already cached
            merged_jobs = existing_jobs.copy()
            for job in new_jobs:
                if job.get('id') not in existing_ids:
                    merged_jobs.append(job)
            
            # Update total count
            total_jobs = len(merged_jobs)
            
            # Store merged results
            cache_data = {
                **new_result,
                'jobs': merged_jobs,
                'total_found': total_jobs
            }
            
            # Remove pagination info from cached data
            if 'pagination' in cache_data:
                del cache_data['pagination']
            
            entry = CacheEntry(
                data=cache_data,
                timestamp=datetime.now(),
                ttl_seconds=ttl,
                total_jobs=total_jobs
            )
            
            # Implement LRU eviction if cache is full
            if len(self.cache) >= self.max_size:
                self._evict_lru()
            
            self.cache[cache_key] = entry
            self.access_times[cache_key] = datetime.now()
            
            print(f"[CACHE MERGE] Added {len(new_jobs)} new jobs, total cached: {total_jobs}")
    
    def set(self, query_params: Dict[str, Any], result: Dict[str, Any], 
            ttl_seconds: Optional[int] = None) -> None:
        """Cache a job search result"""
        with self.lock:
            cache_key = self._generate_cache_key(query_params)
            ttl = ttl_seconds or self.default_ttl
            
            # Extract total jobs count
            total_jobs = result.get('total_found', len(result.get('jobs', [])))
            
            # Store all jobs for pagination
            cache_data = {
                **result,
                'jobs': result.get('jobs', []),  # Store all jobs
                'total_found': total_jobs
            }
            
            # Remove pagination info from cached data
            if 'pagination' in cache_data:
                del cache_data['pagination']
            
            entry = CacheEntry(
                data=cache_data,
                timestamp=datetime.now(),
                ttl_seconds=ttl,
                total_jobs=total_jobs
            )
            
            # Implement LRU eviction if cache is full
            if len(self.cache) >= self.max_size:
                self._evict_lru()
            
            self.cache[cache_key] = entry
            self.access_times[cache_key] = datetime.now()
    
    def _evict_lru(self) -> None:
        """Evict least recently used cache entry"""
        if not self.access_times:
            return
        
        lru_key = min(self.access_times.keys(), 
                     key=lambda k: self.access_times[k])
        
        if lru_key in self.cache:
            del self.cache[lru_key]
        if lru_key in self.access_times:
            del self.access_times[lru_key]
    
    def clear(self) -> None:
        """Clear all cache entries"""
        with self.lock:
            self.cache.clear()
            self.access_times.clear()
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        with self.lock:
            return {
                'size': len(self.cache),
                'max_size': self.max_size,
                'entries': [
                    {
                        'key': key,
                        'timestamp': entry.timestamp.isoformat(),
                        'ttl': entry.ttl_seconds,
                        'total_jobs': entry.total_jobs,
                        'last_access': self.access_times.get(key, entry.timestamp).isoformat()
                    }
                    for key, entry in self.cache.items()
                ]
            }

# Global cache instance
job_cache = JobSearchCache(max_size=50, default_ttl=600)  # 10 minutes TTL
