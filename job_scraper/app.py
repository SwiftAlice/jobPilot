"""
Job scraper Flask API application
"""
from flask import Flask, request, jsonify, render_template_string, Response
from flask_cors import CORS
import json
from datetime import datetime
from typing import List, Dict, Any

from models import JobSearchQuery, JobSource
from job_aggregator import JobAggregator
from enhanced_job_aggregator import EnhancedJobAggregator
from job_cache import job_cache
from config import JOB_SEARCH_CONFIG
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os

app = Flask(__name__)
CORS(app)

# Ensure UTF-8 encoding for JSON responses
app.config['JSON_AS_ASCII'] = False  # This ensures Unicode characters are not escaped

# Initialize job aggregators
job_aggregator = JobAggregator()
enhanced_job_aggregator = EnhancedJobAggregator()

# HTML template for the web interface
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Job Scraper - Find Your Dream Job</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
            font-weight: 300;
        }
        .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
            font-size: 1.1em;
        }
        .search-form {
            padding: 30px;
            background: #f8f9fa;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
            color: #333;
        }
        .form-group input, .form-group select, .form-group textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #e1e5e9;
            border-radius: 5px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
            outline: none;
            border-color: #667eea;
        }
        .form-row {
            display: flex;
            gap: 20px;
        }
        .form-row .form-group {
            flex: 1;
        }
        .checkbox-group {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            margin-top: 10px;
        }
        .checkbox-item {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .search-button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 5px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }
        .search-button:hover {
            transform: translateY(-2px);
        }
        .search-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        .results {
            padding: 30px;
        }
        .job-card {
            border: 1px solid #e1e5e9;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            transition: box-shadow 0.3s;
        }
        .job-card:hover {
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        .job-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 15px;
        }
        .job-title {
            font-size: 1.3em;
            font-weight: 600;
            color: #333;
            margin: 0;
        }
        .job-company {
            color: #667eea;
            font-weight: 500;
            margin: 5px 0;
        }
        .job-location {
            color: #666;
            font-size: 0.9em;
        }
        .job-source {
            background: #667eea;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8em;
            text-transform: uppercase;
        }
        .job-description {
            color: #666;
            line-height: 1.5;
            margin: 15px 0;
        }
        .job-skills {
            margin: 15px 0;
        }
        .skill-tag {
            display: inline-block;
            background: #e3f2fd;
            color: #1976d2;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8em;
            margin: 2px;
        }
        .matched-skill {
            background: #c8e6c9;
            color: #2e7d32;
        }
        .job-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #e1e5e9;
        }
        .match-score {
            font-weight: 600;
            color: #667eea;
        }
        .job-link {
            background: #667eea;
            color: white;
            text-decoration: none;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 0.9em;
        }
        .job-link:hover {
            background: #5a6fd8;
        }
        .loading {
            text-align: center;
            padding: 40px;
            color: #666;
        }
        .error {
            background: #ffebee;
            color: #c62828;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
        }
        .stats {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .stats h3 {
            margin: 0 0 15px 0;
            color: #333;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        .stat-item {
            text-align: center;
        }
        .stat-value {
            font-size: 2em;
            font-weight: 600;
            color: #667eea;
        }
        .stat-label {
            color: #666;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Job Scraper</h1>
            <p>Find your dream job across LinkedIn, Naukri, Indeed and more!</p>
        </div>
        
        <div class="search-form">
            <form id="searchForm">
                <div class="form-row">
                    <div class="form-group">
                        <label for="keywords">Job Keywords</label>
                        <input type="text" id="keywords" name="keywords" placeholder="e.g., Software Engineer, Developer" required>
                    </div>
                    <div class="form-group">
                        <label for="location">Location</label>
                        <input type="text" id="location" name="location" placeholder="e.g., Mumbai, Remote" required>
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="skills">Your Skills (comma-separated)</label>
                    <textarea id="skills" name="skills" rows="3" placeholder="e.g., Python, React, AWS, Machine Learning" required></textarea>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="experience">Experience Level</label>
                        <select id="experience" name="experience">
                            <option value="">Any</option>
                            <option value="entry">Entry Level (0-2 years)</option>
                            <option value="mid">Mid Level (2-5 years)</option>
                            <option value="senior">Senior Level (5+ years)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="maxResults">Max Results</label>
                        <select id="maxResults" name="maxResults">
                            <option value="25">25</option>
                            <option value="50" selected>50</option>
                            <option value="100">100</option>
                        </select>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Job Sources</label>
                    <div class="checkbox-group">
                        <div class="checkbox-item">
                            <input type="checkbox" id="linkedin" name="sources" value="linkedin" checked>
                            <label for="linkedin">LinkedIn</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="naukri" name="sources" value="naukri" checked>
                            <label for="naukri">Naukri</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="indeed" name="sources" value="indeed" checked>
                            <label for="indeed">Indeed</label>
                        </div>
                    </div>
                </div>
                
                <button type="submit" class="search-button" id="searchButton">
                    🔍 Search Jobs
                </button>
            </form>
        </div>
        
        <div class="results" id="results" style="display: none;">
            <div id="loading" class="loading" style="display: none;">
                <h3>Searching for jobs...</h3>
                <p>This may take a few moments as we search across multiple job portals.</p>
            </div>
            <div id="error" class="error" style="display: none;"></div>
            <div id="stats" class="stats" style="display: none;"></div>
            <div id="jobList"></div>
        </div>
    </div>

    <script>
        document.getElementById('searchForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const searchData = {
                keywords: formData.get('keywords').split(',').map(k => k.trim()).filter(k => k),
                location: formData.get('location'),
                skills: formData.get('skills').split(',').map(s => s.trim()).filter(s => s),
                experience_level: formData.get('experience'),
                max_results: parseInt(formData.get('maxResults')),
                sources: Array.from(document.querySelectorAll('input[name="sources"]:checked')).map(cb => cb.value)
            };
            
            // Show loading
            document.getElementById('results').style.display = 'block';
            document.getElementById('loading').style.display = 'block';
            document.getElementById('error').style.display = 'none';
            document.getElementById('stats').style.display = 'none';
            document.getElementById('jobList').innerHTML = '';
            document.getElementById('searchButton').disabled = true;
            
            try {
                const response = await fetch('/api/search', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(searchData)
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    displayResults(result);
                } else {
                    showError(result.error || 'An error occurred while searching for jobs');
                }
            } catch (error) {
                showError('Network error: ' + error.message);
            } finally {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('searchButton').disabled = false;
            }
        });
        
        function displayResults(result) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('error').style.display = 'none';
            
            if (result.jobs && result.jobs.length > 0) {
                displayStats(result);
                displayJobs(result.jobs);
            } else {
                showError('No jobs found matching your criteria. Try adjusting your search terms.');
            }
        }
        
        function displayStats(result) {
            const statsDiv = document.getElementById('stats');
            const stats = result.statistics || {};
            
            statsDiv.innerHTML = `
                <h3>Search Results</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value">${result.total_found || 0}</div>
                        <div class="stat-label">Total Jobs Found</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${result.sources_searched ? result.sources_searched.length : 0}</div>
                        <div class="stat-label">Sources Searched</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${(stats.average_match_score * 100).toFixed(1)}%</div>
                        <div class="stat-label">Avg Match Score</div>
                    </div>
                </div>
            `;
            statsDiv.style.display = 'block';
        }
        
        function displayJobs(jobs) {
            const jobListDiv = document.getElementById('jobList');
            
            jobListDiv.innerHTML = jobs.map(job => `
                <div class="job-card">
                    <div class="job-header">
                        <div>
                            <h3 class="job-title">${job.title}</h3>
                            <div class="job-company">${job.company}</div>
                            <div class="job-location">📍 ${job.location}</div>
                        </div>
                        <div class="job-source">${job.source}</div>
                    </div>
                    
                    <div class="job-description">
                        ${job.description.substring(0, 200)}${job.description.length > 200 ? '...' : ''}
                    </div>
                    
                    ${job.skills_required && job.skills_required.length > 0 ? `
                        <div class="job-skills">
                            <strong>Required Skills:</strong><br>
                            ${job.skills_required.map(skill => 
                                `<span class="skill-tag ${job.skills_matched && job.skills_matched.includes(skill) ? 'matched-skill' : ''}">${skill}</span>`
                            ).join('')}
                        </div>
                    ` : ''}
                    
                    <div class="job-meta">
                        <div class="match-score">
                            Match Score: ${(job.match_score * 100).toFixed(1)}%
                        </div>
                        <a href="${job.url}" target="_blank" class="job-link">View Job</a>
                    </div>
                </div>
            `).join('');
        }
        
        function showError(message) {
            const errorDiv = document.getElementById('error');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    """Serve the main web interface"""
    return render_template_string(HTML_TEMPLATE)

@app.route('/api/search', methods=['POST'])
def search_jobs():
    """Search for jobs across multiple sources"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('keywords') or not data.get('skills'):
            return jsonify({'error': 'Missing required fields: keywords, skills'}), 400
        
        # Create search query
        sources = []
        for source in data.get('sources', ['linkedin', 'naukri', 'indeed']):
            try:
                sources.append(JobSource(source))
            except ValueError:
                continue
        
        if not sources:
            return jsonify({'error': 'No valid sources specified'}), 400
        
        query = JobSearchQuery(
            keywords=data['keywords'],
            location=data.get('location', ''),
            skills=data['skills'],
            experience_level=data.get('experience_level'),
            employment_type=data.get('employment_type'),
            max_results=min(data.get('max_results', 10), 50),
            sources=sources
        )
        
        # Search for jobs with timeout handling
        try:
            result = job_aggregator.search_jobs(query)
            
            # Get statistics
            statistics = job_aggregator.get_job_statistics(result.jobs)
            
            # Convert to dictionary for JSON response
            response_data = result.to_dict()
            response_data['statistics'] = statistics
            
            return jsonify(response_data)
            
        except Exception as search_error:
            # Return empty results if search fails
            print(f"Search failed: {search_error}")
            return jsonify({
                'query': {
                    'keywords': data['keywords'],
                    'location': data['location'],
                    'skills': data['skills'],
                    'experience_level': data.get('experience_level'),
                    'employment_type': data.get('employment_type'),
                    'max_results': data.get('max_results', 10),
                    'sources': data.get('sources', ['linkedin'])
                },
                'jobs': [],
                'total_found': 0,
                'search_timestamp': datetime.now().isoformat(),
                'sources_searched': [],
                'errors': [f"Search failed: {str(search_error)}"],
                'statistics': {
                    'total_jobs': 0,
                    'average_match_score': 0,
                    'match_score_distribution': {'high (0.8-1.0)': 0, 'medium (0.5-0.8)': 0, 'low (0.0-0.5)': 0},
                    'source_distribution': {},
                    'top_companies': [],
                    'top_skills': []
                }
            })
        
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/api/jobs/<job_id>', methods=['GET'])
def get_job_details(job_id):
    """Get detailed information about a specific job"""
    # This would typically fetch from a database
    # For now, return a placeholder
    return jsonify({'error': 'Job details not implemented yet'}), 501

@app.route('/api/recommendations/<job_id>', methods=['GET'])
def get_job_recommendations(job_id):
    """Get skill recommendations for a specific job"""
    try:
        user_skills = request.args.getlist('skills')
        if not user_skills:
            return jsonify({'error': 'Skills parameter required'}), 400
        
        # This would typically fetch the job from a database
        # For now, return a placeholder
        return jsonify({'recommendations': []})
        
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '1.0.0'
    })

@app.route('/api/sources', methods=['GET'])
def get_available_sources():
    """Get list of available job sources"""
    return jsonify({
        'sources': [
            {'id': 'linkedin', 'name': 'LinkedIn', 'enabled': True},
            {'id': 'naukri', 'name': 'Naukri', 'enabled': True},
            {'id': 'indeed', 'name': 'Indeed', 'enabled': True}
        ]
    })

@app.route('/api/search-enhanced', methods=['POST'])
def search_jobs_enhanced():
    """Enhanced job search with on-demand caching"""
    try:
        print("\n" + "="*80)
        print("[API] /api/search-enhanced - Request received")
        print("="*80)
        
        data = request.get_json()
        print(f"[API] Request data: keywords={data.get('keywords')}, location={data.get('location')}, skills={data.get('skills')}")
        print(f"[API] Sources: {data.get('sources')}, page={data.get('page', 1)}, page_size={data.get('page_size', 20)}")
        
        # Validate required fields (location optional)
        if not data.get('keywords') or not data.get('skills'):
            print("[API] ERROR: Missing required fields")
            return jsonify({'error': 'Missing required fields: keywords, skills'}), 400
        
        requested_page = data.get('page', 1)
        requested_page_size = data.get('page_size', 20)
        
        # Normalize location for consistent cache keys
        # Use 'where' field from frontend (job search location), not 'location' (user's current location)
        requested_location = data.get('where', data.get('location', '')).strip()
        if requested_location:
            location_lower = requested_location.lower()
            if 'remote' in location_lower or location_lower in ['any', 'anywhere']:
                normalized_location = ''
            else:
                normalized_location = requested_location
        else:
            normalized_location = ''
        
        # CACHE COMMENTED OUT - Always fetch fresh data
        # Use normalized location for cache operations
        # cache_data = data.copy()
        # cache_data['location'] = normalized_location
        
        # # Check if specific page is cached
        # cached_page = job_cache.get_page(cache_data, requested_page)
        # if cached_page and len(cached_page.get('jobs', [])) > 0:
        #     print(f"[API] CACHE HIT - Returning cached page {requested_page}, jobs={len(cached_page.get('jobs', []))}")
        #     print(f"[API] Cached page pagination: {cached_page.get('pagination', {})}")
        #     return jsonify(cached_page)
        
        # # Check if there's any cache at all for this search
        # # Always check if page 1 exists in cache
        # page_one_check = job_cache.get_page(cache_data, 1)
        
        # # If page > 1 is requested, check if we have enough data
        # if requested_page > 1:
        #     if page_one_check and len(page_one_check.get('jobs', [])) > 0:
        #         # Page 1 has data, check if the requested page exists in cache
        #         total_cached_jobs = len(page_one_check.get('jobs', []))
        #         total_pages = (total_cached_jobs + max(requested_page_size, 1) - 1) // max(requested_page_size, 1)
                
        #         # If the requested page is beyond what we have cached, return empty page
        #         if requested_page > total_pages:
        #             print(f"[API] Page {requested_page} requested but only {total_pages} pages available in cache")
        #             print(f"[API] Returning empty page with proper pagination")
        #             return jsonify({
        #                 'jobs': [],
        #                 'total_found': total_cached_jobs,
        #                 'pagination': {
        #                     'page': requested_page,
        #                     'page_size': requested_page_size,
        #                     'total_pages': total_pages,
        #                     'has_next_page': False,
        #                     'has_previous_page': requested_page > 1
        #                 },
        #                 'errors': ['No results available for this page. Please fetch more jobs.']
        #             })
        #         # Otherwise, continue to fetch from cache
        
        # # If no cache at all, we need to fetch
        # if not page_one_check or len(page_one_check.get('jobs', [])) == 0:
        #     print(f"[API] No cache found for this search - will fetch from API")
        
        # No cache found - need to fetch from API
        print(f"[API] CACHE DISABLED - Fetching data from API")
        print(f"[API] Requested page: {requested_page}, Page size: {requested_page_size}")
        
        # Create search query with enhanced sources
        # All sources supported by the multi-portal aggregator
        allowed_sources = {
            'linkedin', 'naukri', 'indeed', 'instahyre', 'remoteok', 'remotejobs', 
            'foundit', 'monster', 'hrist', 'flexjobs', 'adzuna', 'jooble', 'github', 'google'
        }
        req_sources = data.get('sources', ['indeed', 'remoteok', 'adzuna', 'jooble'])
        # Filter to only allowed sources
        req_sources = [s for s in req_sources if s in allowed_sources]
        
        # If no valid sources, use default fast set (avoid Google and slow sources by default)
        if not req_sources:
            req_sources = ['indeed', 'remoteok', 'adzuna', 'jooble']

        # Log received and effective sources
        print(f"[API] Received sources: {data.get('sources')}")
        print(f"[API] Effective sources: {req_sources}")

        sources = []
        for source in req_sources:
            if source not in allowed_sources:
                print(f"[API] Skipping invalid source: {source}")
                continue
            try:
                sources.append(JobSource(source))
                print(f"[API] Added source: {source}")
            except ValueError as e:
                print(f"[API] Failed to add source {source}: {e}")
                continue
        
        if not sources:
            print("[API] ERROR: No valid sources")
            return jsonify({'error': 'No valid sources specified'}), 400
        
        # Filter sources to only those that are actually enabled in the scraper
        # Get the set of enabled sources from the aggregator
        enabled_source_names = {s.value for s in enhanced_job_aggregator.multi_portal_aggregator.scrapers.keys()}
        
        # Filter sources to only enabled ones
        original_count = len(sources)
        sources = [s for s in sources if s in [JobSource(name) for name in enabled_source_names]]
        
        if len(sources) < original_count:
            disabled = [s.value for s in sources if s not in sources]
            print(f"[API] Warning: Some requested sources are disabled: {disabled}")
        
        if not sources:
            print("[API] ERROR: All requested sources are disabled")
            return jsonify({'error': 'All requested sources are disabled. Available sources: ' + ', '.join(enabled_source_names)}), 400
        
        print(f"[API] Total sources to search: {len(sources)}")
        
        # Use already normalized location from earlier
        query_location = normalized_location
        
        print(f"[API] Requested location: '{requested_location}'")
        print(f"[API] Normalized location: '{normalized_location}'")
        print(f"[API] where_filter: {data.get('where', '')}")
        print(f"[API] Query location: '{query_location}'")

        # Calculate how many jobs to fetch based on requested page
        # Fetch only up to the requested page to improve latency
        jobs_to_fetch = max(20, requested_page * requested_page_size)
        
        query = JobSearchQuery(
            keywords=data['keywords'],
            location=query_location,  # Use requested location or empty for remote
            skills=data['skills'],
            experience_level=data.get('experience_level'),
            employment_type=data.get('employment_type'),
            max_results=jobs_to_fetch,
            sources=sources,
            page=1,
            page_size=jobs_to_fetch
        )
        
        # Search for jobs with enhanced aggregator
        try:
            print(f"[API] Calling enhanced_job_aggregator.search_jobs()...")
            result = enhanced_job_aggregator.search_jobs(query)
            print(f"[API] Search completed: found {len(result.jobs)} jobs from {len(result.sources_searched)} sources")
            
            # REMOTE FILTER COMMENTED OUT - Too strict, removing all jobs
            # Apply strict 'Remote' filter server-side if requested
            # if requested_location and 'remote' in requested_location.lower() and result.jobs:
            #     remote_tokens = [
            #         'remote', 'work from home', 'wfh', 'anywhere', 'worldwide',
            #         'location independent', 'distributed', 'fully remote', 'home-based',
            #         'work-from-home'
            #     ]
            #     filtered_jobs = []
            #     for job in result.jobs:
            #         loc = (job.location or '').lower()
            #         desc = (job.description or '').lower()
            #         title = (job.title or '').lower()
            #         text = f"{title} {loc} {desc}"
            #         if any(tok in text for tok in remote_tokens):
            #             filtered_jobs.append(job)
            #     result.jobs = filtered_jobs
            #     result.total_found = len(filtered_jobs)
            
            # Get statistics
            statistics = enhanced_job_aggregator.get_job_statistics(result.jobs)
            
            print(f"[API] DEBUG: result.jobs length: {len(result.jobs)}")
            print(f"[API] DEBUG: result.total_found: {result.total_found}")
            
            # Convert to dictionary for JSON response
            response_data = result.to_dict()
            response_data['statistics'] = statistics
            
            # Estimate pagination when fetching only up to requested page
            fetched_count = len(result.jobs)
            batch_full = fetched_count >= jobs_to_fetch
            estimated_total = max(
                fetched_count,
                requested_page * requested_page_size + (1 if batch_full else 0)
            )
            # Override totals for incremental paging UX
            response_data['estimated_total'] = estimated_total
            response_data['total_found'] = estimated_total
            
            # Apply pagination to jobs
            total_pages = (estimated_total + max(requested_page_size, 1) - 1) // max(requested_page_size, 1)
            start_idx = (requested_page - 1) * requested_page_size
            end_idx = start_idx + requested_page_size
            paginated_jobs = response_data['jobs'][start_idx:end_idx]
            response_data['jobs'] = paginated_jobs
            
            # Update response pagination metadata
            response_data['pagination'] = {
                'page': requested_page,
                'page_size': requested_page_size,
                'total_pages': total_pages if batch_full else max(total_pages, requested_page),
                'has_next_page': batch_full,
                'has_previous_page': requested_page > 1
            }
            
            print(f"[API] DEBUG: Returning response with {len(response_data['jobs'])} jobs, has_next_page={response_data['pagination']['has_next_page']}, total_pages={response_data['pagination']['total_pages']}")
            
            return jsonify(response_data)
            
        except Exception as search_error:
            # Return empty results if search fails
            print(f"Enhanced search failed: {search_error}")
            return jsonify({
                'query': {
                    'keywords': data['keywords'],
                    'location': data['location'],
                    'skills': data['skills'],
                    'experience_level': data.get('experience_level'),
                    'employment_type': data.get('employment_type'),
                    'max_results': data.get('max_results', 20),
                    'sources': data.get('sources', ['linkedin'])
                },
                'jobs': [],
                'total_found': 0,
                'search_timestamp': datetime.now().isoformat(),
                'sources_searched': [],
                'errors': [f"Enhanced search failed: {str(search_error)}"],
                'statistics': {
                    'total_jobs': 0,
                    'average_match_score': 0,
                    'match_score_distribution': {'high (0.8-1.0)': 0, 'medium (0.5-0.8)': 0, 'low (0.0-0.5)': 0},
                    'source_distribution': {},
                    'top_companies': [],
                    'top_skills': []
                }
            })
        
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/api/cache/stats', methods=['GET'])
def cache_stats():
    """Get cache statistics"""
    try:
        stats = job_cache.get_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': f'Failed to get cache stats: {str(e)}'}), 500

@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """Clear all cached results"""
    try:
        job_cache.clear()
        return jsonify({'message': 'Cache cleared successfully'})
    except Exception as e:
        return jsonify({'error': f'Failed to clear cache: {str(e)}'}), 500

@app.route('/api/contact/email', methods=['POST'])
def contact_via_email():
    """Send a predefined email to a hiring manager via SMTP"""
    try:
        data = request.get_json()
        if not data.get('to') or not data.get('subject') or not data.get('message'):
            return jsonify({'error': 'Missing required fields: to, subject, message'}), 400

        smtp_host = os.getenv('SMTP_HOST')
        smtp_port = int(os.getenv('SMTP_PORT', '587'))
        smtp_user = os.getenv('SMTP_USER')
        smtp_pass = os.getenv('SMTP_PASS')
        smtp_from = os.getenv('SMTP_FROM') or smtp_user

        if not all([smtp_host, smtp_user, smtp_pass, smtp_from]):
            return jsonify({'error': 'SMTP configuration missing'}), 500

        msg = MIMEMultipart()
        msg['From'] = smtp_from
        msg['To'] = data['to']
        msg['Subject'] = data['subject']
        msg.attach(MIMEText(data['message'], 'plain'))

        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_from, [data['to']], msg.as_string())

        return jsonify({'status': 'sent'})
    except Exception as e:
        return jsonify({'error': f'Email send failed: {str(e)}'}), 500

if __name__ == '__main__':
    print("🚀 Starting Job Scraper API...")
    print("📊 Available endpoints:")
    print("  • Web Interface: http://localhost:5000")
    print("  • API Search: POST http://localhost:5000/api/search")
    print("  • Health Check: GET http://localhost:5000/api/health")
    print("  • Available Sources: GET http://localhost:5000/api/sources")
    print("\n🔍 Ready to search for jobs!")
    
    app.run(host='0.0.0.0', port=5000, debug=True)
