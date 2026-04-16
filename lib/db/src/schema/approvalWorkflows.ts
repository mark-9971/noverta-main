import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";

export const approvalWorkflowsTable = pgTable("approval_workflows", {
  id: serial("id").primaryKey(),
  documentType: text("document_type").notNull(),
  documentId: integer("document_id").notNull(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  districtId: integer("district_id").notNull(),
  title: text("title").notNull(),
  currentStage: text("current_stage").notNull().default("draft"),
  stages: jsonb("stages").notNull().$type<string[]>(),
  status: text("status").notNull().default("in_progress"),
  createdByUserId: text("created_by_user_id").notNull(),
  createdByName: text("created_by_name").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("appr_wf_doc_type_id_idx").on(table.documentType, table.documentId),
  index("appr_wf_student_idx").on(table.studentId),
  index("appr_wf_district_idx").on(table.districtId),
  index("appr_wf_status_idx").on(table.status),
  index("appr_wf_stage_idx").on(table.currentStage),
]);

export type ApprovalWorkflow = typeof approvalWorkflowsTable.$inferSelect;
export type NewApprovalWorkflow = typeof approvalWorkflowsTable.$inferInsert;

export const workflowApprovalsTable = pgTable("workflow_approvals", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull().references(() => approvalWorkflowsTable.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  action: text("action").notNull(),
  reviewerUserId: text("reviewer_user_id").notNull(),
  reviewerName: text("reviewer_name").notNull(),
  comment: text("comment"),
  parentCommentId: integer("parent_comment_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("wf_appr_workflow_idx").on(table.workflowId),
  index("wf_appr_stage_idx").on(table.stage),
  index("wf_appr_parent_idx").on(table.parentCommentId),
]);

export type WorkflowApproval = typeof workflowApprovalsTable.$inferSelect;
export type NewWorkflowApproval = typeof workflowApprovalsTable.$inferInsert;

export const workflowReviewersTable = pgTable("workflow_reviewers", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull().references(() => approvalWorkflowsTable.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  reviewerUserId: text("reviewer_user_id").notNull(),
  reviewerName: text("reviewer_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("wf_rev_workflow_idx").on(table.workflowId),
  index("wf_rev_stage_idx").on(table.stage),
  index("wf_rev_user_idx").on(table.reviewerUserId),
]);

export type WorkflowReviewer = typeof workflowReviewersTable.$inferSelect;
export type NewWorkflowReviewer = typeof workflowReviewersTable.$inferInsert;
