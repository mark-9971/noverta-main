ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS iep_renewal_email_enabled boolean NOT NULL DEFAULT true;
