-- Demo provisioning: add expiry column to districts and extend demo_requests
-- with provisioning-lifecycle fields.

ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ;

ALTER TABLE demo_requests
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS district_id INTEGER,
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
