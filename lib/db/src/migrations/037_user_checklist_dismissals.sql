-- Migration 037: Per-user dismissal of the district onboarding checklist.
-- Replaces the district-wide flag previously stored as
-- `onboarding_progress.step_key = 'checklist_dismissed'`, which incorrectly
-- shared one admin's dismissal across every user in the district.
CREATE TABLE IF NOT EXISTS user_checklist_dismissals (
  user_id TEXT PRIMARY KEY,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One-time cleanup: drop the legacy district-scoped dismissal rows so the
-- old shared flag no longer affects anyone. Per-user dismissals start fresh.
DELETE FROM onboarding_progress WHERE step_key = 'checklist_dismissed';
