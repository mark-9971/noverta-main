-- Migration: add compliance_minute_threshold to districts
-- Adds a per-district configurable threshold (as a percentage integer, default 85)
-- used by the weekly compliance risk alert scheduler to determine which students
-- are flagged for falling below their required service minutes.

ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS compliance_minute_threshold integer NOT NULL DEFAULT 85;
