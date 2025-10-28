"""
Configuration settings for job scraper
"""
import os
from dotenv import load_dotenv

load_dotenv()

# Job search configuration
JOB_SEARCH_CONFIG = {
    'max_results_per_source': 10,  # Reduced for faster response
    'delay_between_requests': 1,  # seconds - reduced
    'timeout': 10,  # seconds - reduced
    'retry_attempts': 1,  # Reduced retries
}

# LinkedIn configuration
LINKEDIN_CONFIG = {
    'base_url': 'https://www.linkedin.com/jobs/search/',
    'search_params': {
        'keywords': '',
        'location': '',
        'f_TPR': 'r86400',  # Past 24 hours
        'f_E': '2,3,4,5',  # Experience levels
        'f_JT': 'F',  # Full-time
        'start': 0
    },
    'selenium_enabled': os.getenv('LINKEDIN_SELENIUM', 'false').lower() == 'true',
    'selenium_page_wait_seconds': int(os.getenv('SELENIUM_PAGE_WAIT', '4')),
    'selenium_headless': os.getenv('SELENIUM_HEADLESS', 'true').lower() == 'true'
}

# Naukri configuration
NAUKRI_CONFIG = {
    'base_url': 'https://www.naukri.com/jobs-in-',
    'search_url': 'https://www.naukri.com/jobapi/v3/search',
    'search_params': {
        'noOfResults': 50,
        'urlType': 'search_by_keyword',
        'searchType': 'adv',
        'keyword': '',
        'location': '',
        'experience': '2,5',  # 2-5 years
        'jobType': '1',  # Full-time
        'sort': 'r'  # Relevance
    }
}

# Indeed configuration
INDEED_CONFIG = {
    'base_url': 'https://in.indeed.com/jobs',
    'search_params': {
        'q': '',
        'l': '',
        'fromage': '1',  # Past 24 hours
        'sort': 'date',
        'start': 0
    }
}

# Skills database for matching
SKILLS_DATABASE = {
    'programming_languages': [
        'python', 'javascript', 'java', 'c++', 'c#', 'php', 'ruby', 'go', 'rust', 'swift',
        'kotlin', 'scala', 'r', 'matlab', 'perl', 'haskell', 'clojure', 'dart', 'typescript'
    ],
    'web_technologies': [
        'react', 'angular', 'vue', 'node.js', 'express', 'django', 'flask', 'spring',
        'laravel', 'rails', 'asp.net', 'jquery', 'bootstrap', 'tailwind', 'sass', 'less'
    ],
    'databases': [
        'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch', 'cassandra',
        'oracle', 'sqlite', 'dynamodb', 'neo4j', 'influxdb'
    ],
    'cloud_platforms': [
        'aws', 'azure', 'gcp', 'google cloud', 'amazon web services', 'microsoft azure',
        'kubernetes', 'docker', 'terraform', 'ansible', 'jenkins', 'ci/cd'
    ],
    'data_science': [
        'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'pandas', 'numpy',
        'scikit-learn', 'keras', 'opencv', 'nltk', 'spacy', 'jupyter', 'tableau', 'power bi'
    ],
    'mobile_development': [
        'android', 'ios', 'react native', 'flutter', 'xamarin', 'ionic', 'cordova'
    ],
    'devops_tools': [
        'git', 'github', 'gitlab', 'bitbucket', 'jenkins', 'travis ci', 'circleci',
        'docker', 'kubernetes', 'terraform', 'ansible', 'chef', 'puppet'
    ]
}

# User agent strings for web scraping
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
]

# Rate limiting configuration
RATE_LIMITS = {
    'linkedin': {'requests_per_minute': 10, 'delay': 6},
    'naukri': {'requests_per_minute': 15, 'delay': 4},
    'indeed': {'requests_per_minute': 20, 'delay': 3}
}
