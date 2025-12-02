# New Architecture (M1 - Ingestion Core)

This document describes the new event-driven job aggregator architecture implemented per SPEC-1.

## Overview

The new architecture replaces the LangGraph parallel agents with:
- **Unified connector interface** for all sources
- **Redis Streams** for async job fetch tasks
- **Postgres/Supabase** for canonical job storage with deduplication
- **Hybrid ranking** (FTS + boosts) for search
- **Rate limiting & circuit breakers** for resilience

## Setup

### 1. Database Schema

Run the SQL migrations:

```bash
psql $SUPABASE_URL -f sql/001_init.sql
psql $SUPABASE_URL -f sql/002_indexes.sql
```

### 2. Environment Variables

```bash
# Supabase
SUPABASE_URL=postgresql://postgres:password@host:6543/postgres
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Redis (Upstash or local)
REDIS_URL=redis://default:password@host:port

# API Keys (for connectors)
ADZUNA_APP_ID=your_app_id
ADZUNA_APP_KEY=your_app_key
JOOBLE_API_KEY=your_jooble_key
```

### 3. Install Dependencies

```bash
pip install -r requirements-spec.txt
```

### 4. Run Services

**Worker** (consumes from Redis Streams):
```bash
python -m pipelines.worker
```

**Scheduler** (enqueues periodic refreshes):
```bash
python -m pipelines.scheduler
```

**Flask API** (with new `/api/search-new` endpoint):
```bash
python app.py
```

## Architecture Components

### Connectors (`connectors/`)

- `base.py`: `JobConnector` interface and `RawJob`/`SearchQuery` models
- `adzuna.py`: Async Adzuna API connector (HTTP)
- `jooble.py`: Async Jooble API connector (HTTP)
- `remoteok.py`: Async RemoteOK API connector (HTTP)
- `linkedin.py`: LinkedIn connector (HTTP-first, Playwright fallback)
- `iimjobs.py`: IIMJobs connector (Playwright-based with detail page fetching)

### Pipelines (`pipelines/`)

- `normalize.py`: Job canonicalization (title/company cleanup, hash computation)
- `dedupe.py`: Deduplication (hash-based, rule-based, optional fuzzy)
- `worker.py`: Redis Streams consumer that processes fetch tasks
- `scheduler.py`: Periodic enqueue of refresh tasks per source

### Ranking (`ranking/`)

- `rank.py`: Hybrid FTS ranking with recency/location/salary boosts

### Utilities (`utils/`)

- `rate_limit.py`: Token bucket rate limiter (Redis-backed)
- `circuit_breaker.py`: Circuit breaker pattern for source resilience
- `search_queue.py`: Enqueue search queries to Redis Streams

### Database (`sql/`)

- `001_init.sql`: Core schema (companies, sources, jobs, raw_ingest, job_duplicates)
- `002_indexes.sql`: FTS and trigram indexes

## API Endpoints

### `GET/POST /api/search-new`

New search endpoint using Postgres FTS + Redis cache.

**Query params:**
- `keywords`: List of job title keywords
- `location`: Optional location filter
- `experience_level`: Optional (entry/mid/senior/leadership)
- `remote_type`: Optional (remote/hybrid/onsite)
- `page`: Page number (default 1)
- `page_size`: Results per page (default 20)
- `sources`: List of sources to search (default: adzuna, jooble, remoteok)

**Response:**
```json
{
  "jobs": [...],
  "total": 20,
  "page": 1,
  "page_size": 20,
  "query": {...}
}
```

## Data Flow

1. **Search Query** → `/api/search-new`
2. **Check Redis Cache** → Return if cached (10 min TTL)
3. **Enqueue Fetch Task** → Redis Stream `jobs:fanout`
4. **Query Database** → Return existing results immediately
5. **Worker Processes** → Fetches from sources, deduplicates, upserts to DB
6. **Future Requests** → Serve from cache/DB

## Milestone Status

✅ **M1 - Ingestion Core**: Complete
- Database schema, connector interface, API connectors (Adzuna, Jooble, RemoteOK)
- Redis Streams, worker, scheduler, normalization, deduplication
- Hybrid FTS ranking, `/api/search-new` endpoint

✅ **M2 - Scrapers & Resilience**: Complete
- LinkedIn connector (HTTP-first, Playwright fallback)
- IIMJobs connector (Playwright-based with detail page fetching)
- All connectors registered in worker with rate limiting and circuit breakers

## Next Steps (M3-M4)

- **M3**: Admin console, health endpoints, query-time filters (salary, job type, remote/hybrid, posted date, company)
- **M4**: Observability, load testing, cost optimization

## Migration from Old Architecture

The old `/api/search-agent` endpoint remains functional. The new architecture runs in parallel:

- Old: LangGraph agents → direct scraper calls → in-memory ranking
- New: Redis Streams → worker → Postgres → FTS ranking

Both can coexist until M1 is fully validated.

