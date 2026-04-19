-- Add optional school/program scoping to service_rate_configs so districts can
-- configure per-school and per-program rate variations on top of district-wide
-- defaults.

ALTER TABLE service_rate_configs
  ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id),
  ADD COLUMN IF NOT EXISTS program_id INTEGER REFERENCES programs(id);

CREATE INDEX IF NOT EXISTS src_school_idx ON service_rate_configs(school_id);
CREATE INDEX IF NOT EXISTS src_program_idx ON service_rate_configs(program_id);

-- Replace the old district-wide unique constraint with three partial unique
-- indexes — one per scope. The original index treated NULL school_id/program_id
-- as distinct, which would allow duplicate district-wide rows.
ALTER TABLE service_rate_configs DROP CONSTRAINT IF EXISTS src_district_svc_date_uniq;
DROP INDEX IF EXISTS src_district_svc_date_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS src_district_svc_date_uniq
  ON service_rate_configs(district_id, service_type_id, effective_date)
  WHERE school_id IS NULL AND program_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS src_school_svc_date_uniq
  ON service_rate_configs(district_id, school_id, service_type_id, effective_date)
  WHERE school_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS src_program_svc_date_uniq
  ON service_rate_configs(district_id, program_id, service_type_id, effective_date)
  WHERE program_id IS NOT NULL AND school_id IS NULL;
