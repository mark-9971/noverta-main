CREATE TABLE IF NOT EXISTS staff_schedules (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  school_id INTEGER NOT NULL REFERENCES schools(id),
  day_of_week TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  label TEXT,
  notes TEXT,
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ss_staff_day_idx ON staff_schedules(staff_id, day_of_week);
CREATE INDEX IF NOT EXISTS ss_school_idx ON staff_schedules(school_id);
CREATE INDEX IF NOT EXISTS ss_staff_school_idx ON staff_schedules(staff_id, school_id);
