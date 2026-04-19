-- Audited Trellis-support read-only sessions.
-- See lib/db/src/schema/supportSessions.ts for column docs.
CREATE TABLE IF NOT EXISTS support_sessions (
  id SERIAL PRIMARY KEY,
  support_user_id TEXT NOT NULL,
  support_display_name TEXT NOT NULL,
  district_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  end_reason TEXT
);

CREATE INDEX IF NOT EXISTS support_sessions_user_idx ON support_sessions (support_user_id);
CREATE INDEX IF NOT EXISTS support_sessions_district_idx ON support_sessions (district_id);
CREATE INDEX IF NOT EXISTS support_sessions_active_idx ON support_sessions (support_user_id, ended_at);
