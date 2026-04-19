-- Approval workflow reminder cadence (Task #440).
-- Adds an optional per-district override controlling how many days an approval
-- workflow stage may sit idle before reviewers are emailed a reminder.
-- Null = inherit the server default (APPROVAL_REMINDER_DAYS env var, fallback 3).
ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS approval_reminder_days INTEGER;
