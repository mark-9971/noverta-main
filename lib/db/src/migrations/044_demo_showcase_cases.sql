-- 044_demo_showcase_cases.sql
--
-- T-V2-05 (Seed Overhaul V2 — W5) Demo Readiness Overlay sidecar.
--
-- Stores curated pointers into existing primitive-fact rows so the
-- dashboard demo flow always lands on a balanced set of cases (one
-- at-risk student, one scheduled-makeup triumph, one chronic-miss
-- case, etc.). The overlay never mutates the primitive-fact tables
-- themselves — see lib/db/src/v2/overlay/index.ts for the
-- no-mutation invariant (per-table SHA-256 snapshot, asserted on
-- every run).

CREATE TABLE IF NOT EXISTS demo_showcase_cases (
  id              SERIAL PRIMARY KEY,
  district_id     INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  run_id          TEXT NOT NULL,
  category        TEXT NOT NULL,
  subject_kind    TEXT NOT NULL,
  subject_id      INTEGER NOT NULL,
  headline        TEXT,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  selection_order INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dsc_district_idx
  ON demo_showcase_cases (district_id);

CREATE INDEX IF NOT EXISTS dsc_district_category_idx
  ON demo_showcase_cases (district_id, category);

CREATE INDEX IF NOT EXISTS dsc_run_idx
  ON demo_showcase_cases (district_id, run_id);

-- A given overlay run never picks the same subject row twice for the
-- same category — guard at the DB level so a buggy selector cannot
-- emit duplicates that would skew dashboard counts.
CREATE UNIQUE INDEX IF NOT EXISTS dsc_unique_subject_per_run
  ON demo_showcase_cases (district_id, run_id, category, subject_kind, subject_id);

-- Rollback (manual, ship as a later migration if needed):
-- DROP TABLE IF EXISTS demo_showcase_cases;
