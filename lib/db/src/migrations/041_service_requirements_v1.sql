-- Service Requirement v1 (Batch 1) — schema additions only.
--
-- Adds the four columns that the supersede flow and the school-scoped
-- active-requirement helper need:
--   - supersedes_id   : self-FK; future supersede flow will set this
--   - replaced_at     : timestamp paired with supersedes_id
--   - school_id       : denormalized operational school (NOT canonical;
--                       canonical school for a requirement remains
--                       students.school_id at read time)
--   - delivery_model  : "individual" | "group" — derived from the legacy
--                       text `group_size` field. groupSize is NOT dropped;
--                       it remains the legacy display field. See
--                       docs/architecture/deprecations.md.
--
-- All four columns are nullable for now. A separate, idempotent backfill
-- script (lib/db/src/scripts/backfill-sr-v1.ts) populates school_id and
-- delivery_model and writes any unresolvable rows into the
-- migration_report_service_requirements table that this migration also
-- creates.

ALTER TABLE service_requirements
  ADD COLUMN IF NOT EXISTS supersedes_id  INTEGER REFERENCES service_requirements(id),
  ADD COLUMN IF NOT EXISTS replaced_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS school_id      INTEGER REFERENCES schools(id),
  ADD COLUMN IF NOT EXISTS delivery_model TEXT;

-- Operational index for the future getActiveRequirements(schoolId) helper
-- and Today / compliance queries that need a school-scoped active filter.
CREATE INDEX IF NOT EXISTS sr_school_active_idx
  ON service_requirements (school_id, active);

-- Per-row report of every requirement the backfill could not resolve
-- cleanly (or that needs a human to confirm). Surfaced on /data-health.
CREATE TABLE IF NOT EXISTS migration_report_service_requirements (
  id              SERIAL PRIMARY KEY,
  requirement_id  INTEGER NOT NULL REFERENCES service_requirements(id) ON DELETE CASCADE,
  -- Reason vocabulary (kept open as TEXT so future backfills can extend
  -- without another migration). Initial reasons:
  --   school_inferred_null   : students.school_id was NULL → school_id left NULL
  --   student_school_null    : alias of above, kept distinct so we can
  --                            differentiate "student row missing entirely"
  --                            from "student exists but unassigned"
  --   ambiguous_group_size   : group_size text didn't match individual or
  --                            group classifier → delivery_model left NULL
  --   active_but_expired     : requirement has active=true but end_date is
  --                            in the past — flagged for admin review
  reason          TEXT NOT NULL,
  details_json    JSONB,
  resolved_at     TIMESTAMPTZ,
  resolved_by     INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mrsr_unresolved_idx
  ON migration_report_service_requirements (reason)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS mrsr_requirement_idx
  ON migration_report_service_requirements (requirement_id);

-- Generic per-migration audit ledger. Each backfill writes one row with
-- pre/post counts and a checksum so future re-runs (or production
-- rollback verification) can confirm the same logical result.
CREATE TABLE IF NOT EXISTS migration_audits (
  id            SERIAL PRIMARY KEY,
  migration_key TEXT NOT NULL,
  pre_counts    JSONB NOT NULL,
  post_counts   JSONB NOT NULL,
  checksum      TEXT NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS migration_audits_key_idx
  ON migration_audits (migration_key, created_at DESC);
