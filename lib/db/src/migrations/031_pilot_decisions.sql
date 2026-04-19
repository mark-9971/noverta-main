-- Pilot renewal decision (day-60 exit survey + outcome).
-- One row per district; the unique constraint prevents duplicate submissions
-- and gives the route handler a simple ON CONFLICT path if we ever want to
-- allow edits.

DO $$ BEGIN
  CREATE TYPE pilot_decision_outcome AS ENUM ('renew', 'request_changes', 'decline');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS pilot_decisions (
  id SERIAL PRIMARY KEY,
  district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  outcome pilot_decision_outcome NOT NULL,
  survey_responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason_note TEXT,
  decided_by_user_id TEXT NOT NULL,
  decided_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE pilot_decisions
    ADD CONSTRAINT pilot_decisions_district_unique UNIQUE (district_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS pilot_decisions_outcome_idx ON pilot_decisions (outcome);
CREATE INDEX IF NOT EXISTS pilot_decisions_created_at_idx ON pilot_decisions (created_at DESC);
