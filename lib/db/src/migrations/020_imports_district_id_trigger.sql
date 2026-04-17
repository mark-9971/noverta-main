-- Migration 020: Enforce district_id NOT NULL on future imports inserts
--
-- BACKFILL ANALYSIS (performed migration 019 → 020)
-- ---------------------------------------------------
-- The imports table has no foreign key to staff, schools, or students.
-- Columns available: id, import_type, file_name, status, rows_processed,
-- rows_imported, rows_errored, error_summary, column_mapping, created_at,
-- updated_at (and now district_id from migration 019).
--
-- We cannot reliably determine which district initiated a historical import
-- row from these columns alone. The file_name is user-supplied and has no
-- enforced format. Therefore, automated backfill carries an unacceptable risk
-- of mis-attribution and is explicitly skipped.
--
-- Historical NULL rows remain NULL and are:
--   a) excluded from district-scoped GET /api/imports queries (filter on district_id)
--   b) accessible only to platform admins via GET /api/support/imports/recent
--   c) treated as "pre-migration legacy / unknown district" for audit purposes
--
-- FORWARD ENFORCEMENT
-- -------------------
-- Application layer: every import handler now calls getEnforcedDistrictId()
-- before inserting, guaranteeing non-NULL for all new rows since migration 019.
--
-- Database layer (this migration): a BEFORE INSERT trigger raises an exception
-- if district_id is NULL. This protects against any path that bypasses the
-- application (direct SQL access, future raw inserts, data migrations, etc.).
-- The trigger uses WHEN (NEW.district_id IS NULL) so it only fires on NULL;
-- existing UPDATE operations are unaffected.

CREATE OR REPLACE FUNCTION enforce_imports_district_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.district_id IS NULL THEN
    RAISE EXCEPTION
      'imports.district_id must not be NULL for new rows. '
      'Obtain a district scope before inserting (getEnforcedDistrictId).';
  END IF;
  RETURN NEW;
END;
$$;

-- Only create the trigger if it does not already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_imports_require_district_id'
      AND tgrelid = 'imports'::regclass
  ) THEN
    CREATE TRIGGER trg_imports_require_district_id
      BEFORE INSERT ON imports
      FOR EACH ROW EXECUTE FUNCTION enforce_imports_district_id();
  END IF;
END;
$$;
