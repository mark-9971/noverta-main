-- Migration: convert IEP builder drafts from per-staff to per-student (shared)
-- Keep the most recently updated row per student, discard older per-staff duplicates.

-- Step 1: delete older duplicate drafts, keeping the most-recently-updated per student
DELETE FROM iep_builder_drafts
WHERE id NOT IN (
  SELECT DISTINCT ON (student_id) id
  FROM iep_builder_drafts
  ORDER BY student_id, updated_at DESC
);

-- Step 2: drop the old per-(student, staff) unique constraint
ALTER TABLE iep_builder_drafts
  DROP CONSTRAINT IF EXISTS iep_draft_student_staff_uniq;

-- Step 3: add new per-student unique constraint
ALTER TABLE iep_builder_drafts
  ADD CONSTRAINT iep_draft_student_uniq UNIQUE (student_id);

-- Step 4: make staff_id nullable (it now tracks the last editor, not ownership)
ALTER TABLE iep_builder_drafts
  ALTER COLUMN staff_id DROP NOT NULL;
