-- Migration: Guardian portal engagement tracking fields
-- Tracks when a guardian was invited, accepted, and last logged in to the portal.
-- Idempotent (safe to run multiple times).

ALTER TABLE guardians
  ADD COLUMN IF NOT EXISTS portal_invited_at  timestamptz,
  ADD COLUMN IF NOT EXISTS portal_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_portal_login_at timestamptz;

CREATE INDEX IF NOT EXISTS guardians_portal_invited_idx ON guardians(portal_invited_at)
  WHERE portal_invited_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS guardians_last_login_idx ON guardians(last_portal_login_at)
  WHERE last_portal_login_at IS NOT NULL;
