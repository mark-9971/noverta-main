-- Add district_id to the imports table so every import record is attributed
-- to the district that initiated it. Previously this column did not exist and
-- the table was effectively global (only platform admins could query it via
-- /support/imports/recent, but there was no row-level attribution).
--
-- Nullable for the backfill: existing rows cannot be reliably attributed to
-- a district without additional context, so they are left as NULL. All new
-- imports set district_id at insert time.

ALTER TABLE imports ADD COLUMN IF NOT EXISTS district_id integer REFERENCES districts(id) ON DELETE SET NULL;

-- Index to support the common query pattern: list imports for a given district,
-- ordered by created_at descending.
CREATE INDEX IF NOT EXISTS idx_imports_district_id ON imports(district_id);
