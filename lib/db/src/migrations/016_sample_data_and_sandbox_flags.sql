-- Sample-data and sandbox flags. The runtime path is `drizzle-kit push`
-- (see lib/db/package.json), but we keep the SQL migration history complete
-- so a fresh deploy that runs migrations sequentially ends up identical.
--
-- All statements are guarded with IF NOT EXISTS because `db:push` may have
-- already created these columns in development databases.

ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS has_sample_data boolean NOT NULL DEFAULT false;

ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

-- Both students and staff carry a school_id (district is resolved via schools).
-- Partial indexes speed up the sample-data seeder/teardown predicates.
CREATE INDEX IF NOT EXISTS idx_students_is_sample
  ON students (school_id) WHERE is_sample = true;

CREATE INDEX IF NOT EXISTS idx_staff_is_sample
  ON staff (school_id) WHERE is_sample = true;
