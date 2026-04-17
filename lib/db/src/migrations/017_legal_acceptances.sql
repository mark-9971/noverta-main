-- Task #237: ToS/DPA clickwrap gate — legal_acceptances table
-- Records each staff member's versioned acceptance of legal documents (ToS, DPA).
-- Multiple rows per (user_id, document_type) are intentional for audit history;
-- the unique index on (user_id, document_type, document_version) prevents duplicate
-- same-version inserts. Status/report queries use DISTINCT ON … ORDER BY accepted_at DESC.

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id               SERIAL PRIMARY KEY,
  user_id          TEXT NOT NULL,
  user_email       TEXT,
  document_type    TEXT NOT NULL,
  document_version TEXT NOT NULL,
  accepted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address       TEXT,
  user_agent       TEXT
);

CREATE INDEX IF NOT EXISTS legal_acc_user_idx
  ON legal_acceptances (user_id);

CREATE INDEX IF NOT EXISTS legal_acc_type_version_idx
  ON legal_acceptances (document_type, document_version);

CREATE INDEX IF NOT EXISTS legal_acc_user_type_idx
  ON legal_acceptances (user_id, document_type);

CREATE UNIQUE INDEX IF NOT EXISTS legal_acc_user_doc_ver_uniq
  ON legal_acceptances (user_id, document_type, document_version);
