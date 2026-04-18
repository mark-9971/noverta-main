-- Add unique constraint on (district_id, document_type, document_id, version_number)
-- to prevent duplicate version numbers under concurrent saves.
-- Uses CREATE UNIQUE INDEX IF NOT EXISTS so it is safe to re-run.
CREATE UNIQUE INDEX IF NOT EXISTS doc_ver_unique_version_idx
  ON document_versions (district_id, document_type, document_id, version_number);
