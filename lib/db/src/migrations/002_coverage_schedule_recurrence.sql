-- Migration: Coverage instances table + schedule block recurrence fields
-- Idempotent (safe to run multiple times).
-- Dependency order: staff → schools → staff_absences → schedule_blocks → coverage_instances

-- 1. Create staff_absences if it does not already exist (dependency for coverage_instances FK)
CREATE TABLE IF NOT EXISTS staff_absences (
  id           serial PRIMARY KEY,
  staff_id     integer NOT NULL REFERENCES staff(id),
  school_id    integer REFERENCES schools(id),
  absence_date date NOT NULL,
  absence_type text NOT NULL DEFAULT 'other',
  start_time   text,
  end_time     text,
  notes        text,
  reported_by  integer REFERENCES staff(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sa_absences_staff_date_idx ON staff_absences(staff_id, absence_date);
CREATE INDEX IF NOT EXISTS sa_absences_date_idx ON staff_absences(absence_date);

-- 2. DB-level CHECK constraint on staff_absences.absence_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'staff_absences_absence_type_check'
  ) THEN
    ALTER TABLE staff_absences
      ADD CONSTRAINT staff_absences_absence_type_check
      CHECK (absence_type IN ('sick', 'personal', 'professional_development', 'emergency', 'other'));
  END IF;
END $$;

-- 3. Drop wrongly-placed coverage columns from schedule_blocks (if they exist from a bad prior migration)
ALTER TABLE schedule_blocks DROP COLUMN IF EXISTS is_uncovered;
ALTER TABLE schedule_blocks DROP COLUMN IF EXISTS substitute_staff_id;
ALTER TABLE schedule_blocks DROP COLUMN IF EXISTS original_staff_id;
ALTER TABLE schedule_blocks DROP COLUMN IF EXISTS absence_id;

-- 4. Add recurrence metadata columns to schedule_blocks
ALTER TABLE schedule_blocks
  ADD COLUMN IF NOT EXISTS recurrence_type text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to date;

-- 5. Create coverage_instances table (requires staff_absences from step 1 above)
CREATE TABLE IF NOT EXISTS coverage_instances (
  id                  serial PRIMARY KEY,
  schedule_block_id   integer NOT NULL REFERENCES schedule_blocks(id),
  absence_date        date NOT NULL,
  original_staff_id   integer NOT NULL REFERENCES staff(id),
  substitute_staff_id integer REFERENCES staff(id),
  is_covered          boolean NOT NULL DEFAULT false,
  absence_id          integer REFERENCES staff_absences(id),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 6. Indexes for coverage_instances
CREATE INDEX IF NOT EXISTS ci_block_date_idx ON coverage_instances(schedule_block_id, absence_date);
CREATE INDEX IF NOT EXISTS ci_absence_idx    ON coverage_instances(absence_id);
CREATE INDEX IF NOT EXISTS ci_covered_idx    ON coverage_instances(is_covered, absence_date);
