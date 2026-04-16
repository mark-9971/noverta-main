CREATE TABLE IF NOT EXISTS service_rate_configs (
  id SERIAL PRIMARY KEY,
  district_id INTEGER NOT NULL REFERENCES districts(id),
  service_type_id INTEGER NOT NULL REFERENCES service_types(id),
  in_house_rate NUMERIC,
  contracted_rate NUMERIC,
  effective_date TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS src_district_idx ON service_rate_configs(district_id);
CREATE INDEX IF NOT EXISTS src_service_type_idx ON service_rate_configs(service_type_id);
CREATE UNIQUE INDEX IF NOT EXISTS src_district_svc_date_uniq ON service_rate_configs(district_id, service_type_id, effective_date);
