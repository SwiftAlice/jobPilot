"""
API Keys configuration for job sources
"""
import os

# Adzuna API Keys
ADZUNA_APP_ID = os.getenv('ADZUNA_APP_ID', 'your_adzuna_app_id')
ADZUNA_APP_KEY = os.getenv('ADZUNA_APP_KEY', 'your_adzuna_app_key')

# Jooble API Key
JOOBLE_API_KEY = os.getenv('JOOBLE_API_KEY', 'your_jooble_api_key')

# Instructions for getting API keys:
"""
1. Adzuna API:
   - Visit: https://developer.adzuna.com/
   - Sign up for free account
   - Get your App ID and App Key
   - Set environment variables: ADZUNA_APP_ID and ADZUNA_APP_KEY

2. Jooble API:
   - Visit: https://jooble.org/api/about
   - Sign up for free account
   - Get your API key
   - Set environment variable: JOOBLE_API_KEY

3. GitHub Jobs API:
   - No API key required (free)
   - Note: GitHub Jobs is deprecated but still works for some data

4. RemoteOK API:
   - No API key required (free)
   - Public API available

5. LinkedIn:
   - Currently using web scraping (no official API for job search)
   - Consider LinkedIn Talent Solutions API for enterprise use
"""
