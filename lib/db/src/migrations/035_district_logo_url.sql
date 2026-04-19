-- District branding logo URL (Task #505).
-- Optional logo displayed in the executive summary PDF header so the document
-- looks like it came from the district. Falls back gracefully to text-only
-- header if not configured.
ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS logo_url TEXT;
