-- Migration: Backfill school_year_id on all scoped tables
-- Assigns each existing unscoped record to its district's current active school year.
-- This is idempotent (WHERE school_year_id IS NULL).

-- session_logs
UPDATE session_logs sl
SET school_year_id = sy.id
FROM students st
JOIN schools sc ON sc.id = st.school_id
JOIN school_years sy ON sy.district_id = sc.district_id AND sy.is_active = true
WHERE sl.school_year_id IS NULL
  AND sl.student_id = st.id;

-- compliance_events
UPDATE compliance_events ce
SET school_year_id = sy.id
FROM students st
JOIN schools sc ON sc.id = st.school_id
JOIN school_years sy ON sy.district_id = sc.district_id AND sy.is_active = true
WHERE ce.school_year_id IS NULL
  AND ce.student_id = st.id;

-- team_meetings
UPDATE team_meetings tm
SET school_year_id = sy.id
FROM students st
JOIN schools sc ON sc.id = st.school_id
JOIN school_years sy ON sy.district_id = sc.district_id AND sy.is_active = true
WHERE tm.school_year_id IS NULL
  AND tm.student_id = st.id;

-- schedule_blocks
UPDATE schedule_blocks sb
SET school_year_id = sy.id
FROM students st
JOIN schools sc ON sc.id = st.school_id
JOIN school_years sy ON sy.district_id = sc.district_id AND sy.is_active = true
WHERE sb.school_year_id IS NULL
  AND sb.student_id = st.id;

-- iep_documents
UPDATE iep_documents id_
SET school_year_id = sy.id
FROM students st
JOIN schools sc ON sc.id = st.school_id
JOIN school_years sy ON sy.district_id = sc.district_id AND sy.is_active = true
WHERE id_.school_year_id IS NULL
  AND id_.student_id = st.id;

-- Partial unique index: one active year per district (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS sy_district_active_unique
  ON school_years (district_id)
  WHERE is_active = true;
