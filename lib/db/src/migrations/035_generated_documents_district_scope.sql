-- Allow district-scoped generated documents (e.g. executive summaries that
-- are not tied to a single student). Adds a nullable district_id column and
-- relaxes the student_id NOT NULL constraint so type='executive_summary'
-- rows can carry a district reference instead.

ALTER TABLE generated_documents
  ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE generated_documents
  ADD COLUMN IF NOT EXISTS district_id INTEGER REFERENCES districts(id);

CREATE INDEX IF NOT EXISTS gen_doc_district_idx
  ON generated_documents (district_id);
