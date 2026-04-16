ALTER TABLE staff_schedules ADD COLUMN IF NOT EXISTS service_type_id INTEGER REFERENCES service_types(id);
