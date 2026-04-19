-- Per-assignment acknowledgement linkage (Task #470).
-- Links coverage_assignment alerts to the specific coverage_instance they
-- belong to so the substitute reminder job can detect "not yet acknowledged"
-- without falling back to fragile message-text matching (which misclassifies
-- substitutes who have multiple same-day assignments).
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS coverage_instance_id INTEGER
  REFERENCES coverage_instances (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS alert_coverage_instance_idx
  ON alerts (coverage_instance_id, resolved);
