-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Optional for later: CREATE EXTENSION IF NOT EXISTS vector;

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  domain TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS companies_name_idx ON companies(name);
CREATE INDEX IF NOT EXISTS companies_domain_idx ON companies(domain) WHERE domain IS NOT NULL;

-- Sources table
CREATE TABLE IF NOT EXISTS sources (
  id SMALLSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL
);
INSERT INTO sources (code, display_name) VALUES
  ('linkedin', 'LinkedIn'),
  ('adzuna', 'Adzuna'),
  ('iimjobs', 'IIM Jobs'),
  ('jooble', 'Jooble'),
  ('remoteok', 'RemoteOK')
ON CONFLICT (code) DO NOTHING;

-- Raw ingest audit table (optional, for debugging)
CREATE TABLE IF NOT EXISTS raw_ingest (
  id BIGSERIAL PRIMARY KEY,
  source_id SMALLINT REFERENCES sources(id),
  external_id TEXT,
  url TEXT,
  payload JSONB,
  fetched_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS raw_ingest_source_fetched_idx ON raw_ingest(source_id, fetched_at DESC);

-- Jobs table (canonicalized)
CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT REFERENCES companies(id),
  source_id SMALLINT REFERENCES sources(id),
  external_id TEXT,
  title TEXT NOT NULL,
  normalized_title TEXT,
  description TEXT,
  location TEXT,
  remote_type TEXT CHECK (remote_type IN ('remote','hybrid','onsite')),
  employment_type TEXT,
  min_salary INTEGER,
  max_salary INTEGER,
  currency TEXT,
  experience_min NUMERIC,
  experience_max NUMERIC,
  skills TEXT[],
  url TEXT,
  posted_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  hash BYTEA,
  is_active BOOLEAN DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_unique ON jobs(source_id, external_id);
CREATE INDEX IF NOT EXISTS jobs_company_idx ON jobs(company_id);
CREATE INDEX IF NOT EXISTS jobs_posted_at_idx ON jobs(posted_at DESC) WHERE posted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_hash_idx ON jobs(hash) WHERE hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_active_idx ON jobs(is_active) WHERE is_active = TRUE;

-- Job duplicates tracking
CREATE TABLE IF NOT EXISTS job_duplicates (
  canonical_job_id BIGINT REFERENCES jobs(id),
  dup_job_id BIGINT REFERENCES jobs(id),
  confidence NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (canonical_job_id, dup_job_id)
);
CREATE INDEX IF NOT EXISTS job_duplicates_canonical_idx ON job_duplicates(canonical_job_id);

