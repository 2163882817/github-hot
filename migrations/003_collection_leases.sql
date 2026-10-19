BEGIN;

ALTER TABLE collection_jobs
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0);

CREATE INDEX IF NOT EXISTS collection_jobs_due
  ON collection_jobs(latest_attempt_at, lease_until);

COMMIT;
