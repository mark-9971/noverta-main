import { useState, useEffect, useCallback, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Clipboard, Plus } from "lucide-react";
import {
  Workflow,
  WorkflowSummary,
  WorkflowDetail,
  DocumentVersion,
  ReviewerAssignment,
  ActionType,
  DEFAULT_STAGES,
} from "./types";
import { WorkflowSummaryPanel } from "./WorkflowSummaryPanel";
import { WorkflowList } from "./WorkflowList";
import { WorkflowDetailDialog } from "./WorkflowDetailDialog";
import { DocumentPreview } from "./InlineDocumentViewer";
import { ActionDialog } from "./ActionDialog";
import { CreateWorkflowDialog } from "./CreateWorkflowDialog";
import { GeneratePwnDialog } from "./GeneratePwnDialog";

export default function DocumentWorkflowPage() {
  const [summary, setSummary] = useState<WorkflowSummary | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterStage, setFilterStage] = useState<string>("all");
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionDialog, setActionDialog] = useState<{ type: ActionType; workflowId: number } | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [versionHistory, setVersionHistory] = useState<DocumentVersion[]>([]);
  const [versionExpanded, setVersionExpanded] = useState(false);
  const [createDialog, setCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ documentType: "iep", documentId: "", studentId: "", title: "" });
  const [createStages, setCreateStages] = useState<string[]>([...DEFAULT_STAGES]);
  const [createReviewers, setCreateReviewers] = useState<ReviewerAssignment[]>([]);
  const [replyTo, setReplyTo] = useState<{ id: number; workflowId: number; reviewerName: string } | null>(null);
  const [replyComment, setReplyComment] = useState("");
  const [pwnDialog, setPwnDialog] = useState(false);
  const [pwnForm, setPwnForm] = useState({ studentId: "", meetingId: "" });
  const [pwnLoading, setPwnLoading] = useState(false);
  const [agingExpanded, setAgingExpanded] = useState(false);
  const [documentViewerState, setDocumentViewerState] = useState<Record<number, { open: boolean; preview: DocumentPreview | null }>>({});
  const search = useSearch();
  const [, setLocation] = useLocation();
  const deepLinkHandledRef = useRef<number | null>(null);

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

  const openDetail = useCallback(async (wf: Workflow) => {
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
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const wfIdRaw = params.get("workflowId");
    if (!wfIdRaw) return;
    const wfId = parseInt(wfIdRaw, 10);
    if (!Number.isFinite(wfId) || wfId <= 0) return;
    if (deepLinkHandledRef.current === wfId) return;
    deepLinkHandledRef.current = wfId;
    const focus = params.get("focus") === "review" ? "review" : "overview";
    (async () => {
      try {
        const res = await authFetch(`/api/document-workflow/workflows/${wfId}`);
        if (!res.ok) {
          toast.error("Could not load that workflow");
          return;
        }
        const detail = await res.json() as WorkflowDetail;
        await openDetail(detail as unknown as Workflow);
        if (focus === "review" && detail.status === "in_progress") {
          const authorized = (detail.reviewers || []).some(
            r => r.stage === detail.currentStage,
          );
          if (authorized) {
            setActionDialog({ type: "approve", workflowId: detail.id });
          }
        }
      } catch {
        toast.error("Could not load that workflow");
      } finally {
        setLocation("/document-workflow", { replace: true });
      }
    })();
  }, [search, openDetail, setLocation]);

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
      setCreateStages([...DEFAULT_STAGES]);
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
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : summary && (
        <WorkflowSummaryPanel
          summary={summary}
          agingExpanded={agingExpanded}
          onToggleAging={() => setAgingExpanded(!agingExpanded)}
        />
      )}

      <WorkflowList
        workflows={workflows}
        loading={loading}
        filterStatus={filterStatus}
        filterStage={filterStage}
        onFilterStatusChange={setFilterStatus}
        onFilterStageChange={setFilterStage}
        onOpenDetail={openDetail}
      />

      <WorkflowDetailDialog
        detailLoading={detailLoading}
        selectedWorkflow={selectedWorkflow}
        versionHistory={versionHistory}
        versionExpanded={versionExpanded}
        onVersionToggle={() => setVersionExpanded(!versionExpanded)}
        onClose={() => { setSelectedWorkflow(null); setVersionExpanded(false); setDocumentViewerState({}); }}
        onAction={(type, workflowId) => setActionDialog({ type, workflowId })}
        replyTo={replyTo}
        replyComment={replyComment}
        onReplyToChange={setReplyTo}
        onReplyCommentChange={setReplyComment}
        onReplySubmit={handleReply}
        documentViewerOpen={selectedWorkflow ? documentViewerState[selectedWorkflow.id]?.open ?? false : false}
        documentViewerPreview={selectedWorkflow ? documentViewerState[selectedWorkflow.id]?.preview ?? null : null}
        onDocumentViewerOpenChange={(open) => {
          if (!selectedWorkflow) return;
          const wfId = selectedWorkflow.id;
          setDocumentViewerState(prev => ({ ...prev, [wfId]: { open, preview: prev[wfId]?.preview ?? null } }));
        }}
        onDocumentViewerPreviewLoaded={(preview) => {
          if (!selectedWorkflow) return;
          const wfId = selectedWorkflow.id;
          setDocumentViewerState(prev => ({ ...prev, [wfId]: { open: prev[wfId]?.open ?? true, preview } }));
        }}
      />

      <ActionDialog
        actionDialog={actionDialog}
        actionComment={actionComment}
        actionLoading={actionLoading}
        onCommentChange={setActionComment}
        onClose={() => { setActionDialog(null); setActionComment(""); }}
        onSubmit={handleAction}
      />

      <CreateWorkflowDialog
        open={createDialog}
        onOpenChange={(open) => {
          setCreateDialog(open);
          if (!open) {
            setCreateReviewers([]);
            setCreateStages([...DEFAULT_STAGES]);
          }
        }}
        form={createForm}
        onFormChange={setCreateForm}
        stages={createStages}
        onStagesChange={setCreateStages}
        reviewers={createReviewers}
        onReviewersChange={setCreateReviewers}
        onSubmit={handleCreate}
      />

      <GeneratePwnDialog
        open={pwnDialog}
        onOpenChange={setPwnDialog}
        form={pwnForm}
        onFormChange={setPwnForm}
        loading={pwnLoading}
        onSubmit={handleGeneratePwn}
      />
    </div>
  );
}
