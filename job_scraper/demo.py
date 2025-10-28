#!/usr/bin/env python3
"""
Job Scraper Demo
Demonstrates the job scraper functionality with sample data
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import JobSearchQuery, JobSource
from job_aggregator import JobAggregator

def demo_job_search():
    """Demonstrate job search functionality"""
    print("🎯 Job Scraper Demo")
    print("=" * 60)
    print()
    
    # Sample search queries for demonstration
    demo_queries = [
        {
            "name": "Python Developer in Mumbai",
            "keywords": ["Python Developer", "Software Engineer"],
            "location": "Mumbai",
            "skills": ["Python", "Django", "Flask", "AWS", "PostgreSQL", "Git"],
            "sources": [JobSource.LINKEDIN, JobSource.NAUKRI, JobSource.INDEED]
        },
        {
            "name": "React Developer Remote",
            "keywords": ["React Developer", "Frontend Developer"],
            "location": "Remote",
            "skills": ["React", "JavaScript", "TypeScript", "Node.js", "CSS", "HTML"],
            "sources": [JobSource.LINKEDIN, JobSource.INDEED]
        },
        {
            "name": "Data Scientist Bangalore",
            "keywords": ["Data Scientist", "Machine Learning Engineer"],
            "location": "Bangalore",
            "skills": ["Python", "Machine Learning", "TensorFlow", "Pandas", "NumPy", "Scikit-learn"],
            "sources": [JobSource.LINKEDIN, JobSource.NAUKRI]
        }
    ]
    
    # Initialize job aggregator
    aggregator = JobAggregator()
    
    for i, query_data in enumerate(demo_queries, 1):
        print(f"🔍 Demo {i}: {query_data['name']}")
        print("-" * 40)
        
        # Create search query
        query = JobSearchQuery(
            keywords=query_data["keywords"],
            location=query_data["location"],
            skills=query_data["skills"],
            max_results=5,  # Limit for demo
            sources=query_data["sources"]
        )
        
        print(f"Keywords: {', '.join(query.keywords)}")
        print(f"Location: {query.location}")
        print(f"Skills: {', '.join(query.skills)}")
        print(f"Sources: {[s.value for s in query.sources]}")
        print()
        
        try:
            # Search for jobs
            print("Searching...")
            result = aggregator.search_jobs(query)
            
            print(f"✅ Found {result.total_found} jobs")
            print(f"Sources searched: {[s.value for s in result.sources_searched]}")
            
            if result.errors:
                print(f"Errors: {len(result.errors)}")
                for error in result.errors[:2]:  # Show first 2 errors
                    print(f"  • {error}")
            
            # Show top 3 jobs
            if result.jobs:
                print("\nTop 3 Jobs:")
                for j, job in enumerate(result.jobs[:3], 1):
                    print(f"  {j}. {job.title} at {job.company}")
                    print(f"     Location: {job.location}")
                    print(f"     Source: {job.source.value}")
                    print(f"     Match Score: {job.match_score:.1%}")
                    if job.skills_matched:
                        print(f"     Matched Skills: {', '.join(job.skills_matched)}")
                    print()
            else:
                print("No jobs found for this query.")
            
            # Show statistics
            stats = aggregator.get_job_statistics(result.jobs)
            if stats.get('total_jobs', 0) > 0:
                print(f"Average Match Score: {stats.get('average_match_score', 0):.1%}")
                print(f"Source Distribution: {stats.get('source_distribution', {})}")
            
        except Exception as e:
            print(f"❌ Error: {e}")
        
        print("\n" + "=" * 60)
        print()

def demo_skill_matching():
    """Demonstrate skill matching functionality"""
    print("🎯 Skill Matching Demo")
    print("=" * 40)
    
    from skill_matcher import SkillMatcher
    from models import JobPosting, JobSource
    
    matcher = SkillMatcher()
    
    # Sample job postings
    sample_jobs = [
        {
            "title": "Senior Python Developer",
            "company": "TechCorp",
            "description": "We need a Python expert with Django, Flask, AWS, and PostgreSQL experience. Machine learning knowledge is a plus.",
            "skills_required": ["Python", "Django", "Flask", "AWS", "PostgreSQL", "Machine Learning"]
        },
        {
            "title": "Full Stack JavaScript Developer",
            "company": "WebSolutions",
            "description": "Looking for a developer skilled in React, Node.js, MongoDB, and Docker. TypeScript experience preferred.",
            "skills_required": ["JavaScript", "React", "Node.js", "MongoDB", "Docker", "TypeScript"]
        },
        {
            "title": "DevOps Engineer",
            "company": "CloudTech",
            "description": "Seeking a DevOps professional with Kubernetes, Docker, AWS, and Terraform expertise. CI/CD pipeline experience required.",
            "skills_required": ["Kubernetes", "Docker", "AWS", "Terraform", "CI/CD", "Jenkins"]
        }
    ]
    
    # Sample user skills
    user_skills = ["Python", "Django", "AWS", "Docker", "Git", "JavaScript", "React"]
    
    print(f"User Skills: {', '.join(user_skills)}")
    print()
    
    for job_data in sample_jobs:
        # Create job posting
        job = JobPosting(
            id=f"demo_{hash(job_data['title'])}",
            title=job_data["title"],
            company=job_data["company"],
            location="Demo City",
            description=job_data["description"],
            url="https://demo.com/job",
            source=JobSource.LINKEDIN,
            skills_required=job_data["skills_required"]
        )
        
        # Calculate match score
        match_score = matcher.calculate_advanced_match_score(job, user_skills)
        matches = matcher.find_skill_matches(job, user_skills)
        
        print(f"Job: {job.title}")
        print(f"Required: {', '.join(job.skills_required)}")
        print(f"Match Score: {match_score:.1%}")
        print(f"Matched Skills: {', '.join([m.skill for m in matches])}")
        
        # Get recommendations
        recommendations = matcher.get_skill_recommendations(job, user_skills)
        if recommendations:
            print(f"Recommendations: {', '.join(recommendations[:3])}")
        
        print()

if __name__ == "__main__":
    print("🚀 Job Scraper Demonstration")
    print("=" * 60)
    print()
    
    # Demo skill matching (no network required)
    demo_skill_matching()
    
    print("\n" + "=" * 60)
    print()
    
    # Demo job search (requires network)
    print("Note: Job search demo requires internet connection and may take a few minutes...")
    response = input("Continue with job search demo? (y/n): ").lower().strip()
    
    if response in ['y', 'yes']:
        demo_job_search()
    else:
        print("Skipping job search demo.")
    
    print("\n🎉 Demo completed!")
    print("\nTo use the job scraper:")
    print("1. Web Interface: python run.py --mode web")
    print("2. CLI Interface: python run.py --mode cli")
    print("3. Run Tests: python run.py --mode test")
