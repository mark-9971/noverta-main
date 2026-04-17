-- Task #79: Record withdrawal event when SIS sync archives a student
-- Adds a `source` column to enrollment_events so automated events (e.g. from
-- SIS sync) can be distinguished from manually-logged ones in the audit trail.

ALTER TABLE enrollment_events
  ADD COLUMN IF NOT EXISTS source TEXT;
