-- Adds the missing per-district view-as exclusion list referenced by the
-- districts schema (lib/db/src/schema/districts.ts) and read by
-- artifacts/api-server/src/routes/support.ts. Without this column any
-- `SELECT * FROM districts` issued via drizzle (e.g. the onboarding checklist
-- handler) fails with `column "view_as_excluded_roles" does not exist`,
-- producing a 500 on every page load.
ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS view_as_excluded_roles JSONB DEFAULT '[]'::jsonb;
