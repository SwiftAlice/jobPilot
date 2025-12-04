"""
Job scraper Flask API application
"""
from flask import Flask, request, jsonify, render_template_string, Response
from flask_cors import CORS
import json
from datetime import datetime
from typing import List, Dict, Any

# Legacy imports removed - using new architecture only
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import time
import psycopg2
import hashlib

# New architecture imports
try:
    from deps import get_db_pool, get_redis_client
    from ranking.rank import rank_jobs
    from scoring import compute_unified_score
    from utils.search_queue import enqueue_search_query, get_cache_key
    NEW_ARCH_ENABLED = True
except Exception as e:
    print(f"[App] New arch imports failed: {e}")
    NEW_ARCH_ENABLED = False

# Optional import for geonames aliases
try:
    from utils.geonames import get_city_aliases as _get_city_aliases  # type: ignore
except Exception:
    _get_city_aliases = None

app = Flask(__name__)
CORS(app)

# Ensure UTF-8 encoding for JSON responses
app.config['JSON_AS_ASCII'] = False  # This ensures Unicode characters are not escaped

# Legacy aggregators removed - using new architecture only

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
            <p>Find your dream job across LinkedIn, Indeed and more!</p>
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
                const response = await fetch('/api/search-new', {
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

@app.route('/api/geo/city-aliases', methods=['GET'])
def geo_city_aliases():
    """
    Return alias names for a given city using geonames-backed function.
    Example: /api/geo/city-aliases?city=bangalore
    """
    city = (request.args.get('city') or '').strip()
    if not city:
        return jsonify({'aliases': []})
    aliases: List[str] = []
    try:
        if _get_city_aliases:
            # Include the original city as well
            alias_set = set(_get_city_aliases(city.lower()) or [])
            alias_set.add(city.lower())
            aliases = sorted(alias_set)
        else:
            # Fallback: just echo the input
            aliases = [city.lower()]
    except Exception as e:
        print(f"[API] geo_city_aliases error: {e}")
        aliases = [city.lower()]
    return jsonify({'aliases': aliases})

# Legacy /api/search endpoint removed - use /api/search-new instead

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

# Legacy /api/search-agent endpoint removed - use /api/search-new instead
# Legacy /api/keywords-agent endpoint removed

@app.route('/api/sources', methods=['GET'])
def get_available_sources():
    """Get list of available job sources"""
    return jsonify({
        'sources': [
            {'id': 'linkedin', 'name': 'LinkedIn', 'enabled': True},
            {'id': 'indeed', 'name': 'Indeed', 'enabled': True},
            {'id': 'iimjobs', 'name': 'IIMJobs', 'enabled': True}
        ]
    })

# Legacy /api/search-enhanced endpoint removed - use /api/search-new instead
# Legacy /api/cache/stats endpoint removed (used legacy job_cache)

@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """Clear all cached search results (Redis cache) and cooldowns"""
    try:
        redis_client = get_redis_client()
        if not redis_client:
            return jsonify({'message': 'Redis not configured, nothing to clear'}), 200
        
        # Clear all search cache keys (pattern: search:*)
        keys_deleted = 0
        cooldown_keys_deleted = 0
        try:
            # Use SCAN to find all keys matching the pattern (more efficient for large caches)
            # Note: decode_responses=False, so keys are bytes
            cursor = 0
            while True:
                cursor, keys = redis_client.scan(cursor, match="search:*", count=100)
                if keys:
                    # Decode keys for logging
                    key_strs = [k.decode() if isinstance(k, bytes) else k for k in keys]
                    print(f"[Cache-Clear] Found {len(keys)} keys: {key_strs[:5]}...")  # Show first 5
                    keys_deleted += len(keys)
                    redis_client.delete(*keys)
                if cursor == 0:
                    break
        except Exception as scan_error:
            # Fallback: try KEYS (less efficient but works)
            print(f"[Cache-Clear] SCAN failed, using KEYS fallback: {scan_error}")
            try:
                keys = redis_client.keys("search:*")
                if keys:
                    key_strs = [k.decode() if isinstance(k, bytes) else k for k in keys]
                    print(f"[Cache-Clear] Found {len(keys)} keys via KEYS: {key_strs[:5]}...")
                    keys_deleted = len(keys)
                    redis_client.delete(*keys)
            except Exception as keys_error:
                print(f"[Cache-Clear] KEYS also failed: {keys_error}")
                import traceback
                traceback.print_exc()
        
        # Also clear cooldown keys (pattern: refresh_cooldown:*)
        try:
            cursor = 0
            while True:
                cursor, keys = redis_client.scan(cursor, match="refresh_cooldown:*", count=100)
                if keys:
                    cooldown_keys_deleted += len(keys)
                    redis_client.delete(*keys)
                if cursor == 0:
                    break
        except Exception as cooldown_scan_error:
            try:
                keys = redis_client.keys("refresh_cooldown:*")
                if keys:
                    cooldown_keys_deleted = len(keys)
                    redis_client.delete(*keys)
            except Exception:
                pass
        
        print(f"[Cache-Clear] Cleared {keys_deleted} cache keys and {cooldown_keys_deleted} cooldown keys")
        return jsonify({'message': f'Cache and cooldowns cleared successfully ({keys_deleted} cache keys, {cooldown_keys_deleted} cooldown keys deleted)'})
    except Exception as e:
        print(f"[Cache-Clear] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to clear cache: {str(e)}'}), 500

@app.route('/api/search-new', methods=['GET', 'POST'])
def search_new():
    """
    New architecture search endpoint using Postgres FTS + Redis cache.
    Falls back to old search if new arch not enabled.
    """
    try:
        print("[Search-New] request received")
    except Exception:
        pass
    if not NEW_ARCH_ENABLED:
        return jsonify({'error': 'New architecture not enabled'}), 503
    
    try:
        if request.method == 'GET':
            data = request.args.to_dict()
        else:
            data = request.get_json() or {}
        
        keywords = data.get('keywords', [])
        skills_in = data.get('skills', [])
        # Prefer explicit user_id from body; fallback to header 'X-User-Id'
        user_id = data.get('user_id') or data.get('userId') or request.headers.get('X-User-Id')
        if isinstance(keywords, str):
            keywords = [k.strip() for k in keywords.split(',') if k.strip()]
        if isinstance(skills_in, str):
            skills_in = [s.strip() for s in skills_in.split(',') if s.strip()]
        elif isinstance(skills_in, list):
            skills_in = [str(s).strip() for s in skills_in if str(s).strip()]
        else:
            skills_in = []
        location = data.get('location')  # User's current location (e.g., "Bangalore, India")
        resume_signature = data.get('resume_signature') or ''
        min_match_score = float(os.getenv('MIN_MATCH_SCORE', '0.45'))
        min_keyword_score = float(os.getenv('MIN_KEYWORD_SCORE', '0.5'))
        min_skill_score = float(os.getenv('MIN_SKILL_SCORE', '0.35'))
        
        # Log when user_id is missing (we don't force default here to keep worker user-specific scoring accurate)
        if not user_id:
            print(f"[Search-New] ⚠️  No user_id provided in body or 'X-User-Id' header; background scoring may be skipped.")
        experience_level = data.get('experience_level')
        remote_type = data.get('remote_type')
        where_in = data.get('where')  # Search location preference ("Any", "Remote", or specific location)
        
        # Debug: log received location
        print(f"[Search-New] Received location='{location}', where='{where_in}', remote_type='{remote_type}'")
        
        # Extract user's location components for tiered matching when "Any" is selected
        user_location_city = None
        user_location_country = None
        if location and isinstance(location, str):
            # Parse location like "Bangalore, India" or "Bangalore, IN"
            parts = [p.strip() for p in location.split(',')]
            if len(parts) >= 2:
                user_location_city = parts[0]
                user_location_country = parts[-1]  # Last part is usually country
            elif len(parts) == 1:
                # Could be just city or just country
                user_location_city = parts[0]
        
        # If remote_type not explicitly provided, infer from 'where' (remote/hybrid/onsite)
        try:
            if not remote_type and isinstance(where_in, str):
                where_l = where_in.strip().lower()
                if where_l in ('remote', 'hybrid', 'onsite'):
                    remote_type = where_l
        except Exception:
            pass
        
        # Determine if we should use tiered location matching (when "Any" is selected)
        # "Any" is represented as empty string, None, or the string "any"/"anywhere"
        use_tiered_location = False
        search_location = None  # Location to use for filtering
        if where_in and isinstance(where_in, str):
            where_l = where_in.strip().lower()
            if where_l in ('any', 'anywhere', ''):
                use_tiered_location = True
                search_location = None  # Don't filter by location, but prioritize by proximity
            else:
                search_location = where_in  # Use the specified location
        else:
            # where_in is None, undefined, or empty - treat as "Any"
            use_tiered_location = True  # Default to tiered if where is not specified
            search_location = None
        page = int(data.get('page', 1))
        page_size = int(data.get('page_size', 20))
        # Default to all enabled sources if none explicitly provided
        sources = data.get('sources', ['remoteok', 'adzuna', 'jooble', 'linkedin', 'iimjobs'])
        # Filter out removed sources (naukri)
        if sources:
            sources = [s for s in sources if str(s).lower() != 'naukri']
        linkedin_requested = any(str(s).lower() == 'linkedin' for s in (sources or []))
        
        if not keywords:
            return jsonify({'error': 'keywords required'}), 400
        try:
            print(f"[Search-New] sources={sources}")
        except Exception:
            pass
        
        # Optional flags
        no_cache = str(data.get('no_cache', '')).lower() in ('1', 'true', 'yes')
        force_linkedin = str(data.get('force_linkedin', '')).lower() in ('1', 'true', 'yes')

        # Helper: apply strict title/keyword filter to a job list
        def _filter_jobs_by_title_keywords(jobs, phrases_normalized):
            if not phrases_normalized:
                return jobs
            filtered = []
            for job in jobs or []:
                title_raw = str(job.get('title') or '')
                title_norm = " ".join(title_raw.lower().split())
                if not title_norm:
                    continue
                title_words = title_norm.split()
                for phrase in phrases_normalized:
                    pw = phrase.split()
                    if not pw:
                        continue
                    if pw == title_words:
                        filtered.append(job)
                        break
                    for i in range(len(title_words) - len(pw) + 1):
                        if title_words[i:i+len(pw)] == pw:
                            filtered.append(job)
                            break
                    else:
                        continue
                    break
            return filtered

        # Precompute normalized phrases once
        normalized_phrases = [" ".join(str(p).lower().split()) for p in keywords if str(p).strip()]

        # Check Redis cache (include sources, skills, and where in key to avoid cross-source hits)
        redis_client = get_redis_client()
        # Normalize skills for cache key (sort to ensure consistent keys)
        skills_normalized = sorted(skills_in) if skills_in else []
        sources_normalized = sorted(sources) if sources else []
        cache_key = f"search:{get_cache_key(keywords, location, experience_level=experience_level, remote_type=remote_type, where=where_in, page=page, page_size=page_size, sources=sources_normalized, skills=skills_normalized)}"
        cached = None
        if redis_client and not no_cache:
            try:
                cached_bytes = redis_client.get(cache_key)
                if cached_bytes:
                    cached = json.loads(cached_bytes.decode())
                    print(f"[Search-New] Cache hit: {cache_key}")
                    # Enqueue a background refresh only if not recently refreshed (cooldown: 5 minutes, per-page)
                    refresh_cooldown_key = f"refresh_cooldown:{get_cache_key(keywords, location, experience_level=experience_level, remote_type=remote_type, where=where_in, sources=sources_normalized, skills=skills_normalized, page=page)}"
                    should_refresh = True
                    if redis_client:
                        try:
                            last_refresh = redis_client.get(refresh_cooldown_key)
                            if last_refresh:
                                # Already refreshed recently, skip
                                should_refresh = False
                                print(f"[Search-New] Skipping refresh (cooldown active)")
                        except Exception:
                            pass
                    
                    if should_refresh:
                        try:
                            # Filter out removed sources and add linkedin only if not explicitly requesting single source
                            filtered_sources = [s for s in (sources or []) if str(s).lower() != 'naukri']
                            # Only auto-add linkedin if multiple sources or no sources specified
                            if len(filtered_sources) > 1 or not filtered_sources:
                                refresh_sources = list({*filtered_sources, 'linkedin'})
                            else:
                                refresh_sources = filtered_sources  # Respect single source selection
                            # When "Any" is selected, pass user's location (not empty) so worker can make parallel calls
                            # Worker will make parallel calls: exact location, country, then everywhere
                            # When a specific location is selected, just pass that location
                            fetch_location = location if use_tiered_location else (search_location or location or "")
                            # When "Any" is selected, fetch more jobs (75) to have a good pool for location-based ranking
                            # Otherwise, fetch page_size (25) per page
                            fetch_max_results = 75 if use_tiered_location else page_size
                            msg_id = enqueue_search_query(
                                keywords=keywords,
                                location=fetch_location,  # User's location (for parallel tiered fetching) or search location
                                sources=refresh_sources,
                                experience_level=experience_level,
                                remote_type=remote_type,
                                skills=skills_in,
                                max_results=fetch_max_results,  # 75 when "Any", 25 otherwise
                                page=page,
                                page_size=page_size,
                                user_id=user_id,
                            )
                            print(f"[Search-New] Enqueued background refresh on cache hit: {msg_id}")
                            # Set cooldown (5 minutes)
                            if redis_client:
                                try:
                                    redis_client.setex(refresh_cooldown_key, 300, "1")
                                except Exception:
                                    pass
                        except Exception as ee:
                            print(f"[Search-New] Enqueue error on cache hit: {ee}")
                        try:
                            cached['refetch_enqueued'] = True
                        except Exception:
                            pass
                    # Apply strict title/keyword filter even on cached results
                    try:
                        if cached and isinstance(cached, dict) and 'jobs' in cached:
                            cached_jobs = cached.get('jobs') or []
                            filtered_jobs = _filter_jobs_by_title_keywords(cached_jobs, normalized_phrases)
                            cached['jobs'] = filtered_jobs
                            print(f"[Search-New] Cache hit after title filter: {len(filtered_jobs)} jobs")
                    except Exception as _fe:
                        print(f"[Search-New] Title filter on cache failed: {_fe}")
                    return jsonify(cached)
            except Exception as e:
                print(f"[Search-New] Cache read error: {e}")
        
        # Enqueue async fetch if not in cache
        db_pool = get_db_pool()
        if not db_pool:
            return jsonify({'error': 'Database not configured or connection failed'}), 503
        
        # Enqueue fetch task only if not recently enqueued (cooldown: 5 minutes, per-page)
        refresh_cooldown_key = f"refresh_cooldown:{get_cache_key(keywords, location, experience_level=experience_level, remote_type=remote_type, where=where_in, sources=sources_normalized, skills=skills_normalized, page=page)}"
        should_enqueue = True
        if redis_client:
            try:
                last_enqueue = redis_client.get(refresh_cooldown_key)
                if last_enqueue:
                    should_enqueue = False
                    print(f"[Search-New] ⏸️  Skipping enqueue (cooldown active for key: {refresh_cooldown_key[:50]}...)")
                else:
                    print(f"[Search-New] ✅ No cooldown, will enqueue (key: {refresh_cooldown_key[:50]}...)")
            except Exception as cooldown_err:
                print(f"[Search-New] ⚠️  Cooldown check error: {cooldown_err}")
                pass
        else:
            print(f"[Search-New] ⚠️  No Redis client, cannot check cooldown")
        
        print(f"[Search-New] 🔍 Enqueue check: should_enqueue={should_enqueue}, redis_client={'available' if redis_client else 'None'}")
        
        if should_enqueue:
            try:
                # Filter out removed sources and add linkedin only if not explicitly requesting single source
                filtered_sources = [s for s in (sources or []) if str(s).lower() != 'naukri']
                # Only auto-add linkedin if multiple sources or no sources specified
                if len(filtered_sources) > 1 or not filtered_sources:
                    refresh_sources = list({*filtered_sources, 'linkedin'})
                else:
                    refresh_sources = filtered_sources  # Respect single source selection
                print(f"[Search-New] 🔄 About to enqueue: refresh_sources={refresh_sources}, keywords={keywords[:3] if keywords else []}...")
                # When "Any" is selected, pass user's location (not empty) so worker can make parallel calls
                # Worker will make parallel calls: exact location, country, then everywhere
                # When a specific location is selected, just pass that location
                # IMPORTANT: Don't use remote_type or where_in as location - use the actual user location
                if use_tiered_location:
                    # "Any" selected - use user's actual location for tiered fetching
                    fetch_location = location or ""
                else:
                    # Specific location selected - use search_location or fallback to user location
                    fetch_location = search_location or location or ""
                
                # Debug: log what location we're passing to worker
                print(f"[Search-New] Enqueue location: fetch_location='{fetch_location}', use_tiered_location={use_tiered_location}, user_location='{location}', search_location='{search_location}'")
                # When "Any" is selected, fetch more jobs (75) to have a good pool for location-based ranking
                # Otherwise, fetch page_size (25) per page
                fetch_max_results = 75 if use_tiered_location else page_size
                msg_id = enqueue_search_query(
                    keywords=keywords,
                    location=fetch_location,  # User's location (for parallel tiered fetching) or search location
                    sources=refresh_sources,
                    experience_level=experience_level,
                    remote_type=remote_type,
                    skills=skills_in,
                    max_results=fetch_max_results,  # 75 when "Any", 25 otherwise
                    page=page,
                    page_size=page_size,
                    user_id=user_id,  # Pass user_id to worker for scoring
                )
                print(f"[Search-New] ✅ Enqueued fetch: {msg_id} (max_results={fetch_max_results}, location='{fetch_location}', sources={refresh_sources})")
                # Set cooldown (5 minutes)
                if redis_client:
                    try:
                        redis_client.setex(refresh_cooldown_key, 300, "1")
                    except Exception:
                        pass
            except Exception as e:
                print(f"[Search-New] Enqueue error: {e}")
        
        # Query database for existing results (with retry on connection errors)
        query_text = " ".join(keywords)
        jobs = []
        has_next = False
        max_db_retries = 2
        conn = None
        for db_attempt in range(max_db_retries):
            try:
                conn = db_pool.getconn()
                if not conn:
                    if db_attempt < max_db_retries - 1:
                        print(f"[Search-New] DB connection failed (attempt {db_attempt + 1}), retrying...")
                        time.sleep(1)
                        continue
                    return jsonify({'error': 'Database connection failed'}), 503
                
                # Set a short statement timeout to avoid long waits
                try:
                    with conn.cursor() as cur:
                        cur.execute("SET LOCAL statement_timeout = '5000ms'")
                except Exception:
                    pass
                # Debug: log query parameters
                print(f"[Search-New] DB query params: keywords={keywords}, query_text='{query_text}', search_location='{search_location}', user_location='{location}', use_tiered_location={use_tiered_location}, user_city='{user_location_city}', user_country='{user_location_country}', page={page}, page_size={page_size}")
                
                # Fetch limit+1 to check if there are more results
                # Always pass user location for tiered ranking (even when not "Any")
                # This ensures all jobs are shown, but location-matching jobs are ranked higher
                offset = (page - 1) * page_size
                all_jobs = rank_jobs(
                    conn,
                    query_text=query_text,
                    location=None,  # Never filter by location - only use for ranking
                    experience_level=experience_level,
                    remote_type=remote_type,
                    limit=page_size + 1,  # Fetch one extra to check for next page
                    offset=offset,
                    query_keywords=keywords,  # Pass original keyword phrases
                    user_location_city=user_location_city,  # Always pass for tiered ranking
                    user_location_country=user_location_country,  # Always pass for tiered ranking
                    user_id=user_id,  # Order by user-specific scores when available
                )
                print(f"[Search-New] Page {page}: Fetched {len(all_jobs)} jobs from rank_jobs (offset={offset}, requested {page_size + 1})")
                # Log job IDs for debugging duplicate pages
                if all_jobs:
                    job_ids = [j.get('id') for j in all_jobs[:10]]
                    print(f"[Search-New] Page {page}: First 10 job IDs: {job_ids}")
                if len(all_jobs) < page_size:
                    print(f"[Search-New] ⚠️  Only {len(all_jobs)} jobs returned, expected at least {page_size}. Will try fallback to show more jobs.")

                unified_context = {
                    'keywords': keywords,
                    'skills': skills_in,
                    'location': location,
                    'experience_level': experience_level,
                    'remote_preference': remote_type or where_in,
                }
                try:
                    profile_signature_source = {
                        'keywords': keywords,
                        'skills': skills_in,
                        'location': location,
                        'experience_level': experience_level,
                        'remote_preference': remote_type or where_in,
                        'resume_signature': resume_signature or ''
                    }
                    profile_signature = hashlib.sha1(json.dumps(profile_signature_source, sort_keys=True).encode()).hexdigest()[:16]
                except Exception:
                    profile_signature = 'default'
                
                # Fetch search location aliases once (for efficiency)
                search_location_aliases = None
                if location:
                    try:
                        from utils.geonames import get_city_aliases
                        from scoring.unified import _extract_city_from_location
                        search_city = _extract_city_from_location(location.lower())
                        if search_city:
                            search_location_aliases = {search_city} | set(get_city_aliases(search_city))
                            print(f"[Search-New] ✅ Fetched {len(search_location_aliases)} aliases for search location '{location}': {sorted(list(search_location_aliases))[:10]}")
                    except Exception as e:
                        print(f"[Search-New] ⚠️  Failed to fetch search location aliases: {e}")

                def apply_unified_scoring(records):
                    """
                    Calculate user-specific match scores for jobs.
                    Scores are stored in user_job_scores table and cached in Redis (keyed by user_id + job_id).
                    """
                    import hashlib
                    import json
                    
                    redis_client = get_redis_client()
                    # Cache key now incorporates profile signature so stale scores aren't reused
                    cache_prefix = f"job_score:{user_id}:{profile_signature}:"
                    
                    for idx, job in enumerate(records):
                        job_id = job.get('id')
                        job_id_str = str(job_id) if job_id else None
                        has_description = bool(job.get('description'))
                        
                        # Try to get cached score first (if Redis available)
                        cached_score = None
                        if redis_client and job_id_str:
                            try:
                                cache_key = f"{cache_prefix}{job_id_str}"
                                cached = redis_client.get(cache_key)
                                if cached:
                                    cached_score = float(cached.decode())
                                    if idx < 5:
                                        print(f"[Search-New] Job {idx+1}: Using cached score {cached_score*100:.1f}% (user_id={user_id}, has_desc={has_description})")
                            except Exception:
                                pass
                        
                        # Try to get score from DB (user_job_scores table)
                        db_score = None
                        stored_details = None
                        if job_id and conn:
                            try:
                                with conn.cursor() as score_cur:
                                    # job_id from DB query - convert to string (jobs.id is TEXT in actual DB)
                                    job_id_for_query = str(job_id)
                                    if isinstance(job_id, (memoryview, bytes, bytearray)):
                                        # Convert bytes/hex to string
                                        if isinstance(job_id, memoryview):
                                            job_id_for_query = job_id.tobytes().hex()
                                        else:
                                            job_id_for_query = bytes(job_id).hex()
                                    
                                    score_cur.execute(
                                        "SELECT last_match_score, match_components, match_details FROM user_job_scores WHERE user_id = %s AND job_id = %s",
                                        (user_id, job_id_for_query)
                                    )
                                    score_row = score_cur.fetchone()
                                    if score_row:
                                        details_blob = score_row[2]
                                        stored_profile_hash = None
                                        stored_details = None
                                        if details_blob:
                                            try:
                                                if isinstance(details_blob, dict):
                                                    stored_details = details_blob
                                                else:
                                                    stored_details = json.loads(details_blob)
                                                stored_profile_hash = stored_details.get('profile_hash')
                                            except Exception:
                                                stored_details = None
                                        if stored_profile_hash == profile_signature:
                                            db_score = float(score_row[0]) if score_row[0] is not None else None
                                            if stored_details:
                                                job['match_details'] = stored_details
                                            if db_score is not None and idx < 5:
                                                print(f"[Search-New] Job {idx+1}: Found DB score {db_score*100:.1f}% (user_id={user_id}, profile={profile_signature})")
                                        else:
                                            db_score = None  # Ignore stale scores
                            except Exception as db_score_err:
                                if idx < 3:
                                    print(f"[Search-New] DB score lookup error: {db_score_err}")
                                pass
                        
                        # Calculate score (use cache or DB if available, otherwise compute)
                        if cached_score is not None:
                            job['match_score'] = cached_score
                            # Still compute components for display
                            try:
                                scoring = compute_unified_score(
                                    job,
                                    keywords=unified_context['keywords'],
                                    skills=unified_context['skills'],
                                    location=unified_context['location'],
                                    experience_level=unified_context['experience_level'],
                                    remote_preference=unified_context['remote_preference'],
                                    search_location_aliases=search_location_aliases,
                                )
                                job['match_components'] = scoring.get('components', {})
                                job['match_details'] = scoring.get('details', {})
                            except Exception:
                                pass
                        elif db_score is not None:
                            # Use DB score (but still compute components for display)
                            job['match_score'] = db_score
                            # Preserve _user_score if it exists (from rank_jobs join) - this is the source of truth for pagination
                            # If _user_score exists, use it instead of db_score to maintain consistency with rank_jobs ordering
                            if job.get('_user_score') is not None:
                                # _user_score is already set from rank_jobs - use it as the authoritative score
                                job['match_score'] = job['_user_score']
                            else:
                                # No _user_score, set it from db_score
                                job['_user_score'] = db_score
                                job['match_score'] = db_score
                            try:
                                scoring = compute_unified_score(
                                    job,
                                    keywords=unified_context['keywords'],
                                    skills=unified_context['skills'],
                                    location=unified_context['location'],
                                    experience_level=unified_context['experience_level'],
                                    remote_preference=unified_context['remote_preference'],
                                    search_location_aliases=search_location_aliases,
                                )
                                job['match_components'] = scoring.get('components', {})
                                job['match_details'] = scoring.get('details', {})
                            except Exception:
                                pass
                        else:
                            # No cache, compute score
                            try:
                                scoring = compute_unified_score(
                                    job,
                                    keywords=unified_context['keywords'],
                                    skills=unified_context['skills'],
                                    location=unified_context['location'],
                                    experience_level=unified_context['experience_level'],
                                    remote_preference=unified_context['remote_preference'],
                                    search_location_aliases=search_location_aliases,
                                )
                                match_score = scoring['score']
                                
                                # Apply location tier boost (user-specific, not stored in DB)
                                if unified_context['location'] and user_location_city:
                                    try:
                                        from ranking.rank import _city_matches_with_aliases, get_country_variants
                                        from utils.geonames import get_city_aliases
                                        
                                        def country_matches(job_location: str, country_variants: set) -> bool:
                                            job_loc_lower = job_location.lower()
                                            return any(variant.lower() in job_loc_lower for variant in country_variants)
                                        
                                        user_location_parts = (unified_context['location'] or "").lower().split(",")
                                        user_city = user_location_parts[0].strip() if user_location_parts else None
                                        user_country = user_location_parts[-1].strip() if len(user_location_parts) > 1 else None
                                        
                                        tier_boost = {
                                            'exact': 1.3,
                                            'city': 1.2,
                                            'country': 1.1,
                                            'other': 1.0,
                                        }
                                        
                                        job_location = (job.get("location") or "").lower()
                                        job_location_raw = job.get("location") or ""
                                        location_tier = 'other'
                                        
                                        if user_city and user_country:
                                            user_city_aliases = None
                                            try:
                                                user_city_lower = user_city.lower()
                                                user_city_aliases = {user_city_lower} | set(get_city_aliases(user_city_lower))
                                            except Exception:
                                                user_city_aliases = {user_city.lower()}
                                            
                                            city_match = _city_matches_with_aliases(job_location_raw, user_city, user_city_aliases)
                                            country_variants = get_country_variants(user_country)
                                            country_match = country_matches(job_location, country_variants)
                                            
                                            if city_match and country_match:
                                                location_tier = 'exact'
                                            elif city_match:
                                                location_tier = 'city'
                                            elif country_match:
                                                location_tier = 'country'
                                        elif user_city:
                                            user_city_aliases = None
                                            try:
                                                user_city_lower = user_city.lower()
                                                user_city_aliases = {user_city_lower} | set(get_city_aliases(user_city_lower))
                                            except Exception:
                                                user_city_aliases = {user_city.lower()}
                                            
                                            if _city_matches_with_aliases(job_location_raw, user_city, user_city_aliases):
                                                location_tier = 'city'
                                        elif user_country:
                                            country_variants = get_country_variants(user_country)
                                            if country_matches(job_location, country_variants):
                                                location_tier = 'country'
                                        
                                        boost_multiplier = tier_boost.get(location_tier, 1.0)
                                        match_score = min(1.0, match_score * boost_multiplier)
                                    except Exception:
                                        pass  # Use original score if boost fails
                                
                                job['match_score'] = match_score
                                job['match_components'] = scoring['components']
                                job['match_details'] = scoring['details']
                                
                                # Cache the score in Redis (TTL: 1 month) keyed by user_id:job_id
                                if redis_client and job_id_str:
                                    try:
                                        cache_key = f"{cache_prefix}{job_id_str}"
                                        redis_client.setex(cache_key, 2592000, str(match_score))  # 1 month (30 days)
                                    except Exception:
                                        pass
                                
                                # Score will be bulk-persisted to user_job_scores table after all jobs are scored (see below)
                                
                                if idx < 5:
                                    print(f"[Search-New] Job {idx+1}: Computed score {match_score*100:.1f}% (has_desc={has_description})")
                            except Exception as score_err:
                                try:
                                    print(f"[Search-New] Unified scoring error for job {job.get('id')}: {score_err}")
                                except Exception:
                                    pass
                                job['match_score'] = 0.0

                apply_unified_scoring(all_jobs)
                # More lenient filtering: only filter out jobs with very low scores (below 0.2)
                # This allows more jobs to be shown while still filtering out completely irrelevant ones
                filtered_jobs = []
                dropped_jobs = 0
                for job in all_jobs or []:
                    comps = job.get('match_components') or {}
                    score_val = job.get('match_score', 0) or 0.0
                    keyword_component = comps.get('keywords', 0.0)
                    skill_component = comps.get('skills', 0.0)
                    # Very lenient: accept if score > 0.2 OR keyword > 0.3 OR skill > 0.2
                    # This shows most jobs while still filtering out completely irrelevant ones
                    if (
                        score_val >= 0.2
                        or keyword_component >= 0.3
                        or skill_component >= 0.2
                    ):
                        filtered_jobs.append(job)
                    else:
                        dropped_jobs += 1
                if filtered_jobs:
                    print(f"[Search-New] Filtered out {dropped_jobs} very low-relevance jobs (lenient thresholds: score>=0.2, keyword>=0.3, skill>=0.2)")
                    all_jobs = filtered_jobs
                else:
                    print(f"[Search-New] Filter removed all jobs; keeping original set to avoid empty response")

                # Very lenient title filter: only filter out jobs with completely unrelated titles
                # Check if title contains ANY word from keywords (even short words, 2+ chars)
                keyword_phrases_normalized = normalized_phrases
                if keyword_phrases_normalized:
                    title_filtered = []
                    title_dropped = 0
                    for job in all_jobs or []:
                        title_norm_raw = str(job.get('title') or '')
                        title_norm = " ".join(title_norm_raw.lower().split())
                        if not title_norm:
                            # Keep jobs without titles
                            title_filtered.append(job)
                            continue
                        title_words = set(title_norm.split())
                        # Very lenient: extract ALL words (length >= 2) from keyword phrases
                        keyword_words = set()
                        for phrase_text in keyword_phrases_normalized:
                            for word in phrase_text.lower().split():
                                if len(word) >= 2:  # Consider words 2+ chars (very lenient)
                                    keyword_words.add(word)
                        
                        # Check if ANY keyword word appears in title
                        if keyword_words and any(word in title_words for word in keyword_words):
                            title_filtered.append(job)
                        elif not keyword_words:
                            # If no keyword words, keep the job
                            title_filtered.append(job)
                        else:
                            # Only drop if title has NO overlap with keywords at all
                            title_dropped += 1
                    if title_filtered:
                        print(f"[Search-New] Very lenient title filter removed {title_dropped} jobs (kept {len(title_filtered)} jobs)")
                        all_jobs = title_filtered
                    else:
                        print(f"[Search-New] Title filter removed all jobs; retaining previous filtered list")
                for job in all_jobs or []:
                    if isinstance(job.get('match_details'), dict):
                        job['match_details'].pop('profile_hash', None)
                
                # COMMENTED OUT: Playwright wait disabled for DB testing
                # Only wait for Playwright on page 1 when DB is completely empty
                # For page 2+, if no jobs found, just return empty (don't wait)
                # if not all_jobs and page == 1:
                #     if not linkedin_requested:
                #         linkedin_requested = True  # ensure wait aligns with refresh enqueue (LinkedIn is forced)
                #     
                #     wait_seconds_env = os.getenv('PLAYWRIGHT_WAIT_SECONDS', '60')
                #     try:
                #         playwright_wait_seconds = max(0, int(wait_seconds_env))
                #     except ValueError:
                #         playwright_wait_seconds = 60
                #     if playwright_wait_seconds > 0 and linkedin_requested:
                #         print(f"[Search-New] DB empty for page 1, waiting up to {playwright_wait_seconds}s for Playwright results...")
                #         deadline = time.time() + playwright_wait_seconds
                #         poll_interval = 1.5
                #         while time.time() < deadline and not all_jobs:
                #             time.sleep(poll_interval)
                #             wait_conn = None
                #             try:
                #                 wait_conn = db_pool.getconn()
                #                 if not wait_conn:
                #                     print(f"[Search-New] Playwright wait: failed to get DB connection")
                #                     continue
                #                 
                #                 refreshed = rank_jobs(
                #                     wait_conn,
                #                     query_text=query_text,
                #                     location=None,  # Never filter by location - only use for ranking
                #                     experience_level=experience_level,
                #                     remote_type=remote_type,
                #                     limit=page_size + 1,
                #                     offset=0,  # Always check page 1 during wait
                #                     query_keywords=keywords,
                #                     user_location_city=user_location_city,  # Pass for tiered ranking
                #                     user_location_country=user_location_country,  # Pass for tiered ranking
                #                 )
                #                 if refreshed:
                #                     apply_unified_scoring(refreshed)
                #                     all_jobs = refreshed
                #                     print(f"[Search-New] Playwright results arrived ({len(all_jobs)} jobs)")
                #                     break
                #             except Exception as wait_err:
                #                 print(f"[Search-New] Playwright wait poll error: {wait_err}")
                #             finally:
                #                 # Always return connection to pool
                #                 if wait_conn:
                #                     try:
                #                         db_pool.putconn(wait_conn)
                #                     except Exception:
                #                         pass
                #         if not all_jobs:
                #             print(f"[Search-New] Playwright wait timed out after {playwright_wait_seconds}s")

                # Fallback: if FTS returns too few jobs (< page_size), supplement with all jobs from requested sources
                # This ensures we show as many jobs as possible, even with low match scores
                source_codes = sources or ['linkedin']
                try:
                    with conn.cursor() as fallback_cur:
                        # Get source IDs
                        placeholders = ','.join(['%s'] * len(source_codes))
                        fallback_cur.execute(
                            f"SELECT id FROM sources WHERE code IN ({placeholders})",
                            source_codes
                        )
                        source_ids = [row[0] for row in fallback_cur.fetchall()]
                        print(f"[Search-New] Fallback: Found {len(source_ids)} source IDs for sources {source_codes}")
                        
                        if source_ids:
                            # Always supplement with jobs from sources to ensure we show as many jobs as possible
                            # The FTS query might be too strict and only match jobs with exact phrases
                            # We should show ALL jobs from sources, sorted by match_score, even if they don't match FTS
                            # This ensures users see all 888 jobs (or at least page_size of them), not just the 26 that match exact phrases
                            
                            print(f"[Search-New] FTS returned {len(all_jobs)} jobs from strict keyword matching. Will supplement with all jobs from sources to show maximum results.")
                            
                            # Get all jobs from these sources, ordered by match_score first, then posted_at
                            # Exclude jobs already in all_jobs to avoid duplicates
                            existing_ids = {job.get('id') for job in all_jobs if job.get('id')}
                            exclude_clause = ""
                            exclude_params = []
                            if existing_ids:
                                exclude_placeholders = ','.join(['%s'] * len(existing_ids))
                                exclude_clause = f"AND j.id NOT IN ({exclude_placeholders})"
                                exclude_params = list(existing_ids)
                            
                            # Apply experience_level and remote_type filters to fallback query
                            fallback_filters = []
                            fallback_filter_params = []
                            if remote_type:
                                fallback_filters.append("(j.remote_type = %s OR j.remote_type IS NULL)")
                                fallback_filter_params.append(remote_type)
                            if experience_level:
                                exp_ranges = {
                                    "entry": (0, 2),
                                    "mid": (2, 5),
                                    "senior": (5, 10),
                                    "leadership": (10, 999),
                                }
                                min_exp, max_exp = exp_ranges.get(experience_level, (0, 999))
                                fallback_filters.append("((j.experience_min IS NULL OR j.experience_min <= %s) AND (j.experience_max IS NULL OR j.experience_max >= %s))")
                                fallback_filter_params.extend([max_exp, min_exp])
                            
                            filter_clause = " AND " + " AND ".join(fallback_filters) if fallback_filters else ""
                            
                            # Calculate how many more jobs we need to reach page_size + 1 (for has_next check)
                            # Don't replace FTS results - they're already properly ordered by last_match_score
                            needed = max(0, (page_size + 1) - len(all_jobs))
                            
                            if needed > 0:
                                print(f"[Search-New] Fetching {needed} additional jobs from sources (excluding {len(existing_ids)} already found)...")
                                fallback_cur.execute(f"""
                                    SELECT j.*
                                    FROM jobs j
                                    WHERE (j.is_active IS NULL OR j.is_active = TRUE)
                                    AND j.source_id IN ({','.join(['%s'] * len(source_ids))})
                                    {exclude_clause}
                                    {filter_clause}
                                    ORDER BY 
                                        -- Sort by posted_at and scraped_at (scores will be computed and sorted after fetch)
                                        j.posted_at DESC NULLS LAST,
                                        j.scraped_at DESC NULLS LAST,
                                        j.id ASC
                                    LIMIT %s
                                """, source_ids + exclude_params + fallback_filter_params + [needed])
                                
                                columns = [desc[0] for desc in fallback_cur.description]
                                supplemental_jobs = [dict(zip(columns, row)) for row in fallback_cur.fetchall()]
                                
                                # Apply scoring to supplemental jobs (scores are computed per-user)
                                apply_unified_scoring(supplemental_jobs)
                                
                                # Always combine FTS results with supplemental jobs (don't replace)
                                all_jobs.extend(supplemental_jobs)
                                print(f"[Search-New] ✅ Added {len(supplemental_jobs)} supplemental jobs, total: {len(all_jobs)}")
                                
                                # Note: Jobs will be sorted by computed match_score after apply_unified_scoring
                                
                                # Debug: if we still don't have enough, log why
                                if len(all_jobs) < page_size:
                                    print(f"[Search-New] ⚠️  Still only {len(all_jobs)} jobs after supplement. Checking DB...")
                                    # Quick count of total jobs in DB
                                    fallback_cur.execute("""
                                        SELECT COUNT(*) FROM jobs j
                                        WHERE (j.is_active IS NULL OR j.is_active = TRUE)
                                        AND j.source_id IN ({})
                                    """.format(','.join(['%s'] * len(source_ids))), source_ids)
                                    total_in_db = fallback_cur.fetchone()[0]
                                    print(f"[Search-New] 📊 Total jobs in DB for these sources: {total_in_db}")
                                    if total_in_db > 0:
                                        print(f"[Search-New] ⚠️  DB has {total_in_db} jobs but only {len(all_jobs)} returned. Filters might be too strict.")
                            
                            # If still no jobs or very few, try complete fallback (no FTS match required)
                            # Show all jobs from sources, even if they don't match keywords
                            if len(all_jobs) < page_size:
                                print(f"[Search-New] Only {len(all_jobs)} jobs after FTS+supplement, trying complete fallback: all jobs from sources")
                                
                                # Check if offset exceeds total jobs before running fallback query
                                fallback_offset = (page - 1) * page_size
                                try:
                                    fallback_cur.execute(f"""
                                        SELECT COUNT(*) FROM jobs j
                                        WHERE (j.is_active IS NULL OR j.is_active = TRUE)
                                        AND j.source_id IN ({','.join(['%s'] * len(source_ids))})
                                    """, source_ids)
                                    total_jobs_count = fallback_cur.fetchone()[0]
                                    print(f"[Search-New] Complete fallback: total_jobs={total_jobs_count}, offset={fallback_offset}, page={page}")
                                    if fallback_offset >= total_jobs_count:
                                        print(f"[Search-New] ⚠️  Offset {fallback_offset} >= total jobs {total_jobs_count}, skipping fallback (no more jobs available)")
                                        # Don't run fallback query, all_jobs will remain as is (empty or partial)
                                        complete_fallback_jobs = []
                                    else:
                                        # Apply same filters
                                        complete_fallback_filters = []
                                        complete_fallback_params = []
                                        if remote_type:
                                            complete_fallback_filters.append("(j.remote_type = %s OR j.remote_type IS NULL)")
                                            complete_fallback_params.append(remote_type)
                                        if experience_level:
                                            exp_ranges = {
                                                "entry": (0, 2),
                                                "mid": (2, 5),
                                                "senior": (5, 10),
                                                "leadership": (10, 999),
                                            }
                                            min_exp, max_exp = exp_ranges.get(experience_level, (0, 999))
                                            complete_fallback_filters.append("((j.experience_min IS NULL OR j.experience_min <= %s) AND (j.experience_max IS NULL OR j.experience_max >= %s))")
                                            complete_fallback_params.extend([max_exp, min_exp])
                                        
                                        complete_filter_clause = " AND " + " AND ".join(complete_fallback_filters) if complete_fallback_filters else ""
                                        
                                        # Exclude jobs already in all_jobs
                                        existing_ids_complete = {job.get('id') for job in all_jobs if job.get('id')}
                                        exclude_clause_complete = ""
                                        exclude_params_complete = []
                                        if existing_ids_complete:
                                            exclude_placeholders = ','.join(['%s'] * len(existing_ids_complete))
                                            exclude_clause_complete = f"AND j.id NOT IN ({exclude_placeholders})"
                                            exclude_params_complete = list(existing_ids_complete)
                                        
                                        fallback_cur.execute(f"""
                                            SELECT j.*
                                            FROM jobs j
                                            WHERE (j.is_active IS NULL OR j.is_active = TRUE)
                                            AND j.source_id IN ({','.join(['%s'] * len(source_ids))})
                                            {exclude_clause_complete}
                                            {complete_filter_clause}
                                            ORDER BY 
                                                -- Sort by posted_at and scraped_at (scores will be computed and sorted after fetch)
                                                j.posted_at DESC NULLS LAST,
                                                j.scraped_at DESC NULLS LAST,
                                                j.id ASC
                                            LIMIT %s OFFSET %s
                                        """, source_ids + exclude_params_complete + complete_fallback_params + [page_size + 1, fallback_offset])
                                except Exception as count_err:
                                    print(f"[Search-New] Failed to check total jobs count for fallback: {count_err}")
                                    # Continue with fallback query anyway
                                    # Apply same filters
                                    complete_fallback_filters = []
                                    complete_fallback_params = []
                                    if remote_type:
                                        complete_fallback_filters.append("(j.remote_type = %s OR j.remote_type IS NULL)")
                                        complete_fallback_params.append(remote_type)
                                    if experience_level:
                                        exp_ranges = {
                                            "entry": (0, 2),
                                            "mid": (2, 5),
                                            "senior": (5, 10),
                                            "leadership": (10, 999),
                                        }
                                        min_exp, max_exp = exp_ranges.get(experience_level, (0, 999))
                                        complete_fallback_filters.append("((j.experience_min IS NULL OR j.experience_min <= %s) AND (j.experience_max IS NULL OR j.experience_max >= %s))")
                                        complete_fallback_params.extend([max_exp, min_exp])
                                    
                                    complete_filter_clause = " AND " + " AND ".join(complete_fallback_filters) if complete_fallback_filters else ""
                                    
                                    # Exclude jobs already in all_jobs
                                    existing_ids_complete = {job.get('id') for job in all_jobs if job.get('id')}
                                    exclude_clause_complete = ""
                                    exclude_params_complete = []
                                    if existing_ids_complete:
                                        exclude_placeholders = ','.join(['%s'] * len(existing_ids_complete))
                                        exclude_clause_complete = f"AND j.id NOT IN ({exclude_placeholders})"
                                        exclude_params_complete = list(existing_ids_complete)
                                    
                                    fallback_cur.execute(f"""
                                        SELECT j.*
                                        FROM jobs j
                                        WHERE (j.is_active IS NULL OR j.is_active = TRUE)
                                        AND j.source_id IN ({','.join(['%s'] * len(source_ids))})
                                        {exclude_clause_complete}
                                        {complete_filter_clause}
                                        ORDER BY 
                                            -- Sort by posted_at and scraped_at (scores will be computed and sorted after fetch)
                                            j.posted_at DESC NULLS LAST,
                                            j.scraped_at DESC NULLS LAST,
                                            j.id ASC
                                        LIMIT %s OFFSET %s
                                    """, source_ids + exclude_params_complete + complete_fallback_params + [page_size + 1, fallback_offset])
                                    
                                    columns = [desc[0] for desc in fallback_cur.description]
                                    complete_fallback_jobs = [dict(zip(columns, row)) for row in fallback_cur.fetchall()]
                                    
                                    # Apply scoring to complete fallback jobs (scores are computed per-user)
                                    apply_unified_scoring(complete_fallback_jobs)
                                    
                                    # Replace all_jobs with complete fallback if we got more results
                                    if len(complete_fallback_jobs) > len(all_jobs):
                                        all_jobs = complete_fallback_jobs
                                        print(f"[Search-New] Complete fallback returned {len(all_jobs)} jobs")
                                    else:
                                        # Or append if we got additional unique jobs
                                        existing_ids_set = {job.get('id') for job in all_jobs if job.get('id')}
                                        new_jobs = [j for j in complete_fallback_jobs if j.get('id') not in existing_ids_set]
                                        if new_jobs:
                                            all_jobs.extend(new_jobs)
                                            print(f"[Search-New] Complete fallback added {len(new_jobs)} additional jobs, total: {len(all_jobs)}")
                except Exception as fallback_err:
                    print(f"[Search-New] Fallback query error: {fallback_err}")
                    import traceback
                    traceback.print_exc()
                
                # Check if there's a next page:
                # - If we got more than page_size, definitely has next
                # - If we got exactly page_size, check if there are more jobs in DB for this query
                # - If we got fewer than page_size, we've reached the end
                has_next = len(all_jobs) > page_size
                
                # If we got exactly page_size, check if there are more jobs in the database
                # This handles the case where jobs are being inserted incrementally
                if len(all_jobs) == page_size:
                    try:
                        # Count total jobs matching the query (without pagination)
                        # Use the same filters as rank_jobs for accurate count
                        with conn.cursor() as count_cur:
                            # Build count query matching rank_jobs filters, including hard title/keyword filter
                            count_where = ["(j.is_active IS NULL OR j.is_active = TRUE)"]
                            count_params = []
                            
                            # FTS match on title + description
                            count_where.append(
                                "to_tsvector('english', coalesce(j.title, '') || ' ' || coalesce(j.description, '')) "
                                "@@ websearch_to_tsquery('english', %s)"
                            )
                            count_params.append(query_text)
                            
                            # Hard title/keyword filter (same as rank_jobs)
                            if normalized_phrases:
                                title_placeholders = ", ".join(["%s"] * len(normalized_phrases))
                                count_where.append(f"LOWER(j.title) IN ({title_placeholders})")
                                count_params.extend(normalized_phrases)
                            
                            # Experience level filter (if provided)
                            if experience_level:
                                if experience_level == 'entry':
                                    count_where.append("(j.experience_max IS NULL OR j.experience_max <= 2)")
                                elif experience_level == 'mid':
                                    count_where.append("((j.experience_min IS NULL OR j.experience_min <= 5) AND (j.experience_max IS NULL OR j.experience_max >= 2))")
                                elif experience_level == 'senior':
                                    count_where.append("(j.experience_min IS NULL OR j.experience_min <= 10) AND (j.experience_min IS NULL OR j.experience_min >= 5)")
                                elif experience_level == 'leadership':
                                    count_where.append("(j.experience_min IS NULL OR j.experience_min >= 9)")
                            
                            # Remote type filter (if provided) - relaxed to match NULL
                            if remote_type:
                                if remote_type.lower() == 'remote':
                                    count_where.append("(j.remote_type = 'remote' OR j.remote_type IS NULL)")
                                elif remote_type.lower() == 'hybrid':
                                    count_where.append("(j.remote_type = 'hybrid' OR j.remote_type IS NULL)")
                                elif remote_type.lower() == 'onsite':
                                    count_where.append("(j.remote_type = 'onsite' OR j.remote_type IS NULL)")
                            
                            count_query = f"SELECT COUNT(*) FROM jobs j WHERE {' AND '.join(count_where)}"
                            count_cur.execute(count_query, count_params)
                            total_count = count_cur.fetchone()[0]
                            # If total count is greater than current page's end, there's a next page
                            current_page_end = (page - 1) * page_size + len(all_jobs)
                            has_next = total_count > current_page_end
                            print(f"[Search-New] Total jobs in DB matching query: {total_count}, current page end: {current_page_end}, has_next: {has_next}")
                    except Exception as count_err:
                        # If count query fails, fall back to simple check
                        print(f"[Search-New] Count query error: {count_err}, using simple has_next check")
                        has_next = len(all_jobs) >= page_size
                
                # IMPORTANT: Only re-sort if jobs don't have _user_score (meaning they came from FTS, not user_job_scores)
                # If all jobs have _user_score, they're already correctly sorted by rank_jobs and we should preserve that order
                # to maintain pagination stability (avoid showing same jobs on different pages)
                jobs_with_user_score = sum(1 for j in all_jobs if j.get('_user_score') is not None)
                if jobs_with_user_score == len(all_jobs) and len(all_jobs) > 0:
                    # All jobs came from user_job_scores and are already sorted correctly - preserve order
                    print(f"[Search-New] ✅ All {len(all_jobs)} jobs have _user_score, preserving original order from rank_jobs (pagination stable)")
                else:
                    # Mixed or no _user_score - need to sort by computed match_score
                    # This ensures highest-scored jobs appear on first page
                    # Use _user_score from rank_jobs if available (from user_job_scores), otherwise use match_score
                    all_jobs.sort(key=lambda j: (
                        j.get('_user_score') is None and j.get('match_score') is None,  # Jobs without any score go last
                        -(j.get('_user_score') or j.get('match_score') or -1.0)  # Negate for descending order (highest first)
                    ))
                    print(f"[Search-New] ✅ Final sort: {len(all_jobs)} jobs sorted by user_score/match_score (highest first) - {jobs_with_user_score} had _user_score")
                
                # Debug: log top 5 scores
                for idx, j in enumerate(all_jobs[:5]):
                    user_score = j.get('_user_score')
                    match_score = j.get('match_score')
                    print(f"[Search-New] Top {idx+1}: _user_score={user_score}, match_score={match_score}, job_id={j.get('id')}")
                
                # Trim to actual page_size
                jobs = all_jobs[:page_size]
                
                # Deduplicate by job ID to prevent showing the same job twice (e.g., if SQL returns duplicates)
                seen_job_ids = set()
                deduplicated_jobs = []
                duplicates_found = 0
                for j in jobs:
                    job_id = j.get('id')
                    if job_id and job_id not in seen_job_ids:
                        seen_job_ids.add(job_id)
                        deduplicated_jobs.append(j)
                    elif job_id:
                        duplicates_found += 1
                
                if duplicates_found > 0:
                    print(f"[Search-New] ⚠️  Page {page}: Found {duplicates_found} duplicate job IDs, removed them. Returning {len(deduplicated_jobs)} unique jobs.")
                jobs = deduplicated_jobs
                
                # Debug: verify match_score is present in jobs
                for idx, j in enumerate(jobs[:5]):
                    match_score_val = j.get('match_score')
                    last_match_score_val = j.get('last_match_score')
                    print(f"[Search-New] Job {idx+1}: match_score={match_score_val}, last_match_score={last_match_score_val}, has_match_components={bool(j.get('match_components'))}")
                
                # Bulk persist computed scores to user_job_scores table (user-specific)
                # Scores are also cached in Redis (TTL: 1 month) keyed by user_id:job_id
                try:
                    score_rows = []
                    for j in jobs:
                        sid = j.get('id')
                        s = j.get('match_score')
                        components = j.get('match_components')
                        details = j.get('match_details')
                        if s is None or sid is None:
                            continue
                        
                        # Convert job_id to string (jobs.id is TEXT in actual DB)
                        job_id_str = None
                        if isinstance(sid, (memoryview, bytes, bytearray)):
                            if isinstance(sid, memoryview):
                                job_id_str = sid.tobytes().hex()
                            else:
                                job_id_str = bytes(sid).hex()
                        elif isinstance(sid, (int, str)):
                            job_id_str = str(sid)
                        else:
                            continue
                        
                        if not job_id_str:
                            continue
                        
                        # Prepare JSONB for components and details
                        import json
                        components_json = json.dumps(components) if components else None
                        details_for_store = {}
                        if isinstance(details, dict):
                            details_for_store = dict(details)
                        details_for_store['profile_hash'] = profile_signature
                        details_json = json.dumps(details_for_store)
                        
                        score_rows.append((
                            user_id,
                            job_id_str,  # TEXT, not BIGINT
                            float(s),
                            components_json,
                            details_json
                        ))
                    
                    if score_rows and conn:
                        with conn.cursor() as bcur:
                            # Use INSERT ... ON CONFLICT to upsert scores
                            from psycopg2.extras import execute_values as _exec_vals
                            _exec_vals(
                                bcur,
                                """
                                INSERT INTO user_job_scores (user_id, job_id, last_match_score, match_components, match_details)
                                VALUES %s
                                ON CONFLICT (user_id, job_id) 
                                DO UPDATE SET 
                                    last_match_score = EXCLUDED.last_match_score,
                                    match_components = EXCLUDED.match_components,
                                    match_details = EXCLUDED.match_details,
                                    updated_at = now()
                                """,
                                score_rows,
                                template="(%s, %s, %s, %s::jsonb, %s::jsonb)"  # job_id is TEXT
                            )
                        conn.commit()
                        print(f"[Search-New] ✅ Bulk-persisted {len(score_rows)} scores to user_job_scores (user_id={user_id}, TTL: 1 month cache)")
                except Exception as bulk_err:
                    try:
                        if conn:
                            conn.rollback()
                        print(f"[Search-New] ⚠️  Bulk score persist failed: {bulk_err}")
                        import traceback
                        traceback.print_exc()
                    except Exception:
                        pass
                
                # Scores are computed per-user on fetch (with location boost applied)
                # Scores are cached in Redis (TTL: 1 month) keyed by (job_id, user_profile_hash)
                print(f"[Search-New] Returning {len(jobs)} jobs (sorted by computed match_score per user)")
                
                print(f"[Search-New] Jobs after trim (page_size={page_size}), has_next={has_next}")
                
                # Success - break out of retry loop after returning connection
                if conn:
                    try:
                        db_pool.putconn(conn)
                    except Exception:
                        pass
                    conn = None
                break
                
            except psycopg2.OperationalError as op_err:
                # Connection errors - retry
                if conn:
                    try:
                        db_pool.putconn(conn, close=True)  # Close bad connection
                    except Exception:
                        pass
                    conn = None
                if db_attempt < max_db_retries - 1:
                    print(f"[Search-New] DB operational error (attempt {db_attempt + 1}/{max_db_retries}): {op_err}")
                    time.sleep(2 ** db_attempt)  # Exponential backoff
                    continue
                else:
                    print(f"[Search-New] DB connection failed after {max_db_retries} attempts: {op_err}")
                    return jsonify({'error': 'Database connection failed after retries'}), 503
            except Exception as e:
                # Other errors - log and return connection
                if conn:
                    try:
                        db_pool.putconn(conn)
                    except Exception:
                        pass
                try:
                    print(f"[Search-New] DB query error: {e}")
                except Exception:
                    pass
                if db_attempt < max_db_retries - 1:
                    time.sleep(1)
                    continue
                return jsonify({'error': f'Database query error: {str(e)}'}), 500
            finally:
                # Always return connection to pool if we got one and haven't returned it yet
                if conn:
                    try:
                        db_pool.putconn(conn)
                    except Exception:
                        pass

        try:
            print(f"[Search-New] ranked jobs: {len(jobs)} page={page} size={page_size}, has_next={has_next}")
        except Exception:
            pass
        
        # Convert to response format
        def _to_jsonable(value):
            import datetime as _dt
            from decimal import Decimal as _Decimal
            if value is None:
                return None
            if isinstance(value, (str, int, float, bool)):
                return value
            # Datetime/date → ISO
            if isinstance(value, (_dt.datetime, _dt.date)):
                try:
                    return value.isoformat()
                except Exception:
                    return str(value)
            # Bytes / memoryview → hex string
            if isinstance(value, (bytes, bytearray, memoryview)):
                try:
                    return value.hex()
                except Exception:
                    return str(bytes(value))
            # Decimal → float
            if isinstance(value, _Decimal):
                return float(value)
            # Lists/tuples/sets
            if isinstance(value, (list, tuple, set)):
                return [_to_jsonable(v) for v in value]
            # Dicts
            if isinstance(value, dict):
                return {k: _to_jsonable(v) for k, v in value.items()}
            # Fallback
            return str(value)
        
        # Get total job count for this query (for UI refresh detection and accurate pagination)
        total_job_count = 0
        total_pages = 1
        has_next_page = has_next
        has_previous_page = page > 1
        no_more_results = False
        try:
            with db_pool.getconn() as count_conn:
                with count_conn.cursor() as count_cur:
                    # Match rank_jobs filters: active, FTS, and hard title/keyword filter
                    count_where = ["(j.is_active IS NULL OR j.is_active = TRUE)"]
                    count_params = []
                    count_where.append(
                        "to_tsvector('english', coalesce(j.title, '') || ' ' || coalesce(j.description, '')) "
                        "@@ websearch_to_tsquery('english', %s)"
                    )
                    # Use same query text we send to ranker when possible
                    count_params.append(" OR ".join([f'"{k}"' if " " in k else k for k in keywords]))
                    # NO title filter in count query - count all jobs that match FTS query
                    # This gives accurate total count for pagination (all 300 jobs, not just 100)
                    count_query = f"SELECT COUNT(*) FROM jobs j WHERE {' AND '.join(count_where)}"
                    print(f"[Search-New] Count query (no title filter): {count_query[:200]}... with {len(count_params)} params")
                    count_cur.execute(count_query, count_params)
                    row = count_cur.fetchone()
                    if row:
                        total_job_count = int(row[0] or 0)
                        print(f"[Search-New] Total job count from DB (all FTS matches, no title filter): {total_job_count}")
        except Exception:
            pass

        # Derive total_pages and has_next_page from total_job_count when possible
        if total_job_count > 0:
            total_pages = max(1, (total_job_count + page_size - 1) // page_size)
            has_next_page = page < total_pages
        else:
            total_pages = 1
            has_next_page = False

        # If requested page is beyond total_pages, treat as "no more results"
        if page > 1 and page > total_pages:
            no_more_results = True
            has_next_page = False
            jobs = []
        
        # Debug: verify match_score is in jobs before building response
        jobs_with_score = sum(1 for j in jobs if j.get('match_score') is not None)
        print(f"[Search-New] Response: {len(jobs)} jobs, {jobs_with_score} have match_score")
        if jobs_with_score < len(jobs):
            print(f"[Search-New] ⚠️  Warning: {len(jobs) - jobs_with_score} jobs missing match_score!")
            for idx, j in enumerate(jobs):
                if j.get('match_score') is None:
                    print(f"[Search-New]   Job {idx+1} missing match_score: id={j.get('id')}, title={j.get('title', '')[:50]}")
        
        result = {
            'jobs': jobs,
            'total': len(jobs),  # Jobs on current page
            'total_found': total_job_count,  # Total jobs matching query (for pagination)
            'total_in_db': total_job_count,  # Total jobs in DB for this query (for refresh detection)
            'last_updated': None,  # Will be set from DB if available
            'page': page,
            'page_size': page_size,
            'no_more_results': no_more_results,
            'pagination': {
                'page': page,
                'page_size': page_size,
                'total_pages': total_pages,
                'has_next_page': has_next_page,
                'has_previous_page': has_previous_page,
            },
            'query': {
                'keywords': keywords,
                'location': location,
                'experience_level': experience_level,
                'remote_type': remote_type,
                'where': where_in,
                'skills': skills_in,
            },
        }
        
        # Get most recent scraped_at timestamp for this query (indicates when DB was last updated)
        try:
            with db_pool.getconn() as ts_conn:
                with ts_conn.cursor() as ts_cur:
                    ts_cur.execute("""
                        SELECT MAX(j.scraped_at) FROM jobs j
                        WHERE (j.is_active IS NULL OR j.is_active = TRUE)
                        AND to_tsvector('english', coalesce(j.title, '') || ' ' || coalesce(j.description, '')) 
                        @@ websearch_to_tsquery('english', %s)
                    """, (" OR ".join([f'"{k}"' if " " in k else k for k in keywords]),))
                    row = ts_cur.fetchone()
                    if row and row[0]:
                        result['last_updated'] = row[0].isoformat() if hasattr(row[0], 'isoformat') else str(row[0])
        except Exception:
            pass

        # Backfill missing locations for LinkedIn DB results (current page) synchronously
        try:
            if jobs:
                li_missing = []
                for j in jobs:
                    try:
                        if (str(j.get('source') or '').lower() == 'linkedin') and (not j.get('location')):
                            url_v = j.get('url') or ''
                            if url_v:
                                li_missing.append(j)
                    except Exception:
                        continue
                if li_missing:
                    print(f"[Search-New] Backfilling LinkedIn locations for {len(li_missing)} DB rows (page {page})")
                    try:
                        from connectors.linkedin import LinkedInConnector
                        import re as _re
                        connector = LinkedInConnector()
                        loc_rows = []
                        for j in li_missing[:page_size]:
                            try:
                                url_v = j.get('url') or ''
                                detail = connector._fetch_detail_and_location_http(url_v)
                                loc = (detail.get('location') or '').strip()
                                if not loc:
                                    continue
                                # Prefer last URL segment as external_id
                                ext_id = None
                                if url_v:
                                    ext_id = url_v.split('/')[-1].split('?', 1)[0]
                                if not ext_id:
                                    m2 = _re.search(r"/jobs/view/(\d+)", url_v)
                                    if m2:
                                        ext_id = m2.group(1)
                                if ext_id:
                                    loc_rows.append((ext_id, loc))
                                    # Update in-memory job too
                                    j['location'] = loc
                            except Exception:
                                continue
                        if loc_rows:
                            with get_db_pool().getconn() as _connbf:
                                with _connbf.cursor() as _curbf:
                                    _curbf.execute("SELECT id FROM sources WHERE code = 'linkedin'")
                                    _row = _curbf.fetchone()
                                    _source_id = _row[0] if _row else None
                                    if _source_id:
                                        _curbf.execute("CREATE TEMPORARY TABLE IF NOT EXISTS temp_li_locs2 (external_id TEXT, location TEXT) ON COMMIT DROP")
                                        from psycopg2.extras import execute_values as _exec_vals2
                                        _exec_vals2(_curbf, "INSERT INTO temp_li_locs2 (external_id, location) VALUES %s", loc_rows)
                                        _curbf.execute(
                                            """
                                            UPDATE jobs j
                                            SET location = COALESCE(NULLIF(j.location, ''), t.location)
                                            FROM temp_li_locs2 t
                                            WHERE j.source_id = %s AND j.external_id = t.external_id
                                            """,
                                            (_source_id,)
                                        )
                                        print(f"[Search-New] DB location backfill affected rows: {_curbf.rowcount}")
                                _connbf.commit()
                    except Exception as bf_err:
                        print(f"[Search-New] DB backfill for locations failed: {bf_err}")
        except Exception:
            pass
        
        # Cache DB results if we have jobs (10 minute TTL)
        if redis_client and jobs:
            try:
                safe_result = _to_jsonable(result)
                redis_client.setex(cache_key, 600, json.dumps(safe_result))
                print(f"[Search-New] Cached DB results: {cache_key}")
            except Exception as e:
                print(f"[Search-New] Cache write error: {e}")
        
        # Cold-start fallback: if DB is completely empty for page 1, do a fast scatter-gather (≤3s)
        # This populates the DB, then we re-read from DB to return results
        if not jobs and page == 1:
            try:
                print("[Search-New] Cold-start: DB empty for page 1, running fast fallback (≤3s)")
                import asyncio as _asyncio
                import time as _time
                start_time = _time.time()
                
                # Fast scatter-gather: try HTTP-based sources first (faster than Playwright)
                # Limit to 10-15 results to keep under 3s
                fast_sources = []
                if sources:
                    # Prefer API/HTTP sources over scrapers for speed
                    for s in sources:
                        s_lower = str(s).lower()
                        if s_lower in ['adzuna', 'jooble', 'remoteok']:
                            fast_sources.append(s_lower)
                        elif s_lower == 'linkedin':
                            # Use LinkedIn HTTP (not Playwright) for cold-start
                            fast_sources.append(s_lower)
                
                if not fast_sources:
                    fast_sources = ['remoteok']  # Default fallback
                
                # Fetch from fast sources in parallel (limit to 10-15 jobs total)
                async def fast_fetch():
                    tasks = []
                    max_per_source = max(5, 15 // len(fast_sources)) if fast_sources else 5
                    
                    for src in fast_sources[:3]:  # Limit to 3 sources max
                        try:
                            if src == 'linkedin':
                                from connectors.linkedin import LinkedInConnector
                                connector = LinkedInConnector()
                                # Force HTTP mode (disable Playwright) for speed
                                connector.disable_playwright = True
                            elif src == 'remoteok':
                                from connectors.remoteok import RemoteOKConnector
                                connector = RemoteOKConnector()
                            elif src == 'adzuna':
                                from connectors.adzuna import AdzunaConnector
                                connector = AdzunaConnector()
                            elif src == 'jooble':
                                from connectors.jooble import JoobleConnector
                                connector = JoobleConnector()
                            else:
                                continue
                            
                            from connectors.base import SearchQuery
                            sq = SearchQuery(
                                keywords=[str(k) for k in (keywords or [])],
                                location=location,
                                max_results=max_per_source,
                            )
                            tasks.append(connector.fetch(sq))
                        except Exception as e:
                            print(f"[Search-New] Cold-start: failed to init {src}: {e}")
                            continue
                    
                    if tasks:
                        results = await _asyncio.gather(*tasks, return_exceptions=True)
                        all_jobs = []
                        for r in results:
                            if isinstance(r, Exception):
                                continue
                            if r:
                                all_jobs.extend(r)
                        return all_jobs[:15]  # Cap at 15 for speed
                    return []
                
                fast_jobs = _asyncio.run(fast_fetch())
                elapsed = _time.time() - start_time
                print(f"[Search-New] Cold-start: fetched {len(fast_jobs)} jobs in {elapsed:.2f}s")
                
                # Upsert fast jobs to DB immediately (via worker-style normalization)
                if fast_jobs and db_pool:
                    try:
                        from pipelines.dedupe import dedupe_jobs
                        with db_pool.getconn() as cold_conn:
                            with cold_conn.cursor() as cold_cur:
                                # Get source IDs
                                source_map = {}
                                for src in fast_sources:
                                    cold_cur.execute("SELECT id FROM sources WHERE code = %s", (src,))
                                    row = cold_cur.fetchone()
                                    if row:
                                        source_map[src] = row[0]
                                
                                # Group RawJobs by source
                                by_source = {}
                                for j in fast_jobs:
                                    src = getattr(j, 'source', '') or ''
                                    if src not in by_source:
                                        by_source[src] = []
                                    by_source[src].append(j)
                                
                                # Dedupe and upsert per source (using same logic as worker)
                                for src, src_raw_jobs in by_source.items():
                                    if src not in source_map or not src_raw_jobs:
                                        continue
                                    source_id = source_map[src]
                                    try:
                                        new_jobs, _ = dedupe_jobs(src_raw_jobs, cold_conn, source_id)
                                        if new_jobs:
                                            # Quick upsert (simplified, limit to 10 for speed)
                                            from psycopg2.extras import execute_values as _exec_vals
                                            rows = []
                                            for j in new_jobs[:10]:
                                                rows.append((
                                                    source_id,
                                                    j.get('external_id'),
                                                    j.get('company'),
                                                    j.get('title'),
                                                    j.get('normalized_title'),
                                                    j.get('description'),
                                                    j.get('location'),
                                                    j.get('url'),
                                                    j.get('posted_at'),
                                                    j.get('hash'),
                                                ))
                                            if rows:
                                                _exec_vals(
                                                    cold_cur,
                                                    """INSERT INTO jobs (source_id, external_id, company, title, normalized_title, description, location, url, posted_at, hash)
                                                       VALUES %s ON CONFLICT (source_id, external_id) DO NOTHING""",
                                                    rows
                                                )
                                            print(f"[Search-New] Cold-start: upserted {len(rows)} jobs for {src}")
                                    except Exception as src_err:
                                        print(f"[Search-New] Cold-start: failed for {src}: {src_err}")
                                        continue
                                cold_conn.commit()
                    except Exception as upsert_err:
                        print(f"[Search-New] Cold-start upsert failed: {upsert_err}")
                        import traceback
                        traceback.print_exc()
                
                # Re-read from DB after cold-start upsert and update result
                if db_pool and elapsed < 3.0:  # Only if we're under 3s
                    try:
                        with db_pool.getconn() as reconn:
                            all_jobs = rank_jobs(
                                reconn,
                                query_text=query_text,
                                location=None,  # Never filter by location - only use for ranking
                                experience_level=experience_level,
                                remote_type=remote_type,
                                limit=page_size + 1,
                                offset=0,
                                query_keywords=keywords,
                                user_location_city=user_location_city,  # Pass for tiered ranking
                                user_location_country=user_location_country,  # Pass for tiered ranking
                                user_id=user_id,  # Order by user-specific scores when available
                            )
                            print(f"[Search-New] Cold-start: re-read {len(all_jobs)} jobs from DB after upsert")

                            apply_unified_scoring(all_jobs)
                            has_next = len(all_jobs) >= page_size
                            jobs = all_jobs[:page_size]
                            jobs.sort(key=lambda j: j.get('match_score') or 0.0, reverse=True)
                            # Update result object
                            result['jobs'] = jobs
                            result['total'] = len(jobs)
                            result['pagination']['has_next_page'] = has_next
                            result['pagination']['total_pages'] = 1 + (1 if has_next else 0)
                            db_pool.putconn(reconn)
                    except Exception as reread_err:
                        print(f"[Search-New] Cold-start re-read failed: {reread_err}")
            
            except Exception as cold_err:
                print(f"[Search-New] Cold-start fallback failed: {cold_err}")
                import traceback
                traceback.print_exc()
        
        # Always return from DB (never render directly from scraper responses)
        # If we have jobs from DB, return them
        if jobs:
            safe_result = _to_jsonable(result)
            return jsonify(safe_result)
        
        # If no jobs and not page 1, return empty (cold-start only runs for page 1)
        # Background refresh will populate DB for future requests
        if not jobs:
            safe_result = _to_jsonable(result)
            return jsonify(safe_result)

        # OLD FALLBACK LOGIC REMOVED - We never render directly from scrapers
        # All results must come from DB. Cold-start fallback (above) handles empty DB for page 1.
        # Background worker handles all other fetching.
        if False and not jobs and sources and 'remoteok' in [str(s).lower() for s in sources]:
            try:
                print("[Search-New] Empty DB results; running synchronous RemoteOK fallback")
                # Lazy import to avoid overhead if not needed
                from connectors.remoteok import RemoteOKConnector
                from connectors.base import SearchQuery
                import asyncio as _asyncio
                connector = RemoteOKConnector()
                sq = SearchQuery(
                    keywords=[str(k) for k in (keywords or [])],
                    location=location,
                    max_results=page_size,
                )
                ro_jobs = _asyncio.run(connector.fetch(sq))
                # Shape to API response jobs
                shaped = []
                # Prepare keyword/skills match helpers (normalized)
                import re as _re
                for j in ro_jobs or []:
                    try:
                        title = getattr(j, 'title', '') or ''
                        company = getattr(j, 'company', '') or ''
                        location_v = getattr(j, 'location', '') or ''
                        desc = getattr(j, 'description', '') or ''
                        # Clean UI artifacts from description
                        desc = _re.sub(r"\bshow\s*(more|less)\b", "", desc, flags=_re.I)
                        url_v = getattr(j, 'url', '') or ''

                        scoring = compute_unified_score(
                            {
                                'title': title,
                                'description': desc,
                                'location': location_v,
                                'posted_at': getattr(j, 'posted_at', None),
                                'skills': getattr(j, 'skills', []) or [],
                                'experience_min': getattr(j, 'experience_min', None),
                                'experience_max': getattr(j, 'experience_max', None),
                            },
                            keywords=keywords,
                            skills=skills_in,
                            location=location,
                            experience_level=experience_level,
                            remote_preference=remote_type or where_in,
                        )

                        shaped.append({
                            'id': f"remoteok_{getattr(j,'external_id', '')}",
                            'title': title,
                            'company': company,
                            'location': location_v,
                            'description': desc,
                            'url': url_v,
                            'source': 'remoteok',
                            'skills_required': getattr(j, 'skills', []) or [],
                            'skills_matched': scoring['details'].get('matched_skills', []),
                            'match_score': scoring['score'],
                            'match_components': scoring['components'],
                            'match_details': scoring['details'],
                        })
                    except Exception as ro_scoring_err:
                        try:
                            print(f"[Search-New] RemoteOK unified scoring error: {ro_scoring_err}")
                        except Exception:
                            pass
                        continue
                shaped.sort(key=lambda j: j.get('match_score') or 0.0, reverse=True)
                result['jobs'] = shaped
                result['total'] = len(shaped)
                # Add pagination for fallback (assume no next page for now since it's a fallback)
                result['pagination'] = {
                    'page': page,
                    'page_size': page_size,
                    'total_pages': page,
                    'has_next_page': False,
                    'has_previous_page': page > 1,
                }

                # Persist match scores for RemoteOK fallback rows using (source_id, external_id)
                try:
                    with get_db_pool().getconn() as _conn2:
                        with _conn2.cursor() as _cur2:
                            _cur2.execute("SELECT id FROM sources WHERE code = 'remoteok'")
                            _row = _cur2.fetchone()
                            if _row:
                                _source_id = _row[0]
                                _persisted = 0
                                for idx_item, item in enumerate(shaped):
                                    try:
                                        score_val = item.get('match_score')
                                        if score_val is None:
                                            continue
                                        # Candidate external_ids
                                        candidates = []
                                        sid = item.get('id') or ''
                                        if isinstance(sid, str) and sid.startswith('remoteok_'):
                                            candidates.append(sid.split('remoteok_', 1)[1])
                                        url_v = str(item.get('url') or '')
                                        if url_v:
                                            last = url_v.split('/')[-1]
                                            candidates.append(last)
                                            if '?' in last:
                                                candidates.append(last.split('?', 1)[0])
                                        updated_local = False
                                        for cand in candidates:
                                            try:
                                                _cur2.execute(
                                                    "UPDATE jobs SET last_match_score = %s WHERE source_id = %s AND external_id = %s",
                                                    (float(score_val), _source_id, cand)
                                                )
                                                if _cur2.rowcount > 0:
                                                    updated_local = True
                                                    break
                                            except Exception:
                                                continue
                                        if idx_item == 0:
                                            try:
                                                print(f"[Search-New] RO fallback persist debug: candidates={candidates} updated={updated_local}")
                                            except Exception:
                                                pass
                                        if updated_local:
                                            _persisted += 1
                                    except Exception:
                                        continue
                                _conn2.commit()
                                try:
                                    print(f"[Search-New] RemoteOK fallback: persisted scores for {_persisted}/{len(shaped)} jobs")
                                except Exception:
                                    pass
                except Exception as _e2:
                    try:
                        print(f"[Search-New] RemoteOK fallback persist skipped: {_e2}")
                    except Exception:
                        pass
                # Cache fallback results (shorter TTL - 5 minutes)
                if redis_client and shaped:
                    try:
                        safe_result = _to_jsonable(result)
                        redis_client.setex(cache_key, 300, json.dumps(safe_result))
                        print(f"[Search-New] Cached RemoteOK fallback results: {cache_key}")
                    except Exception as e:
                        print(f"[Search-New] Cache write error (fallback): {e}")
                safe_result = _to_jsonable(result)
                return jsonify(safe_result)
            except Exception as e:
                print(f"[Search-New] RemoteOK fallback error: {e}")

        # LinkedIn synchronous fallback - DISABLED (never render directly from scrapers)
        if False and not jobs and sources and 'linkedin' in [str(s).lower() for s in sources]:
            try:
                print("[Search-New] Empty DB results; running synchronous LinkedIn fallback")
                from connectors.linkedin import LinkedInConnector
                from connectors.base import SearchQuery
                import asyncio as _asyncio
                import re as _re
                connector = LinkedInConnector()
                sq = SearchQuery(
                    keywords=[str(k) for k in (keywords or [])],
                    location=location,
                    max_results=page_size,
                )
                li_jobs = _asyncio.run(connector.fetch(sq))
                shaped = []
                for j in li_jobs or []:
                    try:
                        title = getattr(j, 'title', '') or ''
                        company = getattr(j, 'company', '') or ''
                        location_v = getattr(j, 'location', '') or ''
                        desc = getattr(j, 'description', '') if hasattr(j, 'description') else ''
                        desc = _re.sub(r"\bshow\s*(more|less)\b", "", desc, flags=_re.I)
                        url_v = getattr(j, 'url', '') or ''

                        scoring = compute_unified_score(
                            {
                                'title': title,
                                'description': desc,
                                'location': location_v,
                                'posted_at': getattr(j, 'posted_at', None),
                                'skills': getattr(j, 'skills', []) or [],
                                'experience_min': getattr(j, 'experience_min', None),
                                'experience_max': getattr(j, 'experience_max', None),
                            },
                            keywords=keywords,
                            skills=skills_in,
                            location=location,
                            experience_level=experience_level,
                            remote_preference=remote_type or where_in,
                        )

                        shaped.append({
                            'id': f"linkedin_{getattr(j,'external_id', '')}",
                            'title': title,
                            'company': company,
                            'location': location_v,
                            'description': desc,
                            'url': url_v,
                            'source': 'linkedin',
                            'skills_required': getattr(j, 'skills', []) or [],
                            'skills_matched': scoring['details'].get('matched_skills', []),
                            'match_score': scoring['score'],
                            'match_components': scoring['components'],
                            'match_details': scoring['details'],
                        })
                    except Exception as li_scoring_err:
                        try:
                            print(f"[Search-New] LinkedIn fallback scoring error: {li_scoring_err}")
                        except Exception:
                            pass
                        continue
                shaped.sort(key=lambda j: j.get('match_score') or 0.0, reverse=True)
                result['jobs'] = shaped
                result['total'] = len(shaped)
                # Add pagination for fallback (assume has_next if we got full page_size)
                has_next_fallback = len(shaped) >= page_size
                result['pagination'] = {
                    'page': page,
                    'page_size': page_size,
                    'total_pages': page + (1 if has_next_fallback else 0),
                    'has_next_page': has_next_fallback,
                    'has_previous_page': page > 1,
                }

                # Persist match scores for LinkedIn fallback rows using (source_id, external_id)
                try:
                    with get_db_pool().getconn() as _conn2:
                        with _conn2.cursor() as _cur2:
                            _cur2.execute("SELECT id FROM sources WHERE code = 'linkedin'")
                            _row = _cur2.fetchone()
                            if _row:
                                _source_id = _row[0]
                                _persisted = 0
                                import re as __re
                                for idx_item, item in enumerate(shaped):
                                    try:
                                        score_val = item.get('match_score')
                                        if score_val is None:
                                            continue
                                        # Extract external_id from shaped id or URL
                                        candidates = []
                                        sid = item.get('id') or ''
                                        if isinstance(sid, str) and sid.startswith('linkedin_'):
                                            candidates.append(sid.split('linkedin_', 1)[1])
                                        url_v = str(item.get('url') or '')
                                        if url_v:
                                            # Raw last segment (as connector may have stored it)
                                            raw_last = url_v.split('/')[-1]
                                            candidates.append(raw_last)
                                            # Last segment without query
                                            if '?' in raw_last:
                                                candidates.append(raw_last.split('?', 1)[0])
                                            # Numeric id if present
                                            m = __re.search(r"/jobs/view/(\d+)", url_v)
                                            if m:
                                                candidates.append(m.group(1))
                                        updated_local = False
                                        # Extract numeric ID from URL (handle slug-123 form)
                                        numeric_id = None
                                        if url_v:
                                            # Case 1: /jobs/view/12345
                                            m = __re.search(r"/jobs/view/(\d+)", url_v)
                                            if m:
                                                numeric_id = m.group(1)
                                            else:
                                                # Case 2: /jobs/view/<slug>-12345?
                                                last_seg = url_v.split('/')[-1].split('?', 1)[0]
                                                m2 = __re.search(r"-([0-9]{5,})$", last_seg)
                                                if m2:
                                                    numeric_id = m2.group(1)
                                        
                                        # Try to find existing job by various methods
                                        existing_job_id = None
                                        if numeric_id:
                                            # Try by numeric external_id
                                            _cur2.execute(
                                                "SELECT id FROM jobs WHERE source_id = %s AND external_id = %s",
                                                (_source_id, numeric_id)
                                            )
                                            row = _cur2.fetchone()
                                            if row:
                                                existing_job_id = row[0]
                                        
                                        if not existing_job_id and candidates:
                                            # Try by any candidate external_id
                                            for cand in candidates:
                                                try:
                                                    _cur2.execute(
                                                        "SELECT id FROM jobs WHERE source_id = %s AND external_id = %s",
                                                        (_source_id, cand)
                                                    )
                                                    row = _cur2.fetchone()
                                                    if row:
                                                        existing_job_id = row[0]
                                                        break
                                                except Exception:
                                                    continue
                                        
                                        if not existing_job_id and url_v:
                                            # Try by URL
                                            try:
                                                _cur2.execute(
                                                    "SELECT id FROM jobs WHERE source_id = %s AND url = %s",
                                                    (_source_id, url_v)
                                                )
                                                row = _cur2.fetchone()
                                                if row:
                                                    existing_job_id = row[0]
                                            except Exception:
                                                pass
                                        
                                        # Update if found, otherwise upsert a minimal row so score is saved immediately
                                        if existing_job_id:
                                            try:
                                                _cur2.execute(
                                                    "UPDATE jobs SET last_match_score = %s WHERE id = %s",
                                                    (float(score_val), existing_job_id)
                                                )
                                                if _cur2.rowcount > 0:
                                                    updated_local = True
                                            except Exception as upd_err:
                                                if idx_item == 0:
                                                    print(f"[Search-New] Update by id failed: {upd_err}")
                                                pass
                                        else:
                                            # Minimal upsert using (source_id, external_id)
                                            # Try multiple external_id formats to match what worker might have stored
                                            # Worker likely uses: href.split('/')[-1] (full slug without query) if regex fails
                                            ext_candidates = []
                                            if url_v:
                                                # Full last segment without query (what worker likely uses)
                                                full_seg = url_v.split('/')[-1].split('?', 1)[0]
                                                if full_seg:
                                                    ext_candidates.append(full_seg)  # Try this first (most likely)
                                            if numeric_id and numeric_id not in ext_candidates:
                                                ext_candidates.append(numeric_id)  # Just numeric ID as fallback
                                            if candidates:
                                                for c in candidates:
                                                    # Clean candidate (remove query params)
                                                    c_clean = c.split('?', 1)[0] if '?' in c else c
                                                    if c_clean and c_clean not in ext_candidates:
                                                        ext_candidates.append(c_clean)
                                            
                                            upserted = False
                                            for ext_candidate in ext_candidates:
                                                try:
                                                    _cur2.execute(
                                                        """
                                                        INSERT INTO jobs (source_id, external_id, title, company, description, location, url, last_match_score)
                                                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                                                        ON CONFLICT (source_id, external_id) DO UPDATE SET
                                                            last_match_score = EXCLUDED.last_match_score,
                                                            title = COALESCE(EXCLUDED.title, jobs.title),
                                                            company = COALESCE(EXCLUDED.company, jobs.company),
                                                            description = COALESCE(EXCLUDED.description, jobs.description),
                                                            location = COALESCE(NULLIF(EXCLUDED.location, ''), jobs.location),
                                                            url = COALESCE(EXCLUDED.url, jobs.url)
                                                        """,
                                                        (
                                                            _source_id,
                                                            ext_candidate,
                                                            item.get('title') or None,
                                                            item.get('company') or None,
                                                            item.get('description') or None,
                                                            item.get('location') or None,
                                                            url_v or None,
                                                            float(score_val),
                                                        )
                                                    )
                                                    # Check if it was an update (existing row) or insert (new row)
                                                    if _cur2.rowcount > 0:
                                                        upserted = True
                                                        updated_local = True
                                                        if idx_item == 0:
                                                            print(f"[Search-New] Upserted score with ext_id={ext_candidate}, rowcount={_cur2.rowcount}")
                                                        break
                                                except Exception as ins_err:
                                                    if idx_item == 0 and ext_candidate == ext_candidates[0]:
                                                        print(f"[Search-New] Upsert failed for {ext_candidate}: {ins_err}")
                                                    continue
                                            
                                            if not upserted and idx_item == 0:
                                                print(f"[Search-New] No upsert succeeded, tried: {ext_candidates}")
                                        if idx_item == 0:
                                            try:
                                                print(f"[Search-New] LI fallback persist debug: url={url_v} numeric_id={numeric_id} existing_job_id={existing_job_id} updated={updated_local}")
                                            except Exception:
                                                pass
                                        if updated_local:
                                            _persisted += 1
                                    except Exception:
                                        continue
                                _conn2.commit()
                            # Bulk backfill locations for these jobs (if missing)
                            try:
                                loc_rows = []
                                for item in shaped:
                                    loc_v = (item.get('location') or '').strip()
                                    if not loc_v:
                                        continue
                                    url_v = str(item.get('url') or '')
                                    # Prefer last URL segment as external_id (worker stores this often)
                                    ext_id = None
                                    if url_v:
                                        ext_id = url_v.split('/')[-1].split('?', 1)[0]
                                    if not ext_id:
                                        m2 = _re.search(r"/jobs/view/(\d+)", url_v)
                                        if m2:
                                            ext_id = m2.group(1)
                                    if ext_id:
                                        loc_rows.append((ext_id, loc_v))
                                if loc_rows and _source_id:
                                    _cur2.execute("CREATE TEMPORARY TABLE IF NOT EXISTS temp_li_locs (external_id TEXT, location TEXT) ON COMMIT DROP")
                                    from psycopg2.extras import execute_values as _exec_vals
                                    _exec_vals(_cur2, "INSERT INTO temp_li_locs (external_id, location) VALUES %s", loc_rows)
                                    _cur2.execute(
                                        """
                                        UPDATE jobs j
                                        SET location = COALESCE(NULLIF(j.location, ''), t.location)
                                        FROM temp_li_locs t
                                        WHERE j.source_id = %s AND j.external_id = t.external_id
                                        """,
                                        (_source_id,)
                                    )
                                    if idx_item == 0:
                                        print(f"[Search-New] LinkedIn fallback: backfilled locations for {len(loc_rows)} rows (affected={_cur2.rowcount})")
                            except Exception as locbf_err:
                                print(f"[Search-New] LinkedIn fallback: location backfill skipped: {locbf_err}")

                            # Verify scores were actually saved
                                try:
                                    _cur2.execute(
                                        "SELECT COUNT(*) FROM jobs WHERE source_id = %s AND last_match_score IS NOT NULL",
                                        (_source_id,)
                                    )
                                    verified_count = _cur2.fetchone()[0]
                                    print(f"[Search-New] LinkedIn fallback: persisted scores for {_persisted}/{len(shaped)} jobs, verified in DB: {verified_count} jobs with scores")
                                except Exception as verify_err:
                                    print(f"[Search-New] LinkedIn fallback: persisted scores for {_persisted}/{len(shaped)} jobs (verification failed: {verify_err})")
                except Exception as _e2:
                    try:
                        print(f"[Search-New] LinkedIn fallback persist skipped: {_e2}")
                    except Exception:
                        pass
                # Cache fallback results (shorter TTL - 5 minutes)
                if redis_client and shaped:
                    try:
                        safe_result = _to_jsonable(result)
                        redis_client.setex(cache_key, 300, json.dumps(safe_result))
                        print(f"[Search-New] Cached LinkedIn fallback results: {cache_key}")
                    except Exception as e:
                        print(f"[Search-New] Cache write error (fallback): {e}")
                safe_result = _to_jsonable(result)
                return jsonify(safe_result)
            except Exception as e:
                print(f"[Search-New] LinkedIn fallback error: {e}")
        
        # If no jobs found from DB or fallbacks, return empty result (don't cache empty)
        if 'pagination' not in result:
            result['pagination'] = {
                'page': page,
                'page_size': page_size,
                'total_pages': 1,
                'has_next_page': False,
                'has_previous_page': False,
            }
        safe_result = _to_jsonable(result)
        return jsonify(safe_result)
    
    except Exception as e:
        print(f"[Search-New] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

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


@app.route('/api/backfill-locations', methods=['POST'])
def backfill_locations():
    """
    Backfill missing job locations from the database.
    
    Request body (JSON):
    {
        "limit": 100,  # Optional: max number of jobs to process (default: all)
        "batch_size": 25,  # Optional: parallel batch size (default: 25)
        "source": "linkedin"  # Optional: "linkedin" or "all" (default: "all")
    }
    """
    try:
        data = request.get_json() or {}
        limit = data.get('limit')
        batch_size = data.get('batch_size', 25)
        source = data.get('source', 'all')
        
        # Import here to avoid circular imports
        from backfill_locations import backfill_linkedin_locations, backfill_all_sources
        import asyncio
        
        print(f"[Backfill-API] Starting location backfill: limit={limit}, batch_size={batch_size}, source={source}")
        
        if source == 'linkedin':
            stats = asyncio.run(backfill_linkedin_locations(
                limit=limit,
                batch_size=batch_size,
                dry_run=False
            ))
        else:
            stats = asyncio.run(backfill_all_sources(
                limit=limit,
                dry_run=False
            ))
        
        return jsonify({
            'success': True,
            'stats': stats,
            'message': f"Backfill completed: {stats.get('updated', 0)} jobs updated"
        }), 200
        
    except Exception as e:
        print(f"[Backfill-API] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    print("🚀 Starting Job Scraper API...")
    print("📊 Available endpoints:")
    print("  • Web Interface: http://localhost:5000")
    print("  • API Search: POST http://localhost:5000/api/search-new")
    print("  • Health Check: GET http://localhost:5000/api/health")
    print("  • Available Sources: GET http://localhost:5000/api/sources")
    print("\n🔍 Ready to search for jobs!")
    
    app.run(host='0.0.0.0', port=5000, debug=True)
