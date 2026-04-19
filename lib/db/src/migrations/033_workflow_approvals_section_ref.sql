-- Inline section references on approval comments (Task #451).
-- Lets reviewers anchor a comment to a specific section/field of the document
-- they are reviewing in the inline document viewer.
ALTER TABLE workflow_approvals
  ADD COLUMN IF NOT EXISTS section_ref TEXT;
