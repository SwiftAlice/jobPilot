"""
Command line interface for job scraper
"""
import argparse
import json
from typing import List
from models import JobSearchQuery, JobSource
from job_aggregator import JobAggregator

def main():
    parser = argparse.ArgumentParser(description='Job Scraper CLI')
    parser.add_argument('--keywords', '-k', nargs='+', required=True, help='Job keywords')
    parser.add_argument('--location', '-l', required=True, help='Job location')
    parser.add_argument('--skills', '-s', nargs='+', required=True, help='Your skills')
    parser.add_argument('--sources', nargs='+', choices=['linkedin', 'naukri', 'indeed'], 
                       default=['linkedin', 'naukri', 'indeed'], help='Job sources to search')
    parser.add_argument('--max-results', '-m', type=int, default=50, help='Maximum results')
    parser.add_argument('--min-score', type=float, default=0.0, help='Minimum match score')
    parser.add_argument('--output', '-o', help='Output file (JSON)')
    parser.add_argument('--format', choices=['json', 'table'], default='table', help='Output format')
    
    args = parser.parse_args()
    
    # Convert sources to JobSource enums
    sources = [JobSource(source) for source in args.sources]
    
    # Create search query
    query = JobSearchQuery(
        keywords=args.keywords,
        location=args.location,
        skills=args.skills,
        max_results=args.max_results,
        sources=sources
    )
    
    print(f"🔍 Searching for jobs...")
    print(f"   Keywords: {', '.join(args.keywords)}")
    print(f"   Location: {args.location}")
    print(f"   Skills: {', '.join(args.skills)}")
    print(f"   Sources: {', '.join(args.sources)}")
    print()
    
    # Initialize job aggregator
    aggregator = JobAggregator()
    
    # Search for jobs
    result = aggregator.search_jobs(query)
    
    # Filter by minimum score
    if args.min_score > 0:
        result.jobs = [job for job in result.jobs if job.match_score >= args.min_score]
    
    # Display results
    if args.format == 'json':
        output_data = result.to_dict()
        if args.output:
            with open(args.output, 'w') as f:
                json.dump(output_data, f, indent=2)
            print(f"Results saved to {args.output}")
        else:
            print(json.dumps(output_data, indent=2))
    else:
        display_table_results(result)
    
    # Display statistics
    stats = aggregator.get_job_statistics(result.jobs)
    print(f"\n📊 Statistics:")
    print(f"   Total jobs found: {stats.get('total_jobs', 0)}")
    print(f"   Average match score: {stats.get('average_match_score', 0):.2%}")
    print(f"   Sources searched: {len(result.sources_searched)}")
    
    if result.errors:
        print(f"\n⚠️  Errors:")
        for error in result.errors:
            print(f"   • {error}")

def display_table_results(result):
    """Display results in a table format"""
    if not result.jobs:
        print("❌ No jobs found matching your criteria.")
        return
    
    print(f"✅ Found {len(result.jobs)} jobs:")
    print()
    
    for i, job in enumerate(result.jobs, 1):
        print(f"{i:2d}. {job.title}")
        print(f"    Company: {job.company}")
        print(f"    Location: {job.location}")
        print(f"    Source: {job.source.value}")
        print(f"    Match Score: {job.match_score:.1%}")
        
        if job.skills_matched:
            print(f"    Matched Skills: {', '.join(job.skills_matched)}")
        
        if job.salary:
            print(f"    Salary: {job.salary}")
        
        print(f"    URL: {job.url}")
        print()

if __name__ == '__main__':
    main()
