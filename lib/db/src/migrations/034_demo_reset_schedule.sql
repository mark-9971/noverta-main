-- Automatic demo reset scheduling (Task #488).
-- Stores the cadence preference (off / hourly / before-demo) and an
-- audit trail of every scheduler-triggered reset.

CREATE TABLE IF NOT EXISTS demo_reset_schedule (
  id          SERIAL PRIMARY KEY,
  cadence     TEXT NOT NULL DEFAULT 'off',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

-- Seed the singleton row so reads never return NULL.
INSERT INTO demo_reset_schedule (id, cadence) VALUES (1, 'off')
  ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS demo_reset_audit (
  id                 SERIAL PRIMARY KEY,
  triggered_by       TEXT NOT NULL,
  cadence_snapshot   TEXT NOT NULL,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at        TIMESTAMPTZ,
  success            BOOLEAN,
  error_message      TEXT,
  elapsed_ms         INTEGER,
  district_id        INTEGER,
  compliance_pct     INTEGER
);

CREATE INDEX IF NOT EXISTS demo_reset_audit_started_idx ON demo_reset_audit (started_at DESC);

-- Allow demo requests to record when a live sales demo is scheduled so the
-- "before-demo" cadence can fire a reset 5 minutes before show time.
ALTER TABLE demo_requests ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
