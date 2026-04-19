import { FileText, CheckCircle, XCircle, Clock, Users, Shield, Send, RotateCcw } from "lucide-react";

export interface AgingWorkflow {
  id: number;
  title: string;
  currentStage: string;
  updatedAt: string;
  daysInStage: number;
}

export interface WorkflowSummary {
  byStage: Record<string, number>;
  totalActive: number;
  totalCompleted: number;
  totalRejected: number;
  aging: AgingWorkflow[];
}

export interface Workflow {
  id: number;
  documentType: string;
  documentId: number;
  studentId: number;
  title: string;
  currentStage: string;
  stages: string[];
  status: string;
  createdByName: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  studentFirstName: string | null;
  studentLastName: string | null;
}

export interface WorkflowApproval {
  id: number;
  workflowId: number;
  stage: string;
  action: string;
  reviewerName: string;
  comment: string | null;
  parentCommentId: number | null;
  createdAt: string;
}

export interface WorkflowReviewer {
  id: number;
  workflowId: number;
  stage: string;
  reviewerUserId: string;
  reviewerName: string;
}

export interface WorkflowNotification {
  id: number;
  toEmail: string | null;
  toName: string | null;
  subject: string;
  status: string;
  stage: string | null;
  kind: string | null;
  createdAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  deliveredAt: string | null;
  failedReason: string | null;
}

export interface WorkflowDetail extends Workflow {
  createdByUserId: string;
  approvals: WorkflowApproval[];
  reviewers: WorkflowReviewer[];
  notifications: WorkflowNotification[];
}

export interface DocumentVersion {
  id: number;
  documentType: string;
  documentId: number;
  studentId: number;
  versionNumber: number;
  title: string;
  changeDescription: string | null;
  authorName: string;
  createdAt: string;
}

export interface ReviewerAssignment {
  stage: string;
  userId: string;
  name: string;
}

export type ActionType = "approve" | "reject" | "request_changes";

export const STAGE_LABELS: Record<string, string> = {
  draft: "Draft",
  team_review: "Team Review",
  director_signoff: "Director Sign-off",
  parent_delivery: "Parent Delivery",
};

export const STAGE_ICONS: Record<string, typeof FileText> = {
  draft: FileText,
  team_review: Users,
  director_signoff: Shield,
  parent_delivery: Send,
};

export const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: typeof CheckCircle }> = {
  in_progress: { color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: Clock },
  completed: { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle },
  rejected: { color: "text-red-700", bg: "bg-red-50 border-red-200", icon: XCircle },
};

export const ACTION_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  approved: { label: "Approved", color: "text-emerald-600", icon: CheckCircle },
  rejected: { label: "Rejected", color: "text-red-600", icon: XCircle },
  changes_requested: { label: "Changes Requested", color: "text-amber-600", icon: RotateCcw },
  comment: { label: "Comment", color: "text-blue-600", icon: Clock },
};

export const ALL_STAGES = [
  { value: "draft", label: "Draft" },
  { value: "team_review", label: "Team Review" },
  { value: "director_signoff", label: "Director Sign-off" },
  { value: "parent_delivery", label: "Parent Delivery" },
];

export const DEFAULT_STAGES = ["draft", "team_review", "director_signoff", "parent_delivery"];
