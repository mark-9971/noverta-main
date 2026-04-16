-- Document Versions: tracks every save of any document type
CREATE TABLE IF NOT EXISTS document_versions (
  id SERIAL PRIMARY KEY,
  document_type TEXT NOT NULL,
  document_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL REFERENCES students(id),
  district_id INTEGER NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  change_description TEXT,
  snapshot_data TEXT,
  author_user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS doc_ver_doc_type_id_idx ON document_versions(document_type, document_id);
CREATE INDEX IF NOT EXISTS doc_ver_student_idx ON document_versions(student_id);
CREATE INDEX IF NOT EXISTS doc_ver_district_idx ON document_versions(district_id);
CREATE INDEX IF NOT EXISTS doc_ver_created_idx ON document_versions(created_at);

-- Approval Workflows: tracks document progression through stages
CREATE TABLE IF NOT EXISTS approval_workflows (
  id SERIAL PRIMARY KEY,
  document_type TEXT NOT NULL,
  document_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL REFERENCES students(id),
  district_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  current_stage TEXT NOT NULL DEFAULT 'draft',
  stages JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_by_user_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS appr_wf_doc_type_id_idx ON approval_workflows(document_type, document_id);
CREATE INDEX IF NOT EXISTS appr_wf_student_idx ON approval_workflows(student_id);
CREATE INDEX IF NOT EXISTS appr_wf_district_idx ON approval_workflows(district_id);
CREATE INDEX IF NOT EXISTS appr_wf_status_idx ON approval_workflows(status);
CREATE INDEX IF NOT EXISTS appr_wf_stage_idx ON approval_workflows(current_stage);

-- Workflow Approvals: individual approve/reject/request-changes actions
CREATE TABLE IF NOT EXISTS workflow_approvals (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  action TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wf_appr_workflow_idx ON workflow_approvals(workflow_id);
CREATE INDEX IF NOT EXISTS wf_appr_stage_idx ON workflow_approvals(stage);

-- Workflow Reviewers: assigned reviewers per workflow stage
CREATE TABLE IF NOT EXISTS workflow_reviewers (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wf_rev_workflow_idx ON workflow_reviewers(workflow_id);
CREATE INDEX IF NOT EXISTS wf_rev_stage_idx ON workflow_reviewers(stage);
CREATE INDEX IF NOT EXISTS wf_rev_user_idx ON workflow_reviewers(reviewer_user_id);
