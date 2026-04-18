-- Migration 025: Add CHECK constraint on scheduled_reports.format
-- Idempotent: only adds constraint if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_reports_format_check'
  ) THEN
    ALTER TABLE scheduled_reports
      ADD CONSTRAINT scheduled_reports_format_check
      CHECK (format IN ('csv', 'pdf'));
  END IF;
END;
$$;
