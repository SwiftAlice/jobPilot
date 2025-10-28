"""
Test script for job scraper
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import JobSearchQuery, JobSource
from job_aggregator import JobAggregator

def test_job_search():
    """Test the job search functionality"""
    print("🧪 Testing Job Scraper...")
    print("=" * 50)
    
    # Create a test search query
    query = JobSearchQuery(
        keywords=["Python Developer", "Software Engineer"],
        location="Mumbai",
        skills=["Python", "Django", "Flask", "AWS", "PostgreSQL"],
        max_results=10,
        sources=[JobSource.LINKEDIN, JobSource.NAUKRI, JobSource.INDEED]
    )
    
    print(f"Search Query:")
    print(f"  Keywords: {query.keywords}")
    print(f"  Location: {query.location}")
    print(f"  Skills: {query.skills}")
    print(f"  Sources: {[s.value for s in query.sources]}")
    print(f"  Max Results: {query.max_results}")
    print()
    
    # Initialize job aggregator
    aggregator = JobAggregator()
    
    try:
        # Search for jobs
        print("🔍 Searching for jobs...")
        result = aggregator.search_jobs(query)
        
        print(f"✅ Search completed!")
        print(f"  Total jobs found: {result.total_found}")
        print(f"  Sources searched: {[s.value for s in result.sources_searched]}")
        print(f"  Errors: {len(result.errors)}")
        
        if result.errors:
            print("  Error details:")
            for error in result.errors:
                print(f"    • {error}")
        
        print()
        
        # Display job results
        if result.jobs:
            print("📋 Job Results:")
            print("-" * 50)
            
            for i, job in enumerate(result.jobs[:5], 1):  # Show first 5 jobs
                print(f"{i}. {job.title}")
                print(f"   Company: {job.company}")
                print(f"   Location: {job.location}")
                print(f"   Source: {job.source.value}")
                print(f"   Match Score: {job.match_score:.1%}")
                print(f"   Skills Required: {', '.join(job.skills_required[:5])}")
                if job.skills_matched:
                    print(f"   Skills Matched: {', '.join(job.skills_matched)}")
                print(f"   URL: {job.url}")
                print()
            
            if len(result.jobs) > 5:
                print(f"... and {len(result.jobs) - 5} more jobs")
        else:
            print("❌ No jobs found")
        
        # Display statistics
        stats = aggregator.get_job_statistics(result.jobs)
        print("📊 Statistics:")
        print(f"  Average match score: {stats.get('average_match_score', 0):.1%}")
        print(f"  Source distribution: {stats.get('source_distribution', {})}")
        
        if stats.get('top_skills'):
            print(f"  Top skills: {', '.join([skill for skill, count in stats['top_skills'][:5]])}")
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_skill_matching():
    """Test skill matching functionality"""
    print("\n🎯 Testing Skill Matching...")
    print("=" * 50)
    
    from skill_matcher import SkillMatcher
    from models import JobPosting, JobSource
    
    matcher = SkillMatcher()
    
    # Create a test job
    test_job = JobPosting(
        id="test_1",
        title="Python Developer",
        company="Test Company",
        location="Mumbai",
        description="We are looking for a Python developer with Django, Flask, and AWS experience.",
        url="https://example.com/job/1",
        source=JobSource.LINKEDIN,
        skills_required=["Python", "Django", "Flask", "AWS", "PostgreSQL"]
    )
    
    user_skills = ["Python", "Django", "JavaScript", "React"]
    
    # Test skill matching
    matches = matcher.find_skill_matches(test_job, user_skills)
    match_score = matcher.calculate_advanced_match_score(test_job, user_skills)
    
    print(f"Test Job: {test_job.title}")
    print(f"Required Skills: {', '.join(test_job.skills_required)}")
    print(f"User Skills: {', '.join(user_skills)}")
    print(f"Match Score: {match_score:.1%}")
    print(f"Skill Matches: {len(matches)}")
    
    for match in matches:
        print(f"  • {match.skill} ({match.match_type}) - {match.confidence:.1%}")
    
    return True

if __name__ == "__main__":
    print("🚀 Job Scraper Test Suite")
    print("=" * 50)
    
    # Test skill matching first (doesn't require network)
    skill_test_passed = test_skill_matching()
    
    # Test job search (requires network)
    print("\n" + "=" * 50)
    search_test_passed = test_job_search()
    
    print("\n" + "=" * 50)
    print("📋 Test Results:")
    print(f"  Skill Matching: {'✅ PASSED' if skill_test_passed else '❌ FAILED'}")
    print(f"  Job Search: {'✅ PASSED' if search_test_passed else '❌ FAILED'}")
    
    if skill_test_passed and search_test_passed:
        print("\n🎉 All tests passed! The job scraper is working correctly.")
    else:
        print("\n⚠️  Some tests failed. Please check the error messages above.")
