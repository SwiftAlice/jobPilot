#!/bin/bash

# Job Scraper Service Startup Script
# This script ensures the job scraper service is running

echo "🚀 Starting Job Scraper Service..."

# Check if service is already running
if pgrep -f "python3.*app.py" > /dev/null; then
    echo "✅ Job scraper service is already running"
    exit 0
fi

# Navigate to job scraper directory
cd /Users/mstack/Downloads/personalProjects/job_autumation/job_scraper

# Start the service in background
echo "🔄 Starting job scraper service..."
nohup python3 app.py > job_scraper.log 2>&1 &

# Wait a moment for service to start
sleep 3

# Check if service started successfully
if pgrep -f "python3.*app.py" > /dev/null; then
    echo "✅ Job scraper service started successfully"
    echo "📊 Service is running on http://localhost:5000"
    echo "📝 Logs are available in job_scraper.log"
else
    echo "❌ Failed to start job scraper service"
    echo "📝 Check job_scraper.log for error details"
    exit 1
fi