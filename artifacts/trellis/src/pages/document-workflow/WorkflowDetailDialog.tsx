import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, XCircle, RotateCcw, ArrowRight, UserPlus, History, ChevronDown, ChevronUp, Clock, Mail, AlertCircle } from "lucide-react";
import { WorkflowDetail, DocumentVersion, ActionType, STAGE_LABELS, ACTION_CONFIG } from "./types";
import { AgingBadge, StatusBadge, StageBadge, daysAgo, formatDateTime, groupApprovalsByStage, buildThreadTree } from "./shared";
import { InlineDocumentViewer, DocumentPreview } from "./InlineDocumentViewer";

interface Props {
  detailLoading: boolean;
  selectedWorkflow: WorkflowDetail | null;
  versionHistory: DocumentVersion[];
  versionExpanded: boolean;
  onVersionToggle: () => void;
  onClose: () => void;
  onAction: (type: ActionType, workflowId: number) => void;
  replyTo: { id: number; workflowId: number; reviewerName: string } | null;
  replyComment: string;
  onReplyToChange: (v: { id: number; workflowId: number; reviewerName: string } | null) => void;
  onReplyCommentChange: (v: string) => void;
  onReplySubmit: () => void;
  documentViewerOpen: boolean;
  documentViewerPreview: DocumentPreview | null;
  onDocumentViewerOpenChange: (open: boolean) => void;
  onDocumentViewerPreviewLoaded: (preview: DocumentPreview) => void;
}

export function WorkflowDetailDialog({
  detailLoading,
  selectedWorkflow,
  versionHistory,
  versionExpanded,
  onVersionToggle,
  onClose,
  onAction,
  replyTo,
  replyComment,
  onReplyToChange,
  onReplyCommentChange,
  onReplySubmit,
  documentViewerOpen,
  documentViewerPreview,
  onDocumentViewerOpenChange,
  onDocumentViewerPreviewLoaded,
}: Props) {
  const open = detailLoading || !!selectedWorkflow;
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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

              <InlineDocumentViewer
                workflowId={selectedWorkflow.id}
                documentType={selectedWorkflow.documentType}
                studentName={`${selectedWorkflow.studentFirstName ?? ""} ${selectedWorkflow.studentLastName ?? ""}`.trim()}
                open={documentViewerOpen}
                onOpenChange={onDocumentViewerOpenChange}
                preview={documentViewerPreview}
                onPreviewLoaded={onDocumentViewerPreviewLoaded}
              />

              {selectedWorkflow.status === "in_progress" && (
                <div className="flex gap-2 border-t pt-4">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => onAction("approve", selectedWorkflow.id)}
                  >
                    <CheckCircle className="w-4 h-4 mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-amber-600 border-amber-300 hover:bg-amber-50"
                    onClick={() => onAction("request_changes", selectedWorkflow.id)}
                  >
                    <RotateCcw className="w-4 h-4 mr-1" /> Request Changes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => onAction("reject", selectedWorkflow.id)}
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
                                        onClick={(e) => { e.stopPropagation(); onReplyToChange({ id: a.id, workflowId: selectedWorkflow.id, reviewerName: a.reviewerName }); }}
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
                      onChange={e => onReplyCommentChange(e.target.value)}
                      placeholder="Write a reply..."
                    />
                    <div className="flex gap-1.5 mt-1">
                      <Button size="sm" className="h-6 text-xs bg-blue-600 hover:bg-blue-700" onClick={onReplySubmit} disabled={!replyComment.trim()}>
                        Send
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => { onReplyToChange(null); onReplyCommentChange(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t pt-3">
                <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                  <Mail className="w-4 h-4" />
                  Notifications ({selectedWorkflow.notifications?.length ?? 0})
                </p>
                {!selectedWorkflow.notifications || selectedWorkflow.notifications.length === 0 ? (
                  <p className="text-xs text-gray-400">No notifications sent yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedWorkflow.notifications.map(n => {
                      const isFailed = n.status === "failed" || n.status === "bounced" || n.status === "complained";
                      const isNotConfigured = n.status === "not_configured";
                      const isDelivered = n.status === "delivered";
                      const isAccepted = n.status === "accepted" || n.status === "sent";
                      const statusColor = isFailed ? "text-red-600 bg-red-50 border-red-200"
                        : isNotConfigured ? "text-gray-600 bg-gray-100 border-gray-200"
                        : isDelivered ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                        : isAccepted ? "text-blue-700 bg-blue-50 border-blue-200"
                        : "text-gray-600 bg-gray-50 border-gray-200";
                      const statusLabel = isNotConfigured ? "not configured" : n.status;
                      return (
                        <div key={n.id} className="flex items-start gap-3 p-2 rounded-lg bg-gray-50 text-xs">
                          {isFailed || isNotConfigured ? (
                            <AlertCircle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
                          ) : (
                            <Mail className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                          )}
                          <div className="flex-1 space-y-0.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-gray-700 truncate">
                                {n.toName ? `${n.toName} ` : ""}&lt;{n.toEmail || "unknown"}&gt;
                              </span>
                              {n.stage && <StageBadge stage={n.stage} />}
                              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${statusColor}`}>
                                {statusLabel}
                              </span>
                            </div>
                            <p className="text-gray-600 truncate">{n.subject}</p>
                            <p className="text-gray-400">{formatDateTime(n.createdAt)}</p>
                            {n.failedReason && (
                              <p className="text-red-600 mt-1 bg-white p-1.5 rounded border border-red-100">{n.failedReason}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t pt-3">
                <button
                  onClick={onVersionToggle}
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
  );
}
