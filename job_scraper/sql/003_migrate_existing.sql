-- Migration script to add missing columns to existing jobs table
-- Run this if you have an existing jobs table from the old schema

-- Add missing columns to jobs table if they don't exist
DO $$ 
BEGIN
    -- Add source_id if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='jobs' AND column_name='source_id') THEN
        ALTER TABLE jobs ADD COLUMN source_id SMALLINT;
    END IF;
    
    -- Add normalized_title if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='jobs' AND column_name='normalized_title') THEN
        ALTER TABLE jobs ADD COLUMN normalized_title TEXT;
    END IF;
    
    -- Add hash if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='jobs' AND column_name='hash') THEN
        ALTER TABLE jobs ADD COLUMN hash BYTEA;
    END IF;
    
    -- Add is_active if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='jobs' AND column_name='is_active') THEN
        ALTER TABLE jobs ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;
    
    -- Add experience_min if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='jobs' AND column_name='experience_min') THEN
        ALTER TABLE jobs ADD COLUMN experience_min NUMERIC;
    END IF;
    
    -- Add experience_max if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='jobs' AND column_name='experience_max') THEN
        ALTER TABLE jobs ADD COLUMN experience_max NUMERIC;
    END IF;
    
    -- Add employment_type if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='jobs' AND column_name='employment_type') THEN
        ALTER TABLE jobs ADD COLUMN employment_type TEXT;
    END IF;
    
    -- Add remote_type if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='jobs' AND column_name='remote_type') THEN
        ALTER TABLE jobs ADD COLUMN remote_type TEXT CHECK (remote_type IN ('remote','hybrid','onsite'));
    END IF;
    
    -- Add skills if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='jobs' AND column_name='skills') THEN
        ALTER TABLE jobs ADD COLUMN skills TEXT[];
    END IF;
    
    -- Add scraped_at if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='jobs' AND column_name='scraped_at') THEN
        ALTER TABLE jobs ADD COLUMN scraped_at TIMESTAMPTZ DEFAULT now();
    END IF;
END $$;

-- Add foreign key constraint for source_id if sources table exists and constraint doesn't exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='sources') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name='jobs' AND constraint_name='jobs_source_id_fkey'
        ) THEN
            ALTER TABLE jobs ADD CONSTRAINT jobs_source_id_fkey 
            FOREIGN KEY (source_id) REFERENCES sources(id);
        END IF;
    END IF;
END $$;

-- Create unique index if it doesn't exist
CREATE UNIQUE INDEX IF NOT EXISTS jobs_unique ON jobs(source_id, external_id) 
WHERE source_id IS NOT NULL AND external_id IS NOT NULL;

