CREATE TABLE IF NOT EXISTS demo_readiness_runs (
  id SERIAL PRIMARY KEY,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pass INTEGER NOT NULL DEFAULT 0,
  warn INTEGER NOT NULL DEFAULT 0,
  fail INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  checks JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS drr_generated_at_idx ON demo_readiness_runs (generated_at);

DELETE FROM demo_readiness_runs
WHERE id NOT IN (
  SELECT id FROM demo_readiness_runs
  ORDER BY generated_at DESC
  LIMIT 50
);
