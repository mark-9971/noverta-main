-- Compliance snapshot table for shareable read-only links
-- A snapshot captures compliance data at a point in time and is accessible
-- via a public token-based URL for 7 days.
CREATE TABLE IF NOT EXISTS compliance_snapshots (
  id         SERIAL PRIMARY KEY,
  token      TEXT        NOT NULL UNIQUE,
  district_id INTEGER    NOT NULL REFERENCES districts(id),
  snapshot_json TEXT     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS cs_token_idx       ON compliance_snapshots (token);
CREATE INDEX IF NOT EXISTS cs_district_idx    ON compliance_snapshots (district_id);
CREATE INDEX IF NOT EXISTS cs_expires_idx     ON compliance_snapshots (expires_at);
