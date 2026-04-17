-- Migration 019: Add district_id to the imports table
--
-- PURPOSE
-- -------
-- Every import record must be attributed to the district that initiated it.
-- Previously the imports table had no district attribution; only platform admins
-- could view it via /support/imports/recent and there was no row-level tenant scope.
--
-- NULLABLE COLUMN — EXPLICIT DECISION
-- ------------------------------------
-- The column is left nullable. Backfilling existing rows from other tables is
-- not reliably possible: there is no FK from the old imports rows to schools,
-- students, or staff that would unambiguously identify a single district.
-- Any automated backfill would carry a risk of mis-attribution.
--
-- Consequence: pre-migration rows have district_id = NULL. They remain visible
-- only to platform admins through /api/support/imports/recent (which the
-- requirePlatformAdmin middleware protects). District-scoped endpoints
-- (GET /api/imports) now reject requests with null district scope (HTTP 403)
-- rather than leaking cross-district data, and they will not surface NULL rows
-- for regular district admins.
--
-- All new imports created after this migration set district_id at insert time
-- via getEnforcedDistrictId() in every import handler.
--
-- ON DELETE RESTRICT prevents district deletion when imports still exist,
-- preserving audit integrity. Platform admins must archive or reassign imports
-- before a district can be removed.

ALTER TABLE imports ADD COLUMN IF NOT EXISTS district_id integer REFERENCES districts(id) ON DELETE RESTRICT;

-- Index supports the primary query pattern: list imports for a district ordered
-- by created_at descending. NULL rows (legacy) are omitted from district scans.
CREATE INDEX IF NOT EXISTS idx_imports_district_id ON imports(district_id);
