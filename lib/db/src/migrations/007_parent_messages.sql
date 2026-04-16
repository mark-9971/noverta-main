-- Parent Communication Hub: message_templates, parent_messages, conference_requests

CREATE TABLE IF NOT EXISTS message_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  placeholders JSONB DEFAULT '[]',
  is_system BOOLEAN NOT NULL DEFAULT false,
  district_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS msg_template_category_idx ON message_templates (category);

CREATE TABLE IF NOT EXISTS parent_messages (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL DEFAULT 'staff',
  sender_staff_id INTEGER REFERENCES staff(id),
  sender_guardian_id INTEGER REFERENCES guardians(id),
  recipient_guardian_id INTEGER REFERENCES guardians(id),
  recipient_staff_id INTEGER REFERENCES staff(id),
  thread_id INTEGER,
  template_id INTEGER REFERENCES message_templates(id),
  category TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS parent_msg_student_idx ON parent_messages (student_id);
CREATE INDEX IF NOT EXISTS parent_msg_thread_idx ON parent_messages (thread_id);
CREATE INDEX IF NOT EXISTS parent_msg_sender_staff_idx ON parent_messages (sender_staff_id);
CREATE INDEX IF NOT EXISTS parent_msg_recipient_guardian_idx ON parent_messages (recipient_guardian_id);
CREATE INDEX IF NOT EXISTS parent_msg_recipient_staff_idx ON parent_messages (recipient_staff_id);
CREATE INDEX IF NOT EXISTS parent_msg_category_idx ON parent_messages (category);

CREATE TABLE IF NOT EXISTS conference_requests (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  guardian_id INTEGER NOT NULL REFERENCES guardians(id),
  message_id INTEGER REFERENCES parent_messages(id),
  title TEXT NOT NULL,
  description TEXT,
  proposed_times JSONB NOT NULL DEFAULT '[]',
  selected_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'proposed',
  location TEXT,
  guardian_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conf_req_student_idx ON conference_requests (student_id);
CREATE INDEX IF NOT EXISTS conf_req_staff_idx ON conference_requests (staff_id);
CREATE INDEX IF NOT EXISTS conf_req_guardian_idx ON conference_requests (guardian_id);
CREATE INDEX IF NOT EXISTS conf_req_status_idx ON conference_requests (status);

-- Seed system templates
INSERT INTO message_templates (name, category, subject, body, placeholders, is_system) VALUES
  ('Prior Written Notice', 'prior_written_notice', 'Prior Written Notice — {{studentName}}', 'Dear {{guardianName}},\n\nThis letter serves as prior written notice regarding {{studentName}}''s educational program.\n\n{{body}}\n\nIf you have questions, please do not hesitate to contact us.\n\nSincerely,\n{{staffName}}', '["studentName","guardianName","staffName","body"]', true),
  ('IEP Meeting Invitation', 'iep_meeting_invitation', 'IEP Meeting Invitation — {{studentName}}', 'Dear {{guardianName}},\n\nYou are invited to an IEP meeting for {{studentName}}.\n\n{{body}}\n\nYour participation is important. Please confirm your attendance.\n\nBest regards,\n{{staffName}}', '["studentName","guardianName","staffName","body"]', true),
  ('Progress Update', 'progress_update', 'Progress Update — {{studentName}}', 'Dear {{guardianName}},\n\nHere is an update on {{studentName}}''s progress:\n\n{{body}}\n\nPlease feel free to reach out with any questions.\n\nBest regards,\n{{staffName}}', '["studentName","guardianName","staffName","body"]', true),
  ('General Message', 'general', '{{subject}}', 'Dear {{guardianName}},\n\n{{body}}\n\nBest regards,\n{{staffName}}', '["guardianName","staffName","subject","body"]', true),
  ('Conference Request', 'conference_request', 'Conference Request — {{studentName}}', 'Dear {{guardianName}},\n\nI would like to schedule a conference regarding {{studentName}}''s educational program.\n\n{{body}}\n\nPlease respond to confirm your availability.\n\nBest regards,\n{{staffName}}', '["studentName","guardianName","staffName","body"]', true)
ON CONFLICT DO NOTHING;
