CREATE TABLE IF NOT EXISTS goal_annotations (
  id SERIAL PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES iep_goals(id) ON DELETE CASCADE,
  annotation_date TEXT NOT NULL,
  label TEXT NOT NULL,
  created_by INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ga_goal_date_idx ON goal_annotations(goal_id, annotation_date);
