-- Migration: Guardian portal — generated_documents sharing + document_acknowledgments
-- Idempotent (safe to run multiple times).

-- 1. Add guardian-visibility columns to generated_documents
ALTER TABLE generated_documents
  ADD COLUMN IF NOT EXISTS guardian_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_at timestamptz,
  ADD COLUMN IF NOT EXISTS shared_by_name text;

CREATE INDEX IF NOT EXISTS gen_doc_guardian_visible_idx ON generated_documents(guardian_visible);

-- 2. Create document_acknowledgments table
CREATE TABLE IF NOT EXISTS document_acknowledgments (
  id            serial PRIMARY KEY,
  document_id   integer NOT NULL REFERENCES generated_documents(id) ON DELETE CASCADE,
  guardian_id   integer NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  ip_address    text
);

CREATE INDEX IF NOT EXISTS doc_ack_document_idx ON document_acknowledgments(document_id);
CREATE INDEX IF NOT EXISTS doc_ack_guardian_idx ON document_acknowledgments(guardian_id);
