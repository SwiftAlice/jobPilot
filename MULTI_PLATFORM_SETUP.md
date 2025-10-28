# Multi-Platform Job Scraping Setup

## 🚀 **Alternative Approaches for Multi-Platform Job Search**

### **Current Status:**
- ✅ **LinkedIn**: Working perfectly (web scraping)
- ❌ **Naukri**: Blocked by anti-bot protection
- ❌ **Indeed**: Blocked by anti-bot protection

### **New Multi-Platform Solutions:**

## **1. Official APIs (Recommended)**

### **Adzuna API** (Job Aggregator)
- **Coverage**: 16+ countries, millions of jobs
- **Cost**: Free tier available
- **Setup**:
  1. Visit: https://developer.adzuna.com/
  2. Sign up for free account
  3. Get your App ID and App Key
  4. Set environment variables:
     ```bash
     export ADZUNA_APP_ID="your_app_id"
     export ADZUNA_APP_KEY="your_app_key"
     ```

### **Jooble API** (Job Search Engine)
- **Coverage**: 70+ countries, 20+ million jobs
- **Cost**: Free tier available
- **Setup**:
  1. Visit: https://jooble.org/api/about
  2. Sign up for free account
  3. Get your API key
  4. Set environment variable:
     ```bash
     export JOOBLE_API_KEY="your_api_key"
     ```

### **GitHub Jobs API** (Free)
- **Coverage**: Tech jobs, startup positions
- **Cost**: Free
- **Setup**: No API key required

### **RemoteOK API** (Free)
- **Coverage**: Remote jobs worldwide
- **Cost**: Free
- **Setup**: No API key required

## **2. Browser Automation (Selenium)**

For sites with anti-bot protection, use Selenium with proper delays:

```python
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import time

def setup_selenium_driver():
    options = Options()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    
    driver = webdriver.Chrome(options=options)
    return driver
```

## **3. Proxy Services**

Use rotating proxies to avoid IP blocking:

```python
import requests

proxies = {
    'http': 'http://proxy-server:port',
    'https': 'https://proxy-server:port'
}

response = requests.get(url, proxies=proxies)
```

## **4. Job Board Aggregators**

### **Apify Job Listings Aggregator**
- **Coverage**: Multiple job boards
- **Cost**: Pay-per-use
- **Setup**: https://apify.com/assertive_analogy/job-listings-aggregator

### **ScrapingBee Job Scraping**
- **Coverage**: Multiple job boards
- **Cost**: Pay-per-use
- **Setup**: https://www.scrapingbee.com/

## **5. Enterprise Solutions**

### **LinkedIn Talent Solutions API**
- **Coverage**: LinkedIn jobs
- **Cost**: Enterprise pricing
- **Setup**: Contact LinkedIn for enterprise access

### **Indeed Publisher API**
- **Coverage**: Indeed jobs
- **Cost**: Revenue sharing
- **Setup**: https://ads.indeed.com/jobroll/xmlfeed

## **Quick Start with APIs**

1. **Set up API keys**:
   ```bash
   export ADZUNA_APP_ID="your_app_id"
   export ADZUNA_APP_KEY="your_app_key"
   export JOOBLE_API_KEY="your_api_key"
   ```

2. **Start the enhanced job scraper**:
   ```bash
   cd job_scraper
   python3 app.py
   ```

3. **Test the enhanced search**:
   ```bash
   curl -X POST http://localhost:5000/api/search-enhanced \
     -H "Content-Type: application/json" \
     -d '{
       "keywords": ["software engineer"],
       "location": "mumbai",
       "skills": ["python", "javascript"],
       "sources": ["linkedin", "adzuna", "jooble", "github", "remoteok"]
     }'
   ```

## **Benefits of API Approach:**

✅ **Reliable**: No anti-bot protection issues
✅ **Legal**: Official APIs with proper terms of service
✅ **Structured Data**: Clean, consistent job data
✅ **Scalable**: Can handle high volume requests
✅ **Maintainable**: No need to update scrapers when sites change

## **Next Steps:**

1. **Get API keys** for Adzuna and Jooble
2. **Set environment variables**
3. **Test the enhanced search**
4. **Consider adding more sources** (Glassdoor, Monster, etc.)
5. **Implement caching** for better performance
6. **Add rate limiting** to respect API limits

The enhanced job scraper is ready to use with multiple API sources! 🎉
