"""
Base connector interface for all job sources.
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime
from dataclasses import dataclass, field


@dataclass
class RawJob:
    """Raw job data from a source before normalization."""
    source: str
    external_id: str
    title: str
    company: str
    location: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    posted_at: Optional[datetime] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    currency: Optional[str] = None
    experience_min: Optional[float] = None
    experience_max: Optional[float] = None
    employment_type: Optional[str] = None
    remote_type: Optional[str] = None  # 'remote', 'hybrid', 'onsite'
    skills: Optional[List[str]] = None
    raw_data: Optional[Dict[str, Any]] = None  # source-specific payload


@dataclass
class SearchQuery:
    """Query parameters for job search."""
    keywords: List[str]
    location: Optional[str] = None
    experience_level: Optional[str] = None  # 'entry', 'mid', 'senior', 'leadership'
    remote_type: Optional[str] = None  # 'remote', 'hybrid', 'onsite', None=any
    max_results: int = 20
    # Pagination hints
    page: int = 1
    page_size: int = 25
    start_offset: int = 0
    skills: List[str] = field(default_factory=list)


class JobConnector(ABC):
    """Base interface for all job source connectors."""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Source identifier (e.g., 'linkedin', 'adzuna')."""
        pass
    
    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable source name."""
        pass
    
    @abstractmethod
    async def fetch(self, query: SearchQuery, since: Optional[datetime] = None) -> List[RawJob]:
        """
        Fetch jobs from this source.
        
        Args:
            query: Search parameters
            since: Only return jobs posted after this timestamp (for incremental refresh)
        
        Returns:
            List of RawJob objects
        """
        pass
    
    def normalize(self, raw: RawJob) -> Dict[str, Any]:
        """
        Convert RawJob to canonical dict for database upsert.
        Override if source-specific normalization needed.
        """
        return {
            'source': self.name,
            'external_id': raw.external_id,
            'title': raw.title,
            'company': raw.company,
            'location': raw.location,
            'description': raw.description,
            'url': raw.url,
            'posted_at': raw.posted_at,
            'min_salary': raw.salary_min,
            'max_salary': raw.salary_max,
            'currency': raw.currency,
            'experience_min': raw.experience_min,
            'experience_max': raw.experience_max,
            'employment_type': raw.employment_type,
            'remote_type': raw.remote_type,
            'skills': raw.skills or [],
        }

