-- Migration: add caseload_snapshots table for tracking per-provider weekly caseload history

CREATE TABLE IF NOT EXISTS caseload_snapshots (
  id            SERIAL PRIMARY KEY,
  district_id   INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  staff_id      INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  week_start    TIMESTAMPTZ NOT NULL,
  student_count INTEGER NOT NULL DEFAULT 0,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cs_district_week_idx ON caseload_snapshots (district_id, week_start);
CREATE INDEX IF NOT EXISTS cs_staff_week_idx    ON caseload_snapshots (staff_id, week_start);

ALTER TABLE caseload_snapshots
  DROP CONSTRAINT IF EXISTS cs_staff_week_unique;

ALTER TABLE caseload_snapshots
  ADD CONSTRAINT cs_staff_week_unique UNIQUE (staff_id, week_start);
