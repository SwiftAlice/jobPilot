# ATS Scorer Server Integration

This document explains how the Next.js frontend integrates with the Python ATS (Applicant Tracking System) scorer server.

## Overview

The frontend now calls the Python ATS scorer server (`ats_scorer_server.py`) instead of using local ATS scoring logic. This provides more sophisticated and accurate ATS scoring algorithms.

## Architecture

```
Frontend (Next.js) → API Routes → Backend Handlers → Python ATS Server
```

## Setup

### 1. Start the Python ATS Server

```bash
cd ats_mcp
python ats_scorer_server.py --mode web --port 5000
```

The server will be available at `http://localhost:5000`

### 2. Environment Configuration

You can configure the ATS server URL using environment variables:

```bash
# .env.local
ATS_SERVER_URL=http://localhost:5000
```

If not set, it defaults to `http://localhost:5000`

## API Endpoints

The Python server provides these endpoints:

- `POST /api/score` - Calculate ATS score for resume vs job description
- `POST /api/keywords` - Extract keywords from job description
- `GET /` - Web interface for manual testing

## Integration Points

### Backend Handlers (`src/lib/backend-handlers.ts`)

- `calculateATSScore()` - Now calls the Python server's `/api/score` endpoint
- `extractKeywords()` - Now calls the Python server's `/api/keywords` endpoint
- Both methods have fallback to local calculation if the server is unavailable

### API Routes

- `POST /api/ats/score` - Uses the new async `calculateATSScore()` method
- `PUT /api/ats/optimize` - Also uses the new async method
- `GET /api/ats/keywords` - Uses the new async `extractKeywords()` method

## Data Flow

1. **Frontend** sends resume data and job description to Next.js API
2. **Next.js API** calls `BackendHandlers.calculateATSScore()`
3. **Backend Handlers** sends data to Python server via HTTP POST
4. **Python Server** processes the data using advanced ATS algorithms
5. **Response** flows back through the chain to the frontend

## Fallback Mechanism

If the Python server is unavailable, the system automatically falls back to local ATS calculation to ensure the application continues to work.

## Benefits

- **More Accurate Scoring**: Python server uses sophisticated keyword extraction and scoring algorithms
- **Industry Standards**: Implements ATS best practices and industry-standard scoring methods
- **Maintainability**: ATS logic is centralized in the Python server
- **Scalability**: Python server can be deployed separately and scaled independently
- **Flexibility**: Easy to update ATS algorithms without touching the frontend

## Testing

### Test the Python Server

```bash
# Start the server
cd ats_mcp
python ats_scorer_server.py --mode web

# Test the API directly
curl -X POST http://localhost:5000/api/score \
  -H "Content-Type: application/json" \
  -d '{"job_description": "Software Engineer with Python experience", "resume_text": "I have 5 years of Python development experience"}'
```

### Test the Integration

1. Start the Python server
2. Start the Next.js development server
3. Use the frontend to upload a resume and test ATS scoring

## Troubleshooting

### Common Issues

1. **Connection Refused**: Ensure the Python server is running on the correct port
2. **CORS Errors**: The Python server includes CORS support, but check if it's working
3. **Fallback Mode**: Check console logs for "Falling back to local ATS calculation" messages

### Debug Mode

Enable debug logging in the Python server by setting `debug=True` in the Flask app configuration.

## Future Enhancements

- Add authentication to the Python server
- Implement caching for repeated requests
- Add metrics and monitoring
- Support for multiple ATS scoring algorithms
- Batch processing capabilities
