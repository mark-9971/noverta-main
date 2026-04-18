-- Migration: add caseload_thresholds JSONB column to districts for persisted per-role thresholds
ALTER TABLE districts ADD COLUMN IF NOT EXISTS caseload_thresholds jsonb;
