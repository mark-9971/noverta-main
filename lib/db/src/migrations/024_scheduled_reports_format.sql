-- Migration 024: Add format column to scheduled_reports (csv/pdf, default csv)
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'csv';
