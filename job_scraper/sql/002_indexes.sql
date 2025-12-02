-- Full-text search index on jobs
CREATE INDEX IF NOT EXISTS jobs_search_idx ON jobs USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'')));
CREATE INDEX IF NOT EXISTS jobs_title_trgm_idx ON jobs USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS jobs_location_idx ON jobs(location) WHERE location IS NOT NULL;

