-- Preserve the last successfully parsed GitHub Trending language menu as one atomic document.
BEGIN;

CREATE TABLE IF NOT EXISTS language_catalog (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  languages jsonb NOT NULL CHECK (jsonb_typeof(languages) = 'array'),
  collected_at timestamptz NOT NULL
);

COMMIT;
