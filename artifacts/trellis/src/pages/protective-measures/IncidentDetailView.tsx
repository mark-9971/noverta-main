import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Bell, CheckCircle, ChevronRight, Download, Eye, FileText, History,
  PenLine, Send, User, UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  deseReportIncident, getProtectiveIncident,
  listStaff, parentNotifyIncident, parentNotificationDraftIncident,
  sendParentNotificationIncident, signIncidentSignature, updateProtectiveIncident,
  writtenReportIncident,
} from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth-fetch";
import {
  ANTECEDENT_CATEGORIES, BODY_POSITIONS, IncidentDetail, RESTRAINT_TYPES,
  STATUS_COLORS, STATUS_LABELS, Signature, Staff, StatusHistoryEntry,
  TYPE_LABELS, VALID_TRANSITIONS, formatDate, formatTime,
} from "@/pages/protective-measures/constants";
import { IncidentTransitionDialog } from "@/pages/protective-measures/IncidentTransitionDialog";
import {
  ComplianceItem, ParentNotificationPanel, SignatureRow,
} from "@/pages/protective-measures/ParentNotificationPanel";

export function IncidentDetailView({ id, onBack, onExpandToFull }: { id: number; onBack: () => void; onExpandToFull?: (id: number) => void }) {
  const queryClient = useQueryClient();

  const { data: incident, isLoading } = useQuery<IncidentDetail>({
    queryKey: ["protective-incident", id],
    queryFn: ({ signal }) => getProtectiveIncident(id, { signal }),
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-list"],
    queryFn: ({ signal }) => listStaff(undefined, { signal }) as Promise<Staff[]>,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["protective-incident", id] });
    queryClient.invalidateQueries({ queryKey: ["protective-incidents"] });
    queryClient.invalidateQueries({ queryKey: ["protective-summary"] });
  };

  const reviewMutation = useMutation({
    mutationFn: ({ notes }: { notes: string }) =>
      authFetch(`/api/protective-measures/incidents/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus: "under_review", note: notes }),
      }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { error?: string }).error || "Review failed"); }
        return r.json();
      }),
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["incident-status-history", id] });
    },
    onError: (err: Error) => { toast.error(err.message || "Failed to submit review"); },
  });

  const notifyMutation = useMutation({
    mutationFn: (data: { notifiedById: number; method: string; verbal?: boolean }) =>
      parentNotifyIncident(id, data),
    onSuccess: invalidateAll,
  });

  const writtenReportMutation = useMutation({
    mutationFn: (method: string) => writtenReportIncident(id, { method }),
    onSuccess: invalidateAll,
  });

  const [showDeseDialog, setShowDeseDialog] = useState(false);
  const [deseNote, setDeseNote] = useState("");
  const deseMutation = useMutation({
    mutationFn: (note: string) => deseReportIncident(id, { thirtyDayLogSent: true, note } as Record<string, unknown>),
    onSuccess: () => { invalidateAll(); setShowDeseDialog(false); setDeseNote(""); },
  });

  const signMutation = useMutation({
    mutationFn: (data: { sigId: number; signatureName: string; notes?: string }) =>
      signIncidentSignature(id, data.sigId, { signatureName: data.signatureName, notes: data.notes }),
    onSuccess: invalidateAll,
  });

  const commentMutation = useMutation({
    mutationFn: (data: { parentComment?: string; studentComment?: string }) =>
      updateProtectiveIncident(id, { ...data, parentCommentOpportunityGiven: true }),
    onSuccess: invalidateAll,
  });

  const saveDraftMutation = useMutation({
    mutationFn: (draft: string) => parentNotificationDraftIncident(id, { draft }),
    onSuccess: invalidateAll,
  });

  type SendNotificationResult = {
    emailNotSent?: boolean;
    emailResult?: {
      success: boolean;
      notConfigured?: boolean;
      error?: string;
      communicationEventId?: number;
    };
    parentNotificationSentAt?: string | null;
    [key: string]: unknown;
  };

  const [lastEmailFailure, setLastEmailFailure] = useState<{ notConfigured: boolean; error: string } | null>(null);

  const sendNotificationMutation = useMutation({
    mutationFn: (data: { draft: string; method: string }) =>
      sendParentNotificationIncident(id, data) as Promise<SendNotificationResult>,
    onSuccess: (data: SendNotificationResult) => {
      invalidateAll();
      const er = data?.emailResult;
      if (data?.emailNotSent) {
        if (er?.notConfigured) {
          setLastEmailFailure({ notConfigured: true, error: "Email provider not configured" });
          toast.warning("Notification draft saved. Email delivery is not configured — add RESEND_API_KEY to enable real delivery.", { duration: 8000 });
        } else {
          const msg = er?.error ?? "Unknown error";
          setLastEmailFailure({ notConfigured: false, error: msg });
          toast.error(`Email delivery failed: ${msg}. Please retry or choose a different notification method.`, { duration: 8000 });
        }
      } else if (er?.success === true) {
        setLastEmailFailure(null);
        toast.success("Parent notification email sent successfully");
      } else {
        setLastEmailFailure(null);
        toast.success("Parent notification recorded");
      }
    },
    onError: (err: Error) => { toast.error(err.message || "Failed to send notification"); },
  });

  const reviewNotificationMutation = useMutation({
    mutationFn: (data: { action: "approve" | "return"; note: string }) =>
      authFetch(`/api/protective-measures/incidents/${id}/review-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async r => { if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { error?: string }).error || "Review failed"); } return r.json(); }),
    onSuccess: () => { invalidateAll(); queryClient.invalidateQueries({ queryKey: ["incident-status-history", id] }); },
    onError: (err: Error) => { toast.error(err.message || "Failed to record review"); },
  });

  const { data: statusHistory = [] } = useQuery<StatusHistoryEntry[]>({
    queryKey: ["incident-status-history", id],
    queryFn: ({ signal }) =>
      authFetch(`/api/protective-measures/incidents/${id}/status-history`, { signal })
        .then(r => r.json()),
    enabled: !!id,
  });

  const [deseDownloading, setDeseDownloading] = useState(false);

  const handleDeseExport = async () => {
    setDeseDownloading(true);
    try {
      const res = await authFetch(`/api/protective-measures/incidents/${id}/dese-export`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dese-report-incident-${id}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("DESE report exported");
    } catch (err: any) {
      toast.error(err.message || "Failed to export DESE report");
    } finally {
      setDeseDownloading(false);
    }
  };

  const [showNotify, setShowNotify] = useState(false);
  const [showWritten, setShowWritten] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [notifyForm, setNotifyForm] = useState({ staffId: "", method: "phone" });
  const [writtenMethod, setWrittenMethod] = useState("email");
  const [reviewForm, setReviewForm] = useState({ notes: "" });
  const [commentForm, setCommentForm] = useState({ parentComment: "", studentComment: "" });

  if (isLoading || !incident) return <div className="p-12 text-center text-sm text-gray-400">Loading...</div>;

  const signatures: Signature[] = incident.signatures || [];
  const pendingSigs = signatures.filter((s: Signature) => s.status === "pending");
  const signedSigs = signatures.filter((s: Signature) => s.status === "signed");
  const availableTransitions = VALID_TRANSITIONS[incident.status] ?? [];

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-6">
      {showTransition && incident.student && (
        <IncidentTransitionDialog
          incident={{
            id: incident.id,
            status: incident.status,
            studentFirstName: incident.student.firstName,
            studentLastName: incident.student.lastName,
          }}
          onClose={() => setShowTransition(false)}
          onTransitioned={() => { setShowTransition(false); invalidateAll(); }}
        />
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">
            {incident.student?.firstName} {incident.student?.lastName} — {TYPE_LABELS[incident.incidentType]}
          </h1>
          <p className="text-sm text-gray-500">{formatDate(incident.incidentDate)} at {formatTime(incident.incidentTime)}{incident.durationMinutes ? ` · ${incident.durationMinutes} min` : ""}</p>
        </div>
        <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${STATUS_COLORS[incident.status]}`}>
          {STATUS_LABELS[incident.status]}
        </span>
        {(incident.status === "draft" || incident.status === "draft_quick") && onExpandToFull && (
          <button
            onClick={() => onExpandToFull(id)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors flex items-center gap-1.5"
          >
            <PenLine className="w-3.5 h-3.5" />
            {incident.status === "draft_quick" ? "Expand to Full Report" : "Edit Draft"}
          </button>
        )}
        {availableTransitions.length > 0 && (
          <button
            onClick={() => setShowTransition(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            Advance Status
          </button>
        )}
        {incident.status === "dese_reported" && (
          <button
            onClick={handleDeseExport}
            disabled={deseDownloading}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors flex items-center gap-1.5 disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            {deseDownloading ? "Generating..." : "Generate DESE Report"}
          </button>
        )}
        {incident.resolutionNote && (
          <div className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <p className="text-[11px] text-gray-500 font-medium">Resolution Note</p>
            <p className="text-[12px] text-gray-700 mt-0.5 italic">"{incident.resolutionNote}"</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Incident Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div><span className="text-gray-500 text-xs">Type</span><p className="font-medium text-gray-800">{TYPE_LABELS[incident.incidentType]}</p></div>
              <div><span className="text-gray-500 text-xs">Location</span><p className="font-medium text-gray-800">{incident.location || "—"}</p></div>
              {incident.restraintType && <div><span className="text-gray-500 text-xs">Restraint Type</span><p className="font-medium text-gray-800">{RESTRAINT_TYPES[incident.restraintType]}</p></div>}
              {incident.bodyPosition && <div><span className="text-gray-500 text-xs">Body Position</span><p className="font-medium text-gray-800">{BODY_POSITIONS[incident.bodyPosition] || incident.bodyPosition}</p></div>}
              {incident.antecedentCategory && <div><span className="text-gray-500 text-xs">Antecedent</span><p className="font-medium text-gray-800">{ANTECEDENT_CATEGORIES[incident.antecedentCategory] || incident.antecedentCategory}</p></div>}
              <div><span className="text-gray-500 text-xs">BIP in Place</span><p className="font-medium text-gray-800">{incident.bipInPlace ? "Yes" : "No"}</p></div>
              {incident.timeToCalm && <div><span className="text-gray-500 text-xs">Time to Calm</span><p className="font-medium text-gray-800">{incident.timeToCalm} min</p></div>}
              {incident.studentReturnedToActivity && <div><span className="text-gray-500 text-xs">Returned To</span><p className="font-medium text-gray-800 capitalize">{incident.studentReturnedToActivity.replace(/_/g, " ")}</p></div>}
            </div>

            {(incident.studentMoved || incident.roomCleared || incident.emergencyServicesCalled || incident.physicalEscortOnly) && (
              <div className="flex gap-2 flex-wrap">
                {incident.physicalEscortOnly && <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium">Physical Escort Only</span>}
                {incident.studentMoved && <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">Student Moved{incident.studentMovedTo ? `: ${incident.studentMovedTo}` : ""}</span>}
                {incident.roomCleared && <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">Room Cleared</span>}
                {incident.emergencyServicesCalled && <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">911 Called</span>}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Behavioral Context</h3>
            {incident.precedingActivity && <div><p className="text-xs font-medium text-gray-500 mb-1">Preceding Activity</p><p className="text-sm text-gray-700">{incident.precedingActivity}</p></div>}
            {incident.triggerDescription && <div><p className="text-xs font-medium text-gray-500 mb-1">Trigger / Antecedent</p><p className="text-sm text-gray-700">{incident.triggerDescription}</p></div>}
            <div><p className="text-xs font-medium text-gray-500 mb-1">Behavior Description</p><p className="text-sm text-gray-700">{incident.behaviorDescription}</p></div>
            {Array.isArray(incident.deescalationStrategies) && incident.deescalationStrategies.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">De-escalation Strategies Used</p>
                <div className="flex flex-wrap gap-1.5">
                  {(incident.deescalationStrategies as string[]).map((s: string) => (
                    <span key={s} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {incident.deescalationAttempts && <div><p className="text-xs font-medium text-gray-500 mb-1">Additional De-escalation Details</p><p className="text-sm text-gray-700">{incident.deescalationAttempts}</p></div>}
            {incident.alternativesAttempted && <div><p className="text-xs font-medium text-gray-500 mb-1">Alternatives Attempted</p><p className="text-sm text-gray-700">{incident.alternativesAttempted}</p></div>}
            {incident.justification && <div><p className="text-xs font-medium text-gray-500 mb-1">Justification</p><p className="text-sm text-gray-700">{incident.justification}</p></div>}
            {Array.isArray(incident.proceduresUsed) && incident.proceduresUsed.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Procedures / Holds Used</p>
                <div className="flex flex-wrap gap-1.5">
                  {(incident.proceduresUsed as string[]).map((s: string) => (
                    <span key={s} className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {incident.calmingStrategiesUsed && <div><p className="text-xs font-medium text-gray-500 mb-1">Calming Strategies</p><p className="text-sm text-gray-700">{incident.calmingStrategiesUsed}</p></div>}
            {incident.studentStateAfter && <div><p className="text-xs font-medium text-gray-500 mb-1">Student State After</p><p className="text-sm text-gray-700">{incident.studentStateAfter}</p></div>}
          </div>

          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Staff Involved</h3>
            <div className="space-y-2">
              {incident.primaryStaff && (
                <div className="flex items-center gap-3 p-2 bg-emerald-50 rounded-lg">
                  <User className="w-4 h-4 text-emerald-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{incident.primaryStaff.firstName} {incident.primaryStaff.lastName}</p>
                    <p className="text-xs text-gray-500">{incident.primaryStaff.title || incident.primaryStaff.role} — Primary (administered restraint)</p>
                  </div>
                </div>
              )}
              {incident.additionalStaff?.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                  <User className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.firstName} {s.lastName}</p>
                    <p className="text-xs text-gray-500">{s.title || s.role} — Additional staff</p>
                  </div>
                </div>
              ))}
              {incident.observerStaff?.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                  <Eye className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.firstName} {s.lastName}</p>
                    <p className="text-xs text-gray-500">{s.title || s.role} — Observer</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(incident.studentInjury || incident.staffInjury) && (
            <div className="bg-white rounded-xl border border-red-200 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-red-700">Injuries</h3>
              {incident.studentInjury && (
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-700">Student Injury</p>
                  <p className="text-sm text-red-800 mt-1">{incident.studentInjuryDescription || "Injury reported — no details"}</p>
                </div>
              )}
              {incident.staffInjury && (
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-700">Staff Injury</p>
                  <p className="text-sm text-red-800 mt-1">{incident.staffInjuryDescription || "Injury reported — no details"}</p>
                </div>
              )}
              {incident.medicalAttentionRequired && (
                <div className="bg-red-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-800">Medical Attention Required</p>
                  <p className="text-sm text-red-800 mt-1">{incident.medicalDetails || "Yes"}</p>
                </div>
              )}
            </div>
          )}

          {incident.debriefConducted && (
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Post-Incident Debrief</h3>
              {incident.debriefDate && <p className="text-xs text-gray-500">Conducted: {formatDate(incident.debriefDate)}</p>}
              {incident.debriefNotes && <p className="text-sm text-gray-700">{incident.debriefNotes}</p>}
            </div>
          )}

          {(incident.parentComment || incident.studentComment || incident.parentCommentOpportunityGiven) && (
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Parent/Student Comments — 603 CMR 46.06(3)</h3>
              {incident.parentComment && <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs font-medium text-gray-700">Parent Comment</p><p className="text-sm text-gray-800 mt-1">{incident.parentComment}</p></div>}
              {incident.studentComment && <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs font-medium text-gray-700">Student Comment</p><p className="text-sm text-gray-800 mt-1">{incident.studentComment}</p></div>}
              {incident.parentCommentOpportunityGiven && !incident.parentComment && !incident.studentComment && (
                <p className="text-xs text-gray-500">Comment opportunity was provided; no comments were submitted.</p>
              )}
            </div>
          )}

          {incident.notes && (
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{incident.notes}</p>
            </div>
          )}

          {incident.followUpPlan && (
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Follow-Up Plan</h3>
              <p className="text-sm text-gray-600">{incident.followUpPlan}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              Signatures ({signedSigs.length}/{signatures.length})
            </h3>

            {signatures.length === 0 ? (
              <p className="text-xs text-gray-400">No signature requests yet</p>
            ) : (
              <div className="space-y-2">
                {signatures.map((sig: Signature) => (
                  <SignatureRow key={sig.id} sig={sig} onSign={(name, notes) => signMutation.mutate({ sigId: sig.id, signatureName: name, notes })} isPending={signMutation.isPending} />
                ))}
              </div>
            )}

            {pendingSigs.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <p className="text-xs text-amber-800 font-medium">{pendingSigs.length} signature{pendingSigs.length !== 1 ? "s" : ""} pending</p>
              </div>
            )}
          </div>

          <ParentNotificationPanel
            incident={incident}
            staff={staff}
            incidentId={id}
            saveDraftMutation={saveDraftMutation}
            sendNotificationMutation={sendNotificationMutation}
            reviewNotificationMutation={reviewNotificationMutation}
            statusHistory={statusHistory}
            lastEmailFailure={lastEmailFailure}
            setLastEmailFailure={setLastEmailFailure}
          />

          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Compliance Checklist — 603 CMR 46.06</h3>

            <ComplianceItem
              done={incident.parentVerbalNotification}
              label="Verbal Parent Notification (24hr)"
              sublabel={incident.parentVerbalNotification
                ? `Notified ${incident.parentVerbalNotificationAt ? new Date(incident.parentVerbalNotificationAt).toLocaleDateString() : ""}`
                : "Due within 24 hours of incident"}
              urgent={!incident.parentVerbalNotification}
            />

            {!incident.parentVerbalNotification && !showNotify && (
              <button onClick={() => setShowNotify(true)} className="w-full px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 flex items-center justify-center gap-1.5">
                <Bell className="w-3.5 h-3.5" /> Record Verbal Notification
              </button>
            )}
            {showNotify && !incident.parentVerbalNotification && (
              <div className="bg-red-50 rounded-lg p-3 space-y-2">
                <select value={notifyForm.staffId} onChange={e => setNotifyForm(f => ({ ...f, staffId: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-red-200 rounded text-xs bg-white">
                  <option value="">Who notified?</option>
                  {staff.map((s: Staff) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>
                <select value={notifyForm.method} onChange={e => setNotifyForm(f => ({ ...f, method: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-red-200 rounded text-xs bg-white">
                  <option value="phone">Phone Call</option>
                  <option value="in_person">In Person</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={() => setShowNotify(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded">Cancel</button>
                  <button onClick={() => { if (notifyForm.staffId) notifyMutation.mutate({ notifiedById: Number(notifyForm.staffId), method: notifyForm.method, verbal: true }); }}
                    disabled={!notifyForm.staffId || notifyMutation.isPending}
                    className="flex-1 px-2 py-1.5 text-xs bg-red-600 text-white rounded disabled:opacity-50">
                    {notifyMutation.isPending ? "..." : "Confirm"}
                  </button>
                </div>
              </div>
            )}

            <ComplianceItem
              done={incident.writtenReportSent}
              label="Written Report to Parent (3 days)"
              sublabel={incident.writtenReportSent
                ? `Sent ${incident.writtenReportSentAt ? formatDate(incident.writtenReportSentAt) : ""} via ${incident.writtenReportSentMethod || "—"}`
                : "Due within 3 school working days"}
            />

            {incident.parentVerbalNotification && !incident.writtenReportSent && !showWritten && (
              <button onClick={() => setShowWritten(true)} className="w-full px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 flex items-center justify-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Mark Written Report Sent
              </button>
            )}
            {showWritten && !incident.writtenReportSent && (
              <div className="bg-amber-50 rounded-lg p-3 space-y-2">
                <select value={writtenMethod} onChange={e => setWrittenMethod(e.target.value)}
                  className="w-full px-2 py-1.5 border border-amber-200 rounded text-xs bg-white">
                  <option value="email">Email</option>
                  <option value="regular_mail">Regular Mail</option>
                  <option value="hand_delivered">Hand Delivered</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={() => setShowWritten(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded">Cancel</button>
                  <button onClick={() => writtenReportMutation.mutate(writtenMethod)}
                    disabled={writtenReportMutation.isPending}
                    className="flex-1 px-2 py-1.5 text-xs bg-amber-600 text-white rounded disabled:opacity-50">
                    {writtenReportMutation.isPending ? "..." : "Confirm Sent"}
                  </button>
                </div>
              </div>
            )}

            <ComplianceItem
              done={incident.parentCommentOpportunityGiven}
              label="Parent/Student Comment Opportunity"
              sublabel={incident.parentCommentOpportunityGiven
                ? "Comment opportunity provided"
                : "Must offer opportunity to comment"}
            />

            {!incident.parentCommentOpportunityGiven && !showComment && (
              <button onClick={() => setShowComment(true)} className="w-full px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 flex items-center justify-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Record Comments
              </button>
            )}
            {showComment && !incident.parentCommentOpportunityGiven && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <textarea value={commentForm.parentComment} onChange={e => setCommentForm(f => ({ ...f, parentComment: e.target.value }))}
                  placeholder="Parent comment (leave blank if none)..." rows={2} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs bg-white resize-none" />
                <textarea value={commentForm.studentComment} onChange={e => setCommentForm(f => ({ ...f, studentComment: e.target.value }))}
                  placeholder="Student comment (leave blank if none)..." rows={2} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs bg-white resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => setShowComment(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded">Cancel</button>
                  <button onClick={() => commentMutation.mutate({ parentComment: commentForm.parentComment || undefined, studentComment: commentForm.studentComment || undefined })}
                    disabled={commentMutation.isPending}
                    className="flex-1 px-2 py-1.5 text-xs bg-emerald-600 text-white rounded disabled:opacity-50">
                    {commentMutation.isPending ? "..." : "Save"}
                  </button>
                </div>
              </div>
            )}

            <ComplianceItem
              done={!!incident.adminReviewedBy}
              label="Admin Review & Signature"
              sublabel={incident.adminReviewedBy && incident.adminReviewer
                ? `Reviewed by ${incident.adminReviewer.firstName} ${incident.adminReviewer.lastName}`
                : "Principal must review and sign"}
            />

            {!incident.adminReviewedBy && !showReview && (
              <button onClick={() => setShowReview(true)} className="w-full px-3 py-2 bg-emerald-700 text-white rounded-lg text-xs font-medium hover:bg-emerald-800 flex items-center justify-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" /> Complete Admin Review
              </button>
            )}
            {showReview && !incident.adminReviewedBy && (
              <div className="bg-emerald-50 rounded-lg p-3 space-y-2">
                <p className="text-xs text-emerald-700">Review will be recorded under your account. Add notes below.</p>
                <textarea value={reviewForm.notes} onChange={e => setReviewForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Review notes (required)..." rows={3} className="w-full px-2 py-1.5 border border-emerald-200 rounded text-xs bg-white resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => setShowReview(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded">Cancel</button>
                  <button onClick={() => { if (reviewForm.notes.trim()) reviewMutation.mutate({ notes: reviewForm.notes }); }}
                    disabled={!reviewForm.notes.trim() || reviewMutation.isPending}
                    className="flex-1 px-2 py-1.5 text-xs bg-emerald-700 text-white rounded disabled:opacity-50">
                    {reviewMutation.isPending ? "Submitting…" : "Submit Review"}
                  </button>
                </div>
              </div>
            )}

            {incident.deseReportRequired && (
              <>
                <hr className="border-gray-200" />
                <ComplianceItem
                  done={!!incident.deseReportSentAt}
                  label="DESE Injury Report (3 days)"
                  sublabel={incident.deseReportSentAt
                    ? `Sent ${formatDate(incident.deseReportSentAt)}`
                    : "Required — injury occurred. Due within 3 school working days"}
                  urgent={!incident.deseReportSentAt}
                />
                <ComplianceItem
                  done={incident.thirtyDayLogSentToDese}
                  label="30-Day Prior Restraint Log to DESE"
                  sublabel={incident.thirtyDayLogSentToDese ? "Sent with injury report" : "Must accompany injury report"}
                  urgent={!incident.thirtyDayLogSentToDese && !!incident.deseReportSentAt}
                />
                {!incident.deseReportSentAt && (
                  <button onClick={() => setShowDeseDialog(true)} disabled={deseMutation.isPending}
                    className="w-full px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 flex items-center justify-center gap-1.5 disabled:opacity-50">
                    <Send className="w-3.5 h-3.5" /> Mark DESE Report Sent
                  </button>
                )}
                {showDeseDialog && (
                  <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4">
                      <h3 className="text-base font-semibold text-gray-800">File DESE Report</h3>
                      <p className="text-sm text-gray-500">Document the submission of this incident to DESE. A note is required.</p>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Note <span className="text-red-500">*</span></label>
                        <textarea
                          value={deseNote}
                          onChange={e => setDeseNote(e.target.value)}
                          rows={3}
                          placeholder="Describe the report submitted, submission method, and any confirmation details…"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setShowDeseDialog(false); setDeseNote(""); }}
                          className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50" disabled={deseMutation.isPending}>
                          Cancel
                        </button>
                        <button
                          onClick={() => { if (!deseNote.trim()) { toast.error("A note is required"); return; } deseMutation.mutate(deseNote.trim()); }}
                          disabled={deseMutation.isPending || !deseNote.trim()}
                          className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                          {deseMutation.isPending ? "Filing..." : "File DESE Report"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {incident.adminReviewNotes && (
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Admin Review Notes</h3>
              <p className="text-sm text-gray-600">{incident.adminReviewNotes}</p>
            </div>
          )}

          {statusHistory.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <History className="w-4 h-4 text-gray-400" />
                Status History
              </h3>
              <div className="space-y-3">
                {statusHistory.map((entry: StatusHistoryEntry) => (
                  <div key={entry.id} className="relative pl-4 border-l-2 border-gray-200">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[entry.fromStatus] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABELS[entry.fromStatus] ?? entry.fromStatus}</span>
                      <ChevronRight className="w-3 h-3 text-gray-400" />
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[entry.toStatus] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABELS[entry.toStatus] ?? entry.toStatus}</span>
                    </div>
                    <p className="text-[11px] text-gray-600 italic mt-0.5">"{entry.note}"</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {entry.actorFirst ? `${entry.actorFirst} ${entry.actorLast} · ` : ""}{new Date(entry.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
