-- Compliance trend snapshots: nightly per-district capture of headline
-- compliance metrics so the week-over-week trend endpoint reads from a
-- pre-computed row instead of re-running the heavy minute-progress
-- calculation. Snapshots are also immune to retroactive session edits.
CREATE TABLE IF NOT EXISTS compliance_trend_snapshots (
  id                         SERIAL PRIMARY KEY,
  district_id                INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  snapshot_date              DATE NOT NULL,
  overall_compliance_rate    NUMERIC(5,1) NOT NULL,
  students_out_of_compliance INTEGER NOT NULL DEFAULT 0,
  students_at_risk           INTEGER NOT NULL DEFAULT 0,
  students_on_track          INTEGER NOT NULL DEFAULT 0,
  captured_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cts_district_date_idx
  ON compliance_trend_snapshots (district_id, snapshot_date);

CREATE UNIQUE INDEX IF NOT EXISTS cts_district_date_unique
  ON compliance_trend_snapshots (district_id, snapshot_date);
