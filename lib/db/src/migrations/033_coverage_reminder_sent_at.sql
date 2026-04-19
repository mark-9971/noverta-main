-- Coverage substitute reminder dedup (Task #470).
-- Adds reminder_sent_at to coverage_instances so the scheduled reminder job
-- never sends a second reminder email for the same assignment.
ALTER TABLE coverage_instances
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ci_reminder_idx
  ON coverage_instances (absence_date, reminder_sent_at);
