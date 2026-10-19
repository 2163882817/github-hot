-- Stage 0 schema. Apply with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/001_core.sql
BEGIN;

CREATE TABLE IF NOT EXISTS repositories (
  github_id text PRIMARY KEY,
  full_name text NOT NULL,
  html_url text NOT NULL,
  description_original text,
  primary_language text,
  total_stars integer NOT NULL CHECK (total_stars >= 0),
  metadata_updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  id uuid PRIMARY KEY,
  period text NOT NULL CHECK (period IN ('daily', 'monthly')),
  language_slug text NOT NULL,
  source_url text NOT NULL,
  collected_at timestamptz NOT NULL,
  item_count integer NOT NULL CHECK (item_count > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS snapshot_items (
  snapshot_id uuid NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  github_id text NOT NULL REFERENCES repositories(github_id),
  rank integer NOT NULL CHECK (rank > 0),
  original_index integer NOT NULL CHECK (original_index >= 0),
  period_stars integer NOT NULL CHECK (period_stars >= 0),
  full_name_at_capture text NOT NULL,
  url_at_capture text NOT NULL,
  description_original_at_capture text,
  primary_language_at_capture text,
  total_stars_at_capture integer NOT NULL CHECK (total_stars_at_capture >= 0),
  metadata_updated_at timestamptz NOT NULL,
  PRIMARY KEY (snapshot_id, github_id),
  UNIQUE (snapshot_id, rank)
);

CREATE TABLE IF NOT EXISTS current_snapshots (
  period text NOT NULL CHECK (period IN ('daily', 'monthly')),
  language_slug text NOT NULL,
  snapshot_id uuid NOT NULL REFERENCES snapshots(id),
  PRIMARY KEY (period, language_slug)
);

CREATE TABLE IF NOT EXISTS collection_jobs (
  period text NOT NULL CHECK (period IN ('daily', 'monthly')),
  language_slug text NOT NULL,
  requested_at timestamptz,
  lease_until timestamptz,
  latest_attempt_at timestamptz,
  latest_attempt_status text,
  failure_code text,
  last_success_at timestamptz,
  last_viewed_at timestamptz,
  PRIMARY KEY (period, language_slug)
);

CREATE INDEX IF NOT EXISTS snapshots_lookup ON snapshots(period, language_slug, collected_at DESC);
CREATE INDEX IF NOT EXISTS collection_jobs_requested ON collection_jobs(requested_at) WHERE requested_at IS NOT NULL;

COMMIT;
