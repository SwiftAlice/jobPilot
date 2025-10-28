#!/usr/bin/env python3
"""
Job Scraper Runner
Quick start script for the job scraper
"""
import sys
import os
import argparse

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def run_web_server():
    """Run the web server"""
    from app import app
    print("🌐 Starting Job Scraper Web Server...")
    app.run(host='0.0.0.0', port=5000, debug=True)

def run_cli():
    """Run the CLI interface"""
    from cli import main
    main()

def run_test():
    """Run the test suite"""
    from test_scraper import test_job_search, test_skill_matching
    print("🧪 Running Job Scraper Tests...")
    
    # Test skill matching first
    test_skill_matching()
    
    # Test job search
    test_job_search()

def main():
    parser = argparse.ArgumentParser(description='Job Scraper Runner')
    parser.add_argument('--mode', choices=['web', 'cli', 'test'], default='web',
                       help='Run mode: web (default), cli, or test')
    
    args = parser.parse_args()
    
    if args.mode == 'web':
        run_web_server()
    elif args.mode == 'cli':
        run_cli()
    elif args.mode == 'test':
        run_test()

if __name__ == '__main__':
    main()
