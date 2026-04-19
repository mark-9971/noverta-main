-- Migration 031: tag records imported via the pilot kickoff CSV wizard so
-- they can later be reconciled with SIS sync without creating duplicates.
--
-- A null `source` keeps the historical default (manual / SIS-managed).
-- A value of 'pilot_csv' marks rows created through the
-- POST /api/imports/* endpoints when the pilot wizard sets `source` in the
-- request body. UI surfaces a small "CSV" badge for these rows.

ALTER TABLE students            ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE staff               ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE service_requirements ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE staff_schedules     ADD COLUMN IF NOT EXISTS source text;

CREATE INDEX IF NOT EXISTS students_source_idx             ON students (source) WHERE source IS NOT NULL;
CREATE INDEX IF NOT EXISTS staff_source_idx                ON staff (source) WHERE source IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_requirements_source_idx ON service_requirements (source) WHERE source IS NOT NULL;
CREATE INDEX IF NOT EXISTS staff_schedules_source_idx      ON staff_schedules (source) WHERE source IS NOT NULL;
