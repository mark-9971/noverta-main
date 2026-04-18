-- Add district-wide default hourly rate fallback.
-- When set, this rate is used for service types that have no per-service
-- district rate configured, before falling back to the system default ($75/hr).
ALTER TABLE districts ADD COLUMN IF NOT EXISTS default_hourly_rate numeric(10,2);
