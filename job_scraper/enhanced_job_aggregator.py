"""
Enhanced job aggregator with multiple sources including APIs
"""
import time
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from models import JobPosting, JobSearchQuery, JobSource, JobSearchResult, SkillMatch
from skill_matcher import SkillMatcher
from multi_portal_scraper import MultiPortalJobAggregator

class EnhancedJobAggregator:
    """Enhanced job aggregator with multiple sources"""
    
    def __init__(self):
        self.skill_matcher = SkillMatcher()
        self.multi_portal_aggregator = MultiPortalJobAggregator()
    
    def search_jobs(self, query: JobSearchQuery) -> JobSearchResult:
        """Search for jobs across multiple sources"""
        start_time = time.time()
        
        # Use the multi-portal aggregator for comprehensive search
        all_jobs = self.multi_portal_aggregator.search_jobs(query)
        
        # The multi-portal aggregator already calculates match scores, profile scores, and skill scores
        # No need to recalculate here - just sort and return
        
        # Sort by match score
        unique_jobs = self._sort_jobs(all_jobs, query)
        
        # Limit results based on max_results parameter
        limited_jobs = unique_jobs[:query.max_results]
        total_jobs = len(limited_jobs)
        
        search_time = time.time() - start_time
        print(f"Job search completed in {search_time:.2f} seconds")
        print(f"Found {len(unique_jobs)} unique jobs, returning {total_jobs} (max_results: {query.max_results})")
        
        return JobSearchResult(
            query=query,
            jobs=limited_jobs,  # Return limited jobs
            total_found=total_jobs,
            search_timestamp=datetime.now(),
            sources_searched=query.sources,
            errors=[],
            page=1,  # Always return page 1 for caching
            page_size=total_jobs  # Return limited jobs
        )
    
    def _sort_jobs(self, jobs: List[JobPosting], query: JobSearchQuery) -> List[JobPosting]:
        """Sort jobs by relevance and match score"""
        def sort_key(job):
            # Primary sort: match score (descending)
            # Secondary sort: number of matched skills (descending)
            # Tertiary sort: number of required skills (ascending - prefer jobs with fewer requirements)
            return (
                -job.match_score,
                -len(job.skills_matched),
                len(job.skills_required)
            )
        
        return sorted(jobs, key=sort_key)
    
    def get_job_statistics(self, jobs: List[JobPosting]) -> Dict[str, Any]:
        """Get statistics about the job search results"""
        if not jobs:
            return {
                'total_jobs': 0,
                'average_match_score': 0,
                'match_score_distribution': {'high (0.8-1.0)': 0, 'medium (0.5-0.8)': 0, 'low (0.0-0.5)': 0},
                'source_distribution': {},
                'top_companies': [],
                'top_skills': []
            }
        
        # Calculate statistics
        total_jobs = len(jobs)
        match_scores = [job.match_score for job in jobs]
        average_match_score = sum(match_scores) / len(match_scores) if match_scores else 0
        
        # Match score distribution
        high_matches = len([score for score in match_scores if score >= 0.8])
        medium_matches = len([score for score in match_scores if 0.5 <= score < 0.8])
        low_matches = len([score for score in match_scores if score < 0.5])
        
        # Source distribution
        source_counts = {}
        for job in jobs:
            source = job.source.value
            source_counts[source] = source_counts.get(source, 0) + 1
        
        # Top companies
        company_counts = {}
        for job in jobs:
            company = job.company
            company_counts[company] = company_counts.get(company, 0) + 1
        top_companies = sorted(company_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        
        # Top skills
        skill_counts = {}
        for job in jobs:
            for skill in job.skills_required:
                skill_counts[skill] = skill_counts.get(skill, 0) + 1
        top_skills = sorted(skill_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        
        return {
            'total_jobs': total_jobs,
            'average_match_score': round(average_match_score, 2),
            'match_score_distribution': {
                'high (0.8-1.0)': high_matches,
                'medium (0.5-0.8)': medium_matches,
                'low (0.0-0.5)': low_matches
            },
            'source_distribution': source_counts,
            'top_companies': top_companies,
            'top_skills': top_skills
        }
