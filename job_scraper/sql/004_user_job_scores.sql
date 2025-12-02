-- User-Job Scores table
-- Stores user-specific match scores for jobs
-- This allows different users to have different scores for the same job
CREATE TABLE IF NOT EXISTS user_job_scores (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,  -- User identifier (UUID string or email)
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,  -- Match jobs.id type (TEXT)
  last_match_score NUMERIC(5, 4) NOT NULL CHECK (last_match_score >= 0 AND last_match_score <= 1),
  match_components JSONB,  -- Store scoring components for debugging/display
  match_details JSONB,     -- Store detailed scoring breakdown
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, job_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS user_job_scores_user_id_idx ON user_job_scores(user_id);
CREATE INDEX IF NOT EXISTS user_job_scores_job_id_idx ON user_job_scores(job_id);
CREATE INDEX IF NOT EXISTS user_job_scores_score_idx ON user_job_scores(user_id, last_match_score DESC);
CREATE INDEX IF NOT EXISTS user_job_scores_updated_idx ON user_job_scores(updated_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_job_scores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS user_job_scores_updated_at_trigger ON user_job_scores;
CREATE TRIGGER user_job_scores_updated_at_trigger
  BEFORE UPDATE ON user_job_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_user_job_scores_updated_at();

