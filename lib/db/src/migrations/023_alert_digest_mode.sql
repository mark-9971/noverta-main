ALTER TABLE districts ADD COLUMN IF NOT EXISTS alert_digest_mode boolean NOT NULL DEFAULT false;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS alert_digest_mode boolean;
