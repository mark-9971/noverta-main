import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileText, CheckCircle, XCircle, Clock, ArrowRight,
  History, Plus, ChevronDown, ChevronUp, AlertTriangle, RotateCcw,
  Clipboard, Users, Shield, Send, UserPlus, Timer, Settings,
} from "lucide-react";

interface AgingWorkflow {
  id: number;
  title: string;
  currentStage: string;
  updatedAt: string;
  daysInStage: number;
}

interface WorkflowSummary {
  byStage: Record<string, number>;
  totalActive: number;
  totalCompleted: number;
  totalRejected: number;
  aging: AgingWorkflow[];
}

interface Workflow {
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

interface WorkflowApproval {
  id: number;
  workflowId: number;
  stage: string;
  action: string;
  reviewerName: string;
  comment: string | null;
  parentCommentId: number | null;
  createdAt: string;
}

interface WorkflowReviewer {
  id: number;
  workflowId: number;
  stage: string;
  reviewerUserId: string;
  reviewerName: string;
}

interface WorkflowDetail extends Workflow {
  createdByUserId: string;
  approvals: WorkflowApproval[];
  reviewers: WorkflowReviewer[];
}

interface DocumentVersion {
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

const STAGE_LABELS: Record<string, string> = {
  draft: "Draft",
  team_review: "Team Review",
  director_signoff: "Director Sign-off",
  parent_delivery: "Parent Delivery",
};

const STAGE_ICONS: Record<string, typeof FileText> = {
  draft: FileText,
  team_review: Users,
  director_signoff: Shield,
  parent_delivery: Send,
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: typeof CheckCircle }> = {
  in_progress: { color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: Clock },
  completed: { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle },
  rejected: { color: "text-red-700", bg: "bg-red-50 border-red-200", icon: XCircle },
};

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  approved: { label: "Approved", color: "text-emerald-600", icon: CheckCircle },
  rejected: { label: "Rejected", color: "text-red-600", icon: XCircle },
  changes_requested: { label: "Changes Requested", color: "text-amber-600", icon: RotateCcw },
  comment: { label: "Comment", color: "text-blue-600", icon: Clock },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function daysAgo(d: string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

function AgingBadge({ days }: { days: number }) {
  const color = days >= 7 ? "bg-red-100 text-red-700 border-red-200" : days >= 3 ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      <Timer className="w-3 h-3" />
      {days}d
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const label = STAGE_LABELS[stage] || stage.replace(/_/g, " ");
  const Icon = STAGE_ICONS[stage] || FileText;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.in_progress;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {status === "in_progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function StageProgress({ stages, currentStage, status }: { stages: string[]; currentStage: string; status: string }) {
  const currentIdx = stages.indexOf(currentStage);
  return (
    <div className="flex items-center gap-1">
      {stages.map((stage, i) => {
        const isCompleted = status === "completed" || i < currentIdx;
        const isCurrent = i === currentIdx && status === "in_progress";
        const isRejected = status === "rejected" && i === currentIdx;
        return (
          <div key={stage} className="flex items-center gap-1">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${isCompleted ? "bg-emerald-500 text-white" : ""}
                ${isCurrent ? "bg-blue-500 text-white ring-2 ring-blue-200" : ""}
                ${isRejected ? "bg-red-500 text-white" : ""}
                ${!isCompleted && !isCurrent && !isRejected ? "bg-gray-200 text-gray-500" : ""}
              `}
              title={STAGE_LABELS[stage] || stage}
            >
              {isCompleted ? <CheckCircle className="w-3.5 h-3.5" /> : isRejected ? <XCircle className="w-3.5 h-3.5" /> : i + 1}
            </div>
            {i < stages.length - 1 && (
              <div className={`w-6 h-0.5 ${i < currentIdx || status === "completed" ? "bg-emerald-400" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function groupApprovalsByStage(approvals: WorkflowApproval[], stages: string[]) {
  const grouped: Record<string, WorkflowApproval[]> = {};
  for (const stage of stages) {
    grouped[stage] = [];
  }
  for (const a of approvals) {
    if (!grouped[a.stage]) grouped[a.stage] = [];
    grouped[a.stage].push(a);
  }
  return grouped;
}

function buildThreadTree(approvals: WorkflowApproval[]): { roots: WorkflowApproval[]; children: Record<number, WorkflowApproval[]> } {
  const children: Record<number, WorkflowApproval[]> = {};
  const roots: WorkflowApproval[] = [];
  for (const a of approvals) {
    if (a.parentCommentId) {
      if (!children[a.parentCommentId]) children[a.parentCommentId] = [];
      children[a.parentCommentId].push(a);
    } else {
      roots.push(a);
    }
  }
  return { roots, children };
}

interface ReviewerAssignment {
  stage: string;
  userId: string;
  name: string;
}

export default function DocumentWorkflowPage() {
  const [summary, setSummary] = useState<WorkflowSummary | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterStage, setFilterStage] = useState<string>("all");
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionDialog, setActionDialog] = useState<{ type: "approve" | "reject" | "request_changes"; workflowId: number } | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [versionHistory, setVersionHistory] = useState<DocumentVersion[]>([]);
  const [versionExpanded, setVersionExpanded] = useState(false);
  const [createDialog, setCreateDialog] = useState(false);
  const ALL_STAGES = [
    { value: "draft", label: "Draft" },
    { value: "team_review", label: "Team Review" },
    { value: "director_signoff", label: "Director Sign-off" },
    { value: "parent_delivery", label: "Parent Delivery" },
  ];
  const [createForm, setCreateForm] = useState({ documentType: "iep", documentId: "", studentId: "", title: "" });
  const [createStages, setCreateStages] = useState<string[]>(["draft", "team_review", "director_signoff", "parent_delivery"]);
  const [createReviewers, setCreateReviewers] = useState<ReviewerAssignment[]>([]);
  const [replyTo, setReplyTo] = useState<{ id: number; workflowId: number; reviewerName: string } | null>(null);
  const [replyComment, setReplyComment] = useState("");
  const [pwnDialog, setPwnDialog] = useState(false);
  const [pwnForm, setPwnForm] = useState({ studentId: "", meetingId: "" });
  const [pwnLoading, setPwnLoading] = useState(false);
  const [agingExpanded, setAgingExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterStage !== "all") params.set("currentStage", filterStage);

      const [summaryRes, workflowsRes] = await Promise.all([
        authFetch("/api/document-workflow/dashboard/summary"),
        authFetch(`/api/document-workflow/workflows?${params}`),
      ]);
      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (workflowsRes.ok) setWorkflows(await workflowsRes.json());
    } catch {
      toast.error("Failed to load workflow data");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterStage]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function openDetail(wf: Workflow) {
    setDetailLoading(true);
    setSelectedWorkflow(null);
    setVersionHistory([]);
    try {
      const [detailRes, versionsRes] = await Promise.all([
        authFetch(`/api/document-workflow/workflows/${wf.id}`),
        authFetch(`/api/document-workflow/versions/${wf.documentType}/${wf.documentId}`),
      ]);
      if (detailRes.ok) setSelectedWorkflow(await detailRes.json());
      if (versionsRes.ok) setVersionHistory(await versionsRes.json());
    } catch {
      toast.error("Failed to load details");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleAction() {
    if (!actionDialog) return;
    setActionLoading(true);
    try {
      const endpoint = actionDialog.type === "approve" ? "approve"
        : actionDialog.type === "reject" ? "reject" : "request-changes";
      const res = await authFetch(`/api/document-workflow/workflows/${actionDialog.workflowId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: actionComment }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Action failed");
        return;
      }
      toast.success(actionDialog.type === "approve" ? "Stage approved" : actionDialog.type === "reject" ? "Workflow rejected" : "Changes requested");
      setActionDialog(null);
      setActionComment("");
      fetchData();
      if (selectedWorkflow) openDetail({ ...selectedWorkflow } as Workflow);
    } catch {
      toast.error("Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCreate() {
    try {
      const res = await authFetch("/api/document-workflow/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: createForm.documentType,
          documentId: parseInt(createForm.documentId, 10),
          studentId: parseInt(createForm.studentId, 10),
          title: createForm.title,
          stages: createStages.length > 0 ? createStages : undefined,
          reviewers: createReviewers.filter(r => r.userId && r.name && r.stage),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to create workflow");
        return;
      }
      toast.success("Approval workflow started");
      setCreateDialog(false);
      setCreateForm({ documentType: "iep", documentId: "", studentId: "", title: "" });
      setCreateStages(["draft", "team_review", "director_signoff", "parent_delivery"]);
      setCreateReviewers([]);
      fetchData();
    } catch {
      toast.error("Failed to create workflow");
    }
  }

  async function handleReply() {
    if (!replyTo || !replyComment.trim()) return;
    try {
      const res = await authFetch(`/api/document-workflow/workflows/${replyTo.workflowId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: replyComment, parentCommentId: replyTo.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to post reply");
        return;
      }
      toast.success("Reply posted");
      setReplyTo(null);
      setReplyComment("");
      if (selectedWorkflow) openDetail({ ...selectedWorkflow } as Workflow);
    } catch {
      toast.error("Failed to post reply");
    }
  }

  async function handleGeneratePwn() {
    setPwnLoading(true);
    try {
      const res = await authFetch("/api/document-workflow/generate-pwn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: parseInt(pwnForm.studentId, 10),
          meetingId: pwnForm.meetingId ? parseInt(pwnForm.meetingId, 10) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to generate PWN");
        return;
      }
      toast.success("Prior Written Notice generated");
      setPwnDialog(false);
      setPwnForm({ studentId: "", meetingId: "" });
    } catch {
      toast.error("Failed to generate PWN");
    } finally {
      setPwnLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Document Workflow</h1>
          <p className="text-sm text-gray-500 mt-1">Manage document approvals, version history, and Prior Written Notices</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPwnDialog(true)}>
            <Clipboard className="w-4 h-4 mr-2" />
            Generate PWN
          </Button>
          <Button onClick={() => setCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Start Workflow
          </Button>
        </div>
      </div>

      {loading && !summary ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : summary && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 font-medium">Active</p>
                    <p className="text-2xl font-bold text-blue-900">{summary.totalActive}</p>
                  </div>
                  <Clock className="w-8 h-8 text-blue-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-emerald-600 font-medium">Completed</p>
                    <p className="text-2xl font-bold text-emerald-900">{summary.totalCompleted}</p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-red-600 font-medium">Rejected</p>
                    <p className="text-2xl font-bold text-red-900">{summary.totalRejected}</p>
                  </div>
                  <XCircle className="w-8 h-8 text-red-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardContent className="pt-4 pb-4">
                <p className="text-sm text-gray-600 font-medium mb-2">By Stage</p>
                {Object.keys(summary.byStage).length === 0 ? (
                  <p className="text-xs text-gray-400">No active workflows</p>
                ) : (
                  <div className="space-y-1">
                    {Object.entries(summary.byStage).map(([stage, count]) => (
                      <div key={stage} className="flex justify-between text-xs">
                        <span className="text-gray-600">{STAGE_LABELS[stage] || stage}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {summary.aging.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/30">
              <CardHeader className="pb-2 pt-3">
                <button
                  onClick={() => setAgingExpanded(!agingExpanded)}
                  className="flex items-center gap-2 w-full"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <CardTitle className="text-sm text-amber-800">
                    Aging Workflows ({summary.aging.length})
                  </CardTitle>
                  <span className="text-xs text-amber-600 ml-1">Stalled 3+ days in current stage</span>
                  {agingExpanded ? <ChevronUp className="w-3 h-3 text-amber-500 ml-auto" /> : <ChevronDown className="w-3 h-3 text-amber-500 ml-auto" />}
                </button>
              </CardHeader>
              {agingExpanded && (
                <CardContent className="pt-0 pb-3">
                  <div className="space-y-1.5">
                    {summary.aging.map(a => (
                      <div key={a.id} className="flex items-center justify-between text-xs px-2 py-1.5 bg-white rounded border border-amber-100">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800 truncate max-w-[200px]">{a.title}</span>
                          <StageBadge stage={a.currentStage} />
                        </div>
                        <AgingBadge days={a.daysInStage} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Approval Workflows</CardTitle>
            <div className="flex gap-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStage} onValueChange={setFilterStage}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="team_review">Team Review</SelectItem>
                  <SelectItem value="director_signoff">Director Sign-off</SelectItem>
                  <SelectItem value="parent_delivery">Parent Delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : workflows.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No workflows found</p>
              <p className="text-sm text-gray-400 mt-1">Start a workflow to route a document through review and approval</p>
            </div>
          ) : (
            <div className="divide-y">
              {workflows.map(wf => {
                const days = wf.status === "in_progress" ? daysAgo(wf.updatedAt) : 0;
                return (
                  <button
                    key={wf.id}
                    onClick={() => openDetail(wf)}
                    className="w-full text-left py-3 px-2 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 truncate">{wf.title}</span>
                          <StatusBadge status={wf.status} />
                          {days >= 3 && <AgingBadge days={days} />}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{wf.studentFirstName} {wf.studentLastName}</span>
                          <span className="text-gray-300">|</span>
                          <span className="capitalize">{wf.documentType.replace(/_/g, " ")}</span>
                          <span className="text-gray-300">|</span>
                          <span>Started {formatDate(wf.createdAt)} by {wf.createdByName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        <StageProgress stages={wf.stages} currentStage={wf.currentStage} status={wf.status} />
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {(detailLoading || selectedWorkflow) && (
        <Dialog open={detailLoading || !!selectedWorkflow} onOpenChange={() => { setSelectedWorkflow(null); setVersionExpanded(false); }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            {detailLoading ? (
              <div className="space-y-4 py-8">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-32" />
              </div>
            ) : selectedWorkflow && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selectedWorkflow.title}
                    <StatusBadge status={selectedWorkflow.status} />
                    {selectedWorkflow.status === "in_progress" && daysAgo(selectedWorkflow.updatedAt) >= 3 && (
                      <AgingBadge days={daysAgo(selectedWorkflow.updatedAt)} />
                    )}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Student:</span>{" "}
                      <span className="font-medium">{selectedWorkflow.studentFirstName} {selectedWorkflow.studentLastName}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Document:</span>{" "}
                      <span className="font-medium capitalize">{selectedWorkflow.documentType.replace(/_/g, " ")} #{selectedWorkflow.documentId}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Started:</span>{" "}
                      <span className="font-medium">{formatDateTime(selectedWorkflow.createdAt)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Current Stage:</span>{" "}
                      <StageBadge stage={selectedWorkflow.currentStage} />
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Progress</p>
                    <div className="flex items-center gap-2">
                      {selectedWorkflow.stages.map((stage, i) => {
                        const currentIdx = selectedWorkflow.stages.indexOf(selectedWorkflow.currentStage);
                        const isCompleted = selectedWorkflow.status === "completed" || i < currentIdx;
                        const isCurrent = i === currentIdx && selectedWorkflow.status === "in_progress";
                        return (
                          <div key={stage} className="flex items-center gap-2 flex-1">
                            <div className={`flex-1 rounded-lg px-3 py-2 text-center text-xs font-medium border
                              ${isCompleted ? "bg-emerald-50 border-emerald-200 text-emerald-700" : ""}
                              ${isCurrent ? "bg-blue-50 border-blue-300 text-blue-700 ring-1 ring-blue-300" : ""}
                              ${!isCompleted && !isCurrent ? "bg-gray-50 border-gray-200 text-gray-400" : ""}
                            `}>
                              {STAGE_LABELS[stage] || stage}
                            </div>
                            {i < selectedWorkflow.stages.length - 1 && (
                              <ArrowRight className={`w-3 h-3 shrink-0 ${i < currentIdx || selectedWorkflow.status === "completed" ? "text-emerald-400" : "text-gray-300"}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {selectedWorkflow.reviewers && selectedWorkflow.reviewers.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                        <UserPlus className="w-4 h-4" />
                        Assigned Reviewers
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {selectedWorkflow.stages.map(stage => {
                          const stageReviewers = selectedWorkflow.reviewers.filter(r => r.stage === stage);
                          if (stageReviewers.length === 0) return null;
                          return (
                            <div key={stage} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 text-xs">
                              <StageBadge stage={stage} />
                              <div className="space-y-0.5">
                                {stageReviewers.map(r => (
                                  <p key={r.id} className="text-gray-700 font-medium">{r.reviewerName}</p>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedWorkflow.status === "in_progress" && (
                    <div className="flex gap-2 border-t pt-4">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => setActionDialog({ type: "approve", workflowId: selectedWorkflow.id })}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-amber-600 border-amber-300 hover:bg-amber-50"
                        onClick={() => setActionDialog({ type: "request_changes", workflowId: selectedWorkflow.id })}
                      >
                        <RotateCcw className="w-4 h-4 mr-1" /> Request Changes
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-300 hover:bg-red-50"
                        onClick={() => setActionDialog({ type: "reject", workflowId: selectedWorkflow.id })}
                      >
                        <XCircle className="w-4 h-4 mr-1" /> Reject
                      </Button>
                    </div>
                  )}

                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Approval History</p>
                    {selectedWorkflow.approvals.length === 0 ? (
                      <p className="text-xs text-gray-400">No actions taken yet</p>
                    ) : (
                      <div className="space-y-3">
                        {Object.entries(groupApprovalsByStage(selectedWorkflow.approvals, selectedWorkflow.stages)).map(([stage, stageApprovals]) => {
                          if (stageApprovals.length === 0) return null;
                          const { roots, children } = buildThreadTree(stageApprovals);
                          return (
                            <div key={stage}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <StageBadge stage={stage} />
                                <span className="text-xs text-gray-400">({stageApprovals.length} action{stageApprovals.length > 1 ? "s" : ""})</span>
                              </div>
                              <div className="space-y-1.5 ml-2 border-l-2 border-gray-100 pl-3">
                                {roots.map(a => {
                                  const cfg = ACTION_CONFIG[a.action] || { label: a.action, color: "text-gray-600", icon: Clock };
                                  const Icon = cfg.icon;
                                  const replies = children[a.id] || [];
                                  return (
                                    <div key={a.id}>
                                      <div className="flex items-start gap-3 p-2 rounded-lg bg-gray-50">
                                        <Icon className={`w-4 h-4 mt-0.5 ${cfg.color}`} />
                                        <div className="text-xs space-y-0.5 flex-1">
                                          <div>
                                            <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                                            <span className="text-gray-500"> by </span>
                                            <span className="font-medium text-gray-700">{a.reviewerName}</span>
                                          </div>
                                          <p className="text-gray-400">{formatDateTime(a.createdAt)}</p>
                                          {a.comment && <p className="text-gray-600 mt-1 bg-white p-2 rounded border border-gray-100">{a.comment}</p>}
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setReplyTo({ id: a.id, workflowId: selectedWorkflow.id, reviewerName: a.reviewerName }); }}
                                            className="text-blue-500 hover:text-blue-700 text-[10px] mt-1"
                                          >
                                            Reply
                                          </button>
                                        </div>
                                      </div>
                                      {replies.length > 0 && (
                                        <div className="ml-6 mt-1 space-y-1 border-l-2 border-blue-100 pl-2">
                                          {replies.map(r => {
                                            const rc = ACTION_CONFIG[r.action] || { label: r.action, color: "text-gray-600", icon: Clock };
                                            const RIcon = rc.icon;
                                            return (
                                              <div key={r.id} className="flex items-start gap-2 p-1.5 rounded bg-blue-50/50 text-xs">
                                                <RIcon className={`w-3 h-3 mt-0.5 ${rc.color}`} />
                                                <div className="space-y-0.5">
                                                  <span className="font-medium text-gray-700">{r.reviewerName}</span>
                                                  <p className="text-gray-400 text-[10px]">{formatDateTime(r.createdAt)}</p>
                                                  {r.comment && <p className="text-gray-600">{r.comment}</p>}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {replyTo && (
                      <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-xs text-blue-700 mb-1">Replying to {replyTo.reviewerName}</p>
                        <textarea
                          className="w-full border rounded p-1.5 text-xs min-h-[50px] focus:outline-none focus:ring-1 focus:ring-blue-400"
                          value={replyComment}
                          onChange={e => setReplyComment(e.target.value)}
                          placeholder="Write a reply..."
                        />
                        <div className="flex gap-1.5 mt-1">
                          <Button size="sm" className="h-6 text-xs bg-blue-600 hover:bg-blue-700" onClick={handleReply} disabled={!replyComment.trim()}>
                            Send
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => { setReplyTo(null); setReplyComment(""); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-3">
                    <button
                      onClick={() => setVersionExpanded(!versionExpanded)}
                      className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                    >
                      <History className="w-4 h-4" />
                      Version History ({versionHistory.length})
                      {versionExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {versionExpanded && (
                      <div className="mt-2 space-y-2">
                        {versionHistory.length === 0 ? (
                          <p className="text-xs text-gray-400">No versions recorded</p>
                        ) : versionHistory.map(v => (
                          <div key={v.id} className="flex items-start gap-3 p-2 rounded-lg bg-gray-50 text-xs">
                            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold shrink-0">
                              {v.versionNumber}
                            </div>
                            <div className="space-y-0.5">
                              <p className="font-medium text-gray-700">{v.title}</p>
                              {v.changeDescription && <p className="text-gray-500">{v.changeDescription}</p>}
                              <p className="text-gray-400">{v.authorName} — {formatDateTime(v.createdAt)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={!!actionDialog} onOpenChange={() => { setActionDialog(null); setActionComment(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "approve" ? "Approve Stage" : actionDialog?.type === "reject" ? "Reject Workflow" : "Request Changes"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {actionDialog?.type === "reject" && (
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700">Rejecting will stop the entire workflow. The document will need a new workflow to proceed.</p>
              </div>
            )}
            <div>
              <Label>Comment {actionDialog?.type === "request_changes" && <span className="text-red-500">*</span>}</Label>
              <textarea
                className="w-full mt-1 border rounded-lg p-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={actionComment}
                onChange={e => setActionComment(e.target.value)}
                placeholder={actionDialog?.type === "request_changes" ? "Describe the changes needed..." : "Optional comment..."}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionDialog(null); setActionComment(""); }}>Cancel</Button>
            <Button
              onClick={handleAction}
              disabled={actionLoading || (actionDialog?.type === "request_changes" && !actionComment.trim())}
              className={actionDialog?.type === "reject" ? "bg-red-600 hover:bg-red-700" : actionDialog?.type === "request_changes" ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}
            >
              {actionLoading ? "Processing..." : actionDialog?.type === "approve" ? "Approve" : actionDialog?.type === "reject" ? "Reject" : "Request Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialog} onOpenChange={(open) => { setCreateDialog(open); if (!open) { setCreateReviewers([]); setCreateStages(["draft", "team_review", "director_signoff", "parent_delivery"]); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Start Approval Workflow</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Document Type</Label>
              <Select value={createForm.documentType} onValueChange={v => setCreateForm(f => ({ ...f, documentType: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="iep">IEP</SelectItem>
                  <SelectItem value="evaluation">Evaluation</SelectItem>
                  <SelectItem value="progress_report">Progress Report</SelectItem>
                  <SelectItem value="prior_written_notice">Prior Written Notice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Document ID</Label>
              <Input className="mt-1" type="number" value={createForm.documentId} onChange={e => setCreateForm(f => ({ ...f, documentId: e.target.value }))} placeholder="Enter document ID" />
            </div>
            <div>
              <Label>Student ID</Label>
              <Input className="mt-1" type="number" value={createForm.studentId} onChange={e => setCreateForm(f => ({ ...f, studentId: e.target.value }))} placeholder="Enter student ID" />
            </div>
            <div>
              <Label>Title</Label>
              <Input className="mt-1" value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Annual IEP Review — Jane Doe" />
            </div>

            <div className="border-t pt-3">
              <Label className="flex items-center gap-1.5 mb-2">
                <Settings className="w-3.5 h-3.5" />
                Workflow Stages
              </Label>
              <p className="text-xs text-gray-400 mb-2">Select which stages this workflow should go through. At least one stage is required.</p>
              <div className="flex flex-wrap gap-2">
                {ALL_STAGES.map(stage => {
                  const active = createStages.includes(stage.value);
                  return (
                    <button
                      key={stage.value}
                      type="button"
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${active ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300"}`}
                      onClick={() => {
                        if (active && createStages.length <= 1) return;
                        setCreateStages(s => active ? s.filter(v => v !== stage.value) : [...s, stage.value]);
                      }}
                    >
                      {active ? "✓ " : ""}{stage.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" />
                  Stage Reviewers
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs"
                  onClick={() => setCreateReviewers(r => [...r, { stage: "draft", userId: "", name: "" }])}
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Reviewer
                </Button>
              </div>
              {createReviewers.length === 0 ? (
                <p className="text-xs text-gray-400">No reviewers assigned — any privileged staff can act on each stage.</p>
              ) : (
                <div className="space-y-2">
                  {createReviewers.map((rev, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                      <Select value={rev.stage} onValueChange={v => setCreateReviewers(r => r.map((item, i) => i === idx ? { ...item, stage: v } : item))}>
                        <SelectTrigger className="w-[120px] h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="team_review">Team Review</SelectItem>
                          <SelectItem value="director_signoff">Director Sign-off</SelectItem>
                          <SelectItem value="parent_delivery">Parent Delivery</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-7 text-xs flex-1"
                        value={rev.name}
                        onChange={e => setCreateReviewers(r => r.map((item, i) => i === idx ? { ...item, name: e.target.value } : item))}
                        placeholder="Reviewer name"
                      />
                      <Input
                        className="h-7 text-xs w-[100px]"
                        value={rev.userId}
                        onChange={e => setCreateReviewers(r => r.map((item, i) => i === idx ? { ...item, userId: e.target.value } : item))}
                        placeholder="User ID"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                        onClick={() => setCreateReviewers(r => r.filter((_, i) => i !== idx))}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialog(false); setCreateReviewers([]); setCreateStages(["draft", "team_review", "director_signoff", "parent_delivery"]); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!createForm.documentId || !createForm.studentId || !createForm.title}>
              Start Workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pwnDialog} onOpenChange={setPwnDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Prior Written Notice</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            Auto-generate a PWN from a student's IEP meeting data. The notice will be pre-populated with goals, team decisions, and required fields per 603 CMR 28.07(1).
          </p>
          <div className="space-y-3">
            <div>
              <Label>Student ID <span className="text-red-500">*</span></Label>
              <Input className="mt-1" type="number" value={pwnForm.studentId} onChange={e => setPwnForm(f => ({ ...f, studentId: e.target.value }))} placeholder="Enter student ID" />
            </div>
            <div>
              <Label>Meeting ID (optional)</Label>
              <Input className="mt-1" type="number" value={pwnForm.meetingId} onChange={e => setPwnForm(f => ({ ...f, meetingId: e.target.value }))} placeholder="Link to a specific IEP meeting" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwnDialog(false)}>Cancel</Button>
            <Button onClick={handleGeneratePwn} disabled={pwnLoading || !pwnForm.studentId}>
              {pwnLoading ? "Generating..." : "Generate PWN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
