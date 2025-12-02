# IIMJobs Alternative Approaches Implementation

## Overview
The IIMJobs scraper has been enhanced with multiple alternative approaches to handle sites that require authentication or have anti-bot protection.

## Implemented Alternative Approaches

### 1. **Requests with Session** (Fastest - Tried First)
- **Method**: `_try_requests_with_session()`
- **Approach**: Uses `requests` library with session handling and retry strategy
- **Benefits**: 
  - Fastest approach (no Selenium overhead)
  - Establishes session cookies
  - Handles retries for network issues
- **Limitation**: Still requires access to job data in HTML/JSON

### 2. **API Interception** (Second Attempt)
- **Method**: `_try_api_interception()`
- **Approach**: Tries to call API endpoints directly
- **Common API Patterns Tested**:
  - `/api/jobs/search`
  - `/api/search`
  - `/_next/data/{buildId}/search.json`
- **Benefits**: Direct API access if endpoints are public
- **Limitation**: Most APIs require authentication tokens

### 3. **Category-Based Search** (Third Attempt)
- **Method**: `_try_category_based_search()`
- **Approach**: Maps keywords to IIMJobs category URLs (e.g., `/k/product-management-jobs`)
- **Supported Categories**:
  - Product Management
  - Marketing
  - Sales
  - Finance & Accounts
  - Analytics
  - Consulting
  - HR
  - Operations
  - IT/Software
  - And more...
- **Benefits**: Uses official category pages that may have different access rules
- **Limitation**: Only works for keywords that match predefined categories

### 4. **Selenium-Based Scraping** (Fallback)
- **Method**: Original Selenium approach
- **Approach**: Full browser automation with stealth mode
- **Features**:
  - Anti-bot detection measures
  - Waits for JavaScript rendering
  - Filters out training programs
  - Multiple wait strategies

## Execution Order

The scraper tries approaches in this order (returns on first success):

1. **Requests with Session** → Fastest, no browser overhead
2. **API Interception** → Direct API access if available
3. **Category-Based Search** → Official category pages
4. **Selenium Scraping** → Full browser automation (slowest)

## Current Status

**All approaches return 0 jobs**, indicating that IIMJobs likely:
- Requires user authentication/login to view job listings
- Has strong anti-bot protection
- Loads jobs via authenticated API calls
- May require cookies/session tokens from a logged-in user

## Next Steps (If Authentication Required)

If IIMJobs requires authentication, consider:

### Option A: Manual Cookie/Session Injection
```python
# Add to IIMJobsScraper class
def set_session_cookies(self, cookies: dict):
    """Set authenticated session cookies"""
    self.session_cookies = cookies
```

### Option B: User-Agent Rotation & Proxy
- Rotate user agents
- Use proxy services
- Add delays between requests

### Option C: Browser Automation with Login
- Implement automated login flow
- Handle CAPTCHA challenges
- Maintain authenticated sessions

### Option D: Official API Access
- Check if IIMJobs offers official API
- Apply for API access
- Use official endpoints with API keys

### Option E: Alternative Data Sources
- Use job aggregators that index IIMJobs
- Consider RSS feeds if available
- Partner with job data providers

## Testing Results

All approaches have been tested and documented:
- ✅ Code implementation complete
- ✅ Error handling in place
- ✅ Logging for debugging
- ⚠️  Returns 0 jobs (authentication likely required)

## Code Location

File: `job_scraper/alternative_sources.py`
Class: `IIMJobsScraper`

## Future Enhancements

1. **Monitor Network Requests**: Use Selenium's network logging to capture actual API endpoints
2. **Cookie Management**: Store and reuse authenticated cookies
3. **Rate Limiting**: Add delays to avoid rate limits
4. **Proxy Support**: Rotate IP addresses
5. **CAPTCHA Handling**: Integrate CAPTCHA solving services

