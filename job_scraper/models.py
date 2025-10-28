"""
Data models for job scraping
"""
from dataclasses import dataclass, asdict
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class JobSource(Enum):
    LINKEDIN = "linkedin"
    NAUKRI = "naukri"
    INDEED = "indeed"
    GLASSDOOR = "glassdoor"
    MONSTER = "monster"
    ADZUNA = "adzuna"
    JOOBLE = "jooble"
    GITHUB = "github"
    REMOTEOK = "remoteok"
    INSTAHYRE = "instahyre"
    REMOTEJOBS = "remotejobs"
    FOUNDIT = "foundit"
    HRIST = "hrist"
    FLEXJOBS = "flexjobs"
    GOOGLE = "google"

@dataclass
class JobPosting:
    """Represents a job posting from any source"""
    id: str
    title: str
    company: str
    location: str
    description: str
    url: str
    source: JobSource
    posted_date: Optional[datetime] = None
    salary: Optional[str] = None
    employment_type: Optional[str] = None
    experience_level: Optional[str] = None
    skills_required: List[str] = None
    skills_matched: List[str] = None
    match_score: float = 0.0
    profile_score: float = 0.0
    skill_score: float = 0.0
    raw_data: Optional[Dict[str, Any]] = None
    
    def __post_init__(self):
        if self.skills_required is None:
            self.skills_required = []
        if self.skills_matched is None:
            self.skills_matched = []
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        data = asdict(self)
        # Convert datetime to string for JSON serialization
        if data.get('posted_date'):
            data['posted_date'] = data['posted_date'].isoformat()
        # Convert enum to string
        data['source'] = self.source.value
        return data

@dataclass
class JobSearchQuery:
    """Represents a job search query"""
    keywords: List[str]
    location: str
    skills: List[str]
    experience_level: Optional[str] = None
    employment_type: Optional[str] = None
    salary_range: Optional[tuple] = None
    max_results: int = 50
    sources: List[JobSource] = None
    page: int = 1
    page_size: int = 20
    
    def __post_init__(self):
        if self.sources is None:
            self.sources = [JobSource.LINKEDIN, JobSource.NAUKRI, JobSource.INDEED]
    
    @property
    def offset(self) -> int:
        """Calculate offset for pagination"""
        return (self.page - 1) * self.page_size

@dataclass
class JobSearchResult:
    """Represents the result of a job search"""
    query: JobSearchQuery
    jobs: List[JobPosting]
    total_found: int
    search_timestamp: datetime
    sources_searched: List[JobSource]
    errors: List[str] = None
    # Pagination metadata
    page: int = 1
    page_size: int = 20
    total_pages: int = 1
    has_next_page: bool = False
    has_previous_page: bool = False
    
    def __post_init__(self):
        if self.errors is None:
            self.errors = []
        
        # Calculate pagination metadata
        self.total_pages = (self.total_found + max(self.page_size, 1) - 1) // max(self.page_size, 1)
        self.has_next_page = self.page < self.total_pages
        self.has_previous_page = self.page > 1
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            'query': {
                'keywords': self.query.keywords,
                'location': self.query.location,
                'skills': self.query.skills,
                'experience_level': self.query.experience_level,
                'employment_type': self.query.employment_type,
                'max_results': self.query.max_results,
                'sources': [source.value for source in self.query.sources] if self.query.sources else [],
                'page': self.query.page,
                'page_size': self.query.page_size
            },
            'jobs': [job.to_dict() for job in self.jobs],
            'total_found': self.total_found,
            'search_timestamp': self.search_timestamp.isoformat(),
            'sources_searched': [source.value for source in self.sources_searched],
            'errors': self.errors or [],
            # Pagination metadata
            'pagination': {
                'page': self.page,
                'page_size': self.page_size,
                'total_pages': self.total_pages,
                'has_next_page': self.has_next_page,
                'has_previous_page': self.has_previous_page
            }
        }

@dataclass
class SkillMatch:
    """Represents a skill match between job requirements and user skills"""
    skill: str
    category: str
    match_type: str  # 'exact', 'partial', 'synonym'
    confidence: float
    job_requirement: str
    user_skill: str
