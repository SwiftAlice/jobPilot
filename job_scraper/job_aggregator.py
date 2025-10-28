"""
Job aggregator to combine results from all sources
"""
import asyncio
import time
from typing import List, Dict, Any, Optional
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

from models import JobPosting, JobSearchQuery, JobSearchResult, JobSource
from linkedin_scraper import LinkedInScraper
from naukri_scraper import NaukriScraper
from indeed_scraper import IndeedScraper
from skill_matcher import SkillMatcher

class JobAggregator:
    """Aggregates job results from multiple sources"""
    
    def __init__(self):
        self.scrapers = {
            JobSource.LINKEDIN: LinkedInScraper(),
            JobSource.NAUKRI: NaukriScraper(),
            JobSource.INDEED: IndeedScraper()
        }
        self.skill_matcher = SkillMatcher()
    
    def search_jobs(self, query: JobSearchQuery) -> JobSearchResult:
        """Search for jobs across all configured sources"""
        start_time = time.time()
        all_jobs = []
        errors = []
        sources_searched = []
        
        # Filter sources based on query
        sources_to_search = [source for source in query.sources if source in self.scrapers]
        
        if not sources_to_search:
            return JobSearchResult(
                query=query,
                jobs=[],
                total_found=0,
                search_timestamp=datetime.now(),
                sources_searched=[],
                errors=["No valid sources to search"]
            )
        
        # Search each source sequentially to avoid threading issues
        for source in sources_to_search:
            try:
                print(f"Searching {source.value}...")
                jobs = self._search_source(source, query)
                all_jobs.extend(jobs)
                sources_searched.append(source)
                print(f"Found {len(jobs)} jobs from {source.value}")
            except Exception as e:
                error_msg = f"Error searching {source.value}: {str(e)}"
                errors.append(error_msg)
                print(error_msg)
        
        # Do not remove any jobs; keep all results as requested
        unique_jobs = list(all_jobs)
        
        # Sort by match score and relevance
        unique_jobs = self._sort_jobs(unique_jobs, query)
        
        # Calculate advanced match scores
        for job in unique_jobs:
            job.match_score = self.skill_matcher.calculate_advanced_match_score(job, query.skills)
            job.skills_matched = [match.skill for match in self.skill_matcher.find_skill_matches(job, query.skills)]
        
        # Re-sort after calculating advanced scores
        unique_jobs = self._sort_jobs(unique_jobs, query)
        
        search_time = time.time() - start_time
        print(f"Job search completed in {search_time:.2f} seconds")
        print(f"Found {len(unique_jobs)} unique jobs from {len(sources_searched)} sources")
        
        return JobSearchResult(
            query=query,
            jobs=unique_jobs,
            total_found=len(unique_jobs),
            search_timestamp=datetime.now(),
            sources_searched=sources_searched,
            errors=errors
        )
    
    def _search_source(self, source: JobSource, query: JobSearchQuery) -> List[JobPosting]:
        """Search a specific source for jobs"""
        scraper = self.scrapers[source]
        try:
            return scraper.search_jobs(query)
        except Exception as e:
            print(f"Error in {source.value} scraper: {e}")
            return []
    
    
    def _remove_duplicates(self, jobs: List[JobPosting]) -> List[JobPosting]:
        """Remove duplicate jobs using id/url falling back to title+company"""
        seen = set()
        unique_jobs: List[JobPosting] = []
        
        for job in jobs:
            id_key = (job.id or '').strip().lower()
            url_key = (job.url or '').strip().lower()
            title_company_key = (job.title or '').strip().lower(), (job.company or '').strip().lower()

            key = None
            if id_key:
                key = ("id", id_key)
            elif url_key:
                key = ("url", url_key)
            else:
                key = ("tc", title_company_key)
            
            if key in seen:
                continue
            seen.add(key)
            unique_jobs.append(job)
        
        return unique_jobs
    
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
    
    def get_job_recommendations(self, job_posting: JobPosting, user_skills: List[str]) -> List[str]:
        """Get skill recommendations for a specific job"""
        return self.skill_matcher.get_skill_recommendations(job_posting, user_skills)
    
    def filter_jobs_by_criteria(self, jobs: List[JobPosting], 
                               min_match_score: float = 0.0,
                               max_results: int = 50,
                               sources: Optional[List[JobSource]] = None) -> List[JobPosting]:
        """Filter jobs based on specific criteria"""
        filtered_jobs = jobs
        
        # Filter by match score
        if min_match_score > 0:
            filtered_jobs = [job for job in filtered_jobs if job.match_score >= min_match_score]
        
        # Filter by sources
        if sources:
            filtered_jobs = [job for job in filtered_jobs if job.source in sources]
        
        # Limit results
        return filtered_jobs[:max_results]
    
    def get_job_statistics(self, jobs: List[JobPosting]) -> Dict[str, Any]:
        """Get statistics about the job search results"""
        if not jobs:
            return {}
        
        # Count by source
        source_counts = {}
        for job in jobs:
            source = job.source.value
            source_counts[source] = source_counts.get(source, 0) + 1
        
        # Count by match score ranges
        score_ranges = {
            'high (0.8-1.0)': 0,
            'medium (0.5-0.8)': 0,
            'low (0.0-0.5)': 0
        }
        
        for job in jobs:
            if job.match_score >= 0.8:
                score_ranges['high (0.8-1.0)'] += 1
            elif job.match_score >= 0.5:
                score_ranges['medium (0.5-0.8)'] += 1
            else:
                score_ranges['low (0.0-0.5)'] += 1
        
        # Count by company
        company_counts = {}
        for job in jobs:
            company = job.company
            company_counts[company] = company_counts.get(company, 0) + 1
        
        # Get top companies
        top_companies = sorted(company_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        
        # Get most common skills
        all_skills = []
        for job in jobs:
            all_skills.extend(job.skills_required)
        
        skill_counts = {}
        for skill in all_skills:
            skill_counts[skill] = skill_counts.get(skill, 0) + 1
        
        top_skills = sorted(skill_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        
        return {
            'total_jobs': len(jobs),
            'source_distribution': source_counts,
            'match_score_distribution': score_ranges,
            'top_companies': top_companies,
            'top_skills': top_skills,
            'average_match_score': sum(job.match_score for job in jobs) / len(jobs) if jobs else 0
        }
