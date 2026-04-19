-- Migration 036: Add unsubscribe_secret column to scheduled_reports.
-- Used to derive per-recipient unsubscribe tokens included in scheduled
-- report emails. A schedule that pre-dates this migration gets a generated
-- secret on its next run so existing schedules keep working.
ALTER TABLE scheduled_reports
  ADD COLUMN IF NOT EXISTS unsubscribe_secret TEXT;
