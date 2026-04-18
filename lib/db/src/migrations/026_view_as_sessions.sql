-- Audited platform-admin "view-as" / impersonation sessions.
-- See lib/db/src/schema/viewAsSessions.ts for column docs.
CREATE TABLE IF NOT EXISTS view_as_sessions (
  id SERIAL PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  target_role TEXT NOT NULL,
  target_display_name TEXT NOT NULL,
  target_district_id INTEGER,
  target_staff_id INTEGER,
  target_student_id INTEGER,
  target_guardian_id INTEGER,
  token_hash TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  end_reason TEXT
);

CREATE INDEX IF NOT EXISTS view_as_admin_user_idx ON view_as_sessions (admin_user_id);
CREATE INDEX IF NOT EXISTS view_as_token_idx ON view_as_sessions (token_hash);
CREATE INDEX IF NOT EXISTS view_as_active_idx ON view_as_sessions (admin_user_id, ended_at);
