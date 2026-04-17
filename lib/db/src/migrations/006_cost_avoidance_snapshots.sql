-- Migration: cost_avoidance_snapshots — weekly risk/exposure history per district
-- Idempotent (safe to run multiple times).

CREATE TABLE IF NOT EXISTS cost_avoidance_snapshots (
  id                  serial PRIMARY KEY,
  district_id         integer NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  week_start          timestamptz NOT NULL,
  total_risks         integer NOT NULL DEFAULT 0,
  critical_count      integer NOT NULL DEFAULT 0,
  high_count          integer NOT NULL DEFAULT 0,
  medium_count        integer NOT NULL DEFAULT 0,
  watch_count         integer NOT NULL DEFAULT 0,
  total_exposure      integer NOT NULL DEFAULT 0,
  students_at_risk    integer NOT NULL DEFAULT 0,
  unpriced_risk_count integer NOT NULL DEFAULT 0,
  captured_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cas_district_week_idx
  ON cost_avoidance_snapshots (district_id, week_start);

CREATE UNIQUE INDEX IF NOT EXISTS cas_district_week_unique
  ON cost_avoidance_snapshots (district_id, week_start);
