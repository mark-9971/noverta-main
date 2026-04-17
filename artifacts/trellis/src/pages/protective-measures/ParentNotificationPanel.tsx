import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle, ChevronRight, FilePenLine,
  Mail, Printer, Send, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { generateIncidentDraft } from "@workspace/api-client-react";
import { buildIncidentReportHtml, openPrintWindow, saveGeneratedDocument } from "@/lib/print-document";
import { Signature, Staff, StatusHistoryEntry, SIG_ROLE_LABELS } from "@/pages/protective-measures/constants";
import { Clock } from "lucide-react";

export function ParentNotificationPanel({ incident, staff, incidentId, saveDraftMutation, sendNotificationMutation, reviewNotificationMutation, statusHistory, lastEmailFailure, setLastEmailFailure }: {
  incident: any;
  staff: Staff[];
  incidentId: number;
  saveDraftMutation: any;
  sendNotificationMutation: any;
  reviewNotificationMutation: any;
  statusHistory: StatusHistoryEntry[];
  lastEmailFailure: { notConfigured: boolean; error: string } | null;
  setLastEmailFailure: (v: { notConfigured: boolean; error: string } | null) => void;
}) {
  const [draftText, setDraftText] = useState(incident.parentNotificationDraft || "");
  const [sendMethod, setSendMethod] = useState("email");
  const [showConfirm, setShowConfirm] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "return">("approve");

  const isAdminReviewed = incident.status === "under_review" || incident.status === "resolved";
  const alreadySent = !!incident.parentNotificationSentAt;
  const lastReviewEntry = statusHistory.find(h =>
    h.toStatus === "notification_approved" || h.toStatus === "notification_returned"
  );
  const notificationApproved = lastReviewEntry?.toStatus === "notification_approved";

  const generateDraft = async () => {
    setLoadingDraft(true);
    try {
      const data = await generateIncidentDraft(incidentId) as { draft: string; caseManager?: { id: number } };
      setDraftText(data.draft);
    } catch { toast.error("Failed to generate draft"); }
    setLoadingDraft(false);
  };

  useEffect(() => {
    if (isAdminReviewed && !alreadySent && !draftText && !incident.parentNotificationDraft) {
      generateDraft();
    }
  }, [isAdminReviewed, alreadySent]);

  // Builds a print-ready HTML restraint report and opens the browser
  // print dialog. NOT a true server PDF — users save as PDF via the OS
  // print dialog. (A true PDFKit endpoint exists at
  // GET /api/protective-measures/incidents/:id/report-pdf and is what
  // the parent-notification email attaches; this UI button just gives
  // staff a quick on-screen preview / printable copy.)
  const handlePrintReport = () => {
    const staffMap: Record<number, string> = {};
    staff.forEach(s => { staffMap[s.id] = `${s.firstName} ${s.lastName}`; });
    const studentName = incident.studentFirstName
      ? `${incident.studentFirstName} ${incident.studentLastName}`
      : incident.student ? `${incident.student.firstName} ${incident.student.lastName}` : "Student";
    const html = buildIncidentReportHtml({
      incident: incident as Record<string, unknown>,
      studentName,
      studentDob: incident.student?.dateOfBirth ?? null,
      school: incident.schoolName ?? incident.school?.name ?? null,
      district: incident.districtName ?? incident.district?.name ?? null,
      staffMap,
    });
    openPrintWindow(html);
    const studentId: number | undefined = incident.studentId;
    if (studentId) {
      saveGeneratedDocument({
        studentId,
        type: "incident_report",
        title: `Restraint/Seclusion Report — ${new Date(incident.incidentDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        htmlSnapshot: html,
        linkedRecordId: incidentId,
        status: "finalized",
      });
    }
  };

  const handleSaveDraft = () => {
    saveDraftMutation.mutate(draftText);
    toast.success("Draft saved");
  };

  const handleReviewSubmit = () => {
    if (!reviewNote.trim()) { toast.error("A review note is required"); return; }
    reviewNotificationMutation.mutate({ action: reviewAction, note: reviewNote }, {
      onSuccess: () => {
        setShowReviewPanel(false);
        setReviewNote("");
        toast.success(reviewAction === "approve" ? "Notification approved for sending" : "Notification returned for correction");
      },
    });
  };

  const handleSend = () => {
    sendNotificationMutation.mutate({ draft: draftText, method: sendMethod });
    setShowConfirm(false);
  };

  if (!isAdminReviewed && !alreadySent) {
    return (
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Mail className="w-4 h-4" /> Parent Notification
        </h3>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Admin review must be completed before sending parent notification.</p>
        </div>
        <button onClick={handlePrintReport} className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 flex items-center justify-center gap-1.5">
          <Printer className="w-3.5 h-3.5" /> Preview restraint report (Print / Save as PDF)
        </button>
      </div>
    );
  }

  if (alreadySent) {
    const senderStaff = incident.parentNotificationSentBy ? staff.find(s => s.id === incident.parentNotificationSentBy) : null;
    return (
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Mail className="w-4 h-4 text-emerald-600" /> Parent Notification
        </h3>
        <div className="bg-emerald-50 rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <p className="text-xs font-semibold text-emerald-700">Notification Sent</p>
          </div>
          <p className="text-[11px] text-emerald-600">
            Sent {new Date(incident.parentNotificationSentAt).toLocaleDateString()} via {incident.parentNotificationMethod || "email"}
            {senderStaff ? ` by ${senderStaff.firstName} ${senderStaff.lastName}` : ""}
          </p>
        </div>
        {incident.parentNotificationDraft && (
          <details className="group">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 flex items-center gap-1">
              <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" /> View sent message
            </summary>
            <div className="mt-2 bg-gray-50 rounded-lg p-3">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{incident.parentNotificationDraft}</pre>
            </div>
          </details>
        )}
        <button onClick={handlePrintReport} className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 flex items-center justify-center gap-1.5">
          <Printer className="w-3.5 h-3.5" /> Open restraint report (Print / Save as PDF)
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <Mail className="w-4 h-4 text-emerald-600" /> Parent Notification & Report
      </h3>
      <p className="text-xs text-gray-500">
        Admin has reviewed this incident. Compose and authorize the parent notification below. The restraint report PDF will be attached.
      </p>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700">Notification Letter</label>
          <div className="flex gap-1.5">
            <button onClick={generateDraft} disabled={loadingDraft}
              className="text-[10px] px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1">
              <FilePenLine className="w-3 h-3" /> {loadingDraft ? "Generating..." : "Auto-Generate"}
            </button>
            <button onClick={handleSaveDraft} disabled={saveDraftMutation.isPending || !draftText}
              className="text-[10px] px-2 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 disabled:opacity-50">
              {saveDraftMutation.isPending ? "..." : "Save Draft"}
            </button>
          </div>
        </div>
        <textarea
          value={draftText}
          onChange={e => setDraftText(e.target.value)}
          rows={12}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white resize-y font-sans leading-relaxed focus:ring-1 focus:ring-emerald-300 focus:border-emerald-300"
          placeholder="Write the parent notification letter here..."
        />
      </div>

      <button onClick={handlePrintReport} className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 flex items-center justify-center gap-1.5">
        <Printer className="w-3.5 h-3.5" /> Open restraint report (Print / Save as PDF)
      </button>

      {lastReviewEntry && (
        <div className={`rounded-lg px-3 py-2 text-[11px] flex items-start gap-2 ${lastReviewEntry.toStatus === "notification_approved" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
          {lastReviewEntry.toStatus === "notification_approved"
            ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            : <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
          <div>
            <span className="font-medium">{lastReviewEntry.toStatus === "notification_approved" ? "Approved for sending" : "Returned for correction"}</span>
            {lastReviewEntry.actorFirst && <span className="text-[10px] opacity-75 ml-1">— {lastReviewEntry.actorFirst} {lastReviewEntry.actorLast}</span>}
            <p className="mt-0.5 opacity-80">{lastReviewEntry.note}</p>
          </div>
        </div>
      )}

      {!showReviewPanel ? (
        <div className="flex gap-2">
          <button onClick={() => { setReviewAction("approve"); setShowReviewPanel(true); }}
            disabled={notificationApproved}
            className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
            <CheckCircle className="w-3 h-3" /> {notificationApproved ? "Approved" : "Approve for Sending"}
          </button>
          <button onClick={() => { setReviewAction("return"); setShowReviewPanel(true); }}
            className="flex-1 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 flex items-center justify-center gap-1.5">
            <XCircle className="w-3 h-3" /> Return for Correction
          </button>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-700">
            {reviewAction === "approve" ? "Approve Notification" : "Return for Correction"} — Note Required
          </p>
          <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={3}
            placeholder={reviewAction === "approve" ? "Note why this notification is approved..." : "Describe what needs to be corrected..."}
            className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs bg-white focus:ring-1 focus:ring-emerald-300 resize-none" />
          <div className="flex gap-2">
            <button onClick={() => setShowReviewPanel(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded">Cancel</button>
            <button onClick={handleReviewSubmit} disabled={reviewNotificationMutation.isPending || !reviewNote.trim()}
              className={`flex-1 px-2 py-1.5 text-xs text-white rounded disabled:opacity-50 font-medium ${reviewAction === "approve" ? "bg-emerald-700" : "bg-red-600"}`}>
              {reviewNotificationMutation.isPending ? "Saving..." : reviewAction === "approve" ? "Confirm Approval" : "Return for Correction"}
            </button>
          </div>
        </div>
      )}

      {notificationApproved && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <label className="text-xs font-medium text-gray-700">Send Notification</label>
          <select value={sendMethod} onChange={e => setSendMethod(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
            <option value="email">Email</option>
            <option value="certified_mail">Certified Mail</option>
            <option value="hand_delivered">Hand Delivered</option>
          </select>

          {lastEmailFailure && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-red-700">
                  {lastEmailFailure.notConfigured ? "Email not configured" : "Email delivery failed"}
                </p>
                <p className="text-[10px] text-red-600 mt-0.5">
                  {lastEmailFailure.notConfigured
                    ? "Add RESEND_API_KEY to enable real email delivery, or switch to Certified Mail / Hand Delivered below."
                    : `${lastEmailFailure.error}. Update the method or try again.`}
                </p>
              </div>
              <button
                onClick={() => { setLastEmailFailure(null); setShowConfirm(true); }}
                disabled={!draftText}
                className="text-[10px] px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 whitespace-nowrap flex-shrink-0">
                Retry
              </button>
            </div>
          )}

          {!showConfirm ? (
            <button onClick={() => setShowConfirm(true)} disabled={!draftText}
              className="w-full px-3 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              <Send className="w-3.5 h-3.5" /> Send Parent Notification with Report
            </button>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-800">Confirm Send</p>
              {sendMethod === "email"
                ? <p className="text-[11px] text-amber-700">The notification will be emailed to the parent/guardian with the restraint report PDF attached. The incident will only be marked as sent after confirmed delivery. If email is not configured, use the "Open restraint report" button above to print or save a PDF as a fallback.</p>
                : <p className="text-[11px] text-amber-700">This will mark the parent notification as sent via {sendMethod.replace(/_/g, " ")} and attach the restraint report. This action cannot be undone.</p>
              }
              <div className="flex gap-2">
                <button onClick={() => setShowConfirm(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded">Cancel</button>
                <button onClick={handleSend} disabled={sendNotificationMutation.isPending}
                  className="flex-1 px-2 py-1.5 text-xs bg-emerald-700 text-white rounded disabled:opacity-50 font-medium">
                  {sendNotificationMutation.isPending ? "Sending..." : "Confirm & Send"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SignatureRow({ sig, onSign, isPending }: { sig: Signature; onSign: (name: string, notes?: string) => void; isPending: boolean }) {
  const [showSign, setShowSign] = useState(false);
  const [name, setName] = useState("");

  return (
    <div className={`rounded-lg p-2.5 ${sig.status === "signed" ? "bg-emerald-50" : "bg-amber-50"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {sig.status === "signed"
            ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            : <Clock className="w-3.5 h-3.5 text-amber-500" />
          }
          <div>
            <p className="text-xs font-medium text-gray-800">{sig.staffFirstName} {sig.staffLastName}</p>
            <p className="text-[10px] text-gray-500">{SIG_ROLE_LABELS[sig.role] || sig.role}</p>
          </div>
        </div>
        {sig.status === "signed" ? (
          <div className="text-right">
            <p className="text-[10px] italic text-emerald-700">{sig.signatureName}</p>
            {sig.signedAt && <p className="text-[9px] text-gray-400">{new Date(sig.signedAt).toLocaleDateString()}</p>}
          </div>
        ) : (
          !showSign && (
            <button onClick={() => setShowSign(true)} className="text-[10px] px-2 py-1 bg-amber-500 text-white rounded font-medium hover:bg-amber-600">
              Sign
            </button>
          )
        )}
      </div>
      {showSign && sig.status === "pending" && (
        <div className="mt-2 space-y-1.5">
          <input type="text" placeholder="Type full name to sign" value={name} onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 border border-amber-200 rounded text-xs bg-white italic" />
          <div className="flex gap-2">
            <button onClick={() => setShowSign(false)} className="flex-1 px-2 py-1 text-[10px] bg-white border border-gray-200 rounded">Cancel</button>
            <button onClick={() => { if (name) onSign(name); }} disabled={!name || isPending}
              className="flex-1 px-2 py-1 text-[10px] bg-emerald-700 text-white rounded disabled:opacity-50">
              {isPending ? "..." : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ComplianceItem({ done, label, sublabel, urgent }: { done: boolean; label: string; sublabel: string; urgent?: boolean }) {
  return (
    <div className={`flex items-start gap-3 p-2.5 rounded-lg ${done ? "bg-emerald-50" : urgent ? "bg-red-50" : "bg-gray-50"}`}>
      {done
        ? <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
        : urgent
          ? <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          : <Clock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
      }
      <div>
        <p className={`text-xs font-semibold ${done ? "text-emerald-700" : urgent ? "text-red-700" : "text-gray-700"}`}>{label}</p>
        <p className={`text-[11px] ${done ? "text-emerald-600" : urgent ? "text-red-600" : "text-gray-500"}`}>{sublabel}</p>
      </div>
    </div>
  );
}
