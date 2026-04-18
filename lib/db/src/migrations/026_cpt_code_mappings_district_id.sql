-- Migration 026: Add district_id to cpt_code_mappings
--
-- PURPOSE
-- -------
-- cpt_code_mappings previously had no district attribution, meaning CPT rate
-- configurations were shared globally across all tenants. In a multi-tenant
-- deployment this allowed one district's billing coordinator to view or modify
-- another district's CPT rates through the /medicaid/cpt-mappings endpoints.
--
-- This migration adds a NOT NULL district_id FK column to properly scope each
-- CPT code mapping to a single district.
--
-- BACKFILL STRATEGY
-- -----------------
-- Any rows without a district_id are back-filled to the first (lowest id)
-- district in the table. This only affects seed/demo environments; production
-- deployments should not have any NULL rows since the column was applied before
-- public data was written. The UPDATE is a no-op on databases where the column
-- already carries values.
--
-- After the backfill, a NOT NULL constraint is enforced via SET NOT NULL.
-- Using IF NOT EXISTS and DO blocks keeps this migration idempotent.
--
-- INDEXES
-- -------
-- An index on district_id is added to support the primary query pattern:
-- listing all mappings for a given district. The service_type_id index
-- already existed for cross-district lookup at claim-generation time.
--
-- IMPACT ON ENDPOINTS
-- -------------------
-- All CRUD endpoints for /medicaid/cpt-mappings already enforce district
-- scoping by requiring the caller's district context (getDistrictId) and
-- filtering/mutating only rows where district_id matches. This migration
-- closes the data-layer gap that allowed schema-level cross-district access.

-- Step 1: Add the column as nullable so we can backfill safely.
-- IF NOT EXISTS guards against re-running this migration in environments
-- that already had the column added via drizzle-kit push.
ALTER TABLE cpt_code_mappings
  ADD COLUMN IF NOT EXISTS district_id integer;

-- Step 2: Ensure the FK constraint exists even when the column pre-existed
-- without one (e.g. environments where the column was added via drizzle-kit
-- push before this migration was written). The DO block is idempotent: it
-- only adds the constraint when it is absent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'cpt_code_mappings'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.column_name = 'district_id'
      AND ccu.table_name = 'districts'
  ) THEN
    ALTER TABLE cpt_code_mappings
      ADD CONSTRAINT cpt_code_mappings_district_id_fkey
        FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

-- Step 3: Back-fill any NULL rows to the lowest-id district (seed district).
-- NOTE: This is a best-effort attribution for pre-migration shared rows.
-- It is acceptable only for seed/demo data. Production deployments should
-- have no NULL rows since district_id was written at insert time.
UPDATE cpt_code_mappings
SET district_id = (SELECT MIN(id) FROM districts)
WHERE district_id IS NULL;

-- Step 4: Enforce NOT NULL now that all rows have a value.
ALTER TABLE cpt_code_mappings
  ALTER COLUMN district_id SET NOT NULL;

-- Step 5: Index to support per-district listing queries.
CREATE INDEX IF NOT EXISTS cpt_mapping_district_idx ON cpt_code_mappings(district_id);
