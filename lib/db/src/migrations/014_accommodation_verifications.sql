CREATE TABLE IF NOT EXISTS accommodation_verifications (
  id SERIAL PRIMARY KEY,
  accommodation_id INTEGER NOT NULL REFERENCES iep_accommodations(id) ON DELETE CASCADE,
  verified_by_staff_id INTEGER NOT NULL REFERENCES staff(id),
  status TEXT NOT NULL DEFAULT 'verified',
  notes TEXT,
  period_start TEXT,
  period_end TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS av_accommodation_idx ON accommodation_verifications(accommodation_id);
CREATE INDEX IF NOT EXISTS av_staff_idx ON accommodation_verifications(verified_by_staff_id);
CREATE INDEX IF NOT EXISTS av_created_idx ON accommodation_verifications(created_at);

ALTER TABLE iep_accommodations ADD COLUMN IF NOT EXISTS verification_schedule_days INTEGER DEFAULT 30;
