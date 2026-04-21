/**
 * Phase 1F — Case Manager Review surface.
 *
 * The dedicated landing page when a teammate hands an Action Center
 * item off to a student's case manager via "Review with case manager".
 *
 * The goal is to put the four things a CM needs to triage an item
 * side-by-side on one screen, instead of forcing them to flip between
 * the student detail page, the schedule, and the sessions log:
 *
 *   1. The structured handoff note (who routed it, why, the recommendation)
 *   2. Student summary + assigned CM
 *   3. This-month minute progress per service requirement (required vs
 *      delivered + shortfall) — the same numbers the action engine used
 *   4. Recent sessions (last 20) so the CM can see the actual delivery pattern
 *
 * It then exposes four closed-loop outcomes:
 *
 *   - "Schedule makeup"      → deep-link to Scheduling Hub for this student
 *                              + service requirement (re-uses Phase 1D path)
 *   - "Open IEP builder"     → /students/:id/iep-builder for an IEP revision
 *   - "Mark resolved"        → flip handling state to `resolved`
 *   - "Dismiss this item"    → indefinite dismissal with a reason snapshot
 *
 * Out of scope here: a full schedule-block editor or a dedicated
 * makeup-session form — those already live on the Scheduling Hub and the
 * Sessions page respectively. We deep-link instead of re-implementing.
 */

import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, ArrowRight, CalendarPlus, ClipboardList, FileEdit, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { useGetStudent, useGetStudentMinuteProgress, useGetStudentSessions } from "@workspace/api-client-react";
import {
  useHandlingState,
  useHandlingHistory,
  resolveOwnerDisplay,
  formatRelativeTime,
} from "@/lib/use-handling-state";
import { useDismissalState } from "@/lib/use-dismissal-state";
import { studentIdFromItemId } from "@/lib/action-recommendations";
import { buildScheduleMakeupHref } from "@/lib/schedule-makeup";
import { HandlingStatePill } from "@/components/wedge-primitives";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface MinuteProgressItem {
  serviceRequirementId?: number;
  serviceType?: string;
  serviceTypeName?: string;
  requiredMinutes?: number;
  deliveredMinutes?: number;
  shortfallMinutes?: number;
  periodLabel?: string;
}

interface SessionItem {
  id: number;
  sessionDate?: string;
  date?: string;
  durationMinutes?: number;
  status?: string;
  serviceTypeName?: string;
  serviceType?: string;
  notes?: string | null;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function CardShell({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div>
          <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function CmReviewPage() {
  const params = useParams<{ itemId: string }>();
  const itemId = decodeURIComponent(params.itemId ?? "");
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const studentId = studentIdFromItemId(itemId);

  // Handling row + history
  const { getEntry, setState } = useHandlingState([itemId]);
  const handling = getEntry(itemId);
  const history = useHandlingHistory(itemId, { enabled: true, limit: 10 });

  // Dismissal control
  const { dismiss } = useDismissalState([itemId]);

  // Student data — only when we know the studentId
  const { data: student } = useGetStudent(studentId ?? 0, {
    query: { enabled: !!studentId },
  } as never);
  const { data: progressData } = useGetStudentMinuteProgress(studentId ?? 0, {
    query: { enabled: !!studentId },
  } as never);
  const { data: sessionsData } = useGetStudentSessions(studentId ?? 0, { limit: 20 } as never);

  const progressItems = useMemo<MinuteProgressItem[]>(
    () => (Array.isArray(progressData) ? (progressData as MinuteProgressItem[]) : []),
    [progressData],
  );
  const recentSessions = useMemo<SessionItem[]>(
    () => (Array.isArray(sessionsData) ? (sessionsData as SessionItem[]) : []),
    [sessionsData],
  );

  // Pull the handoff signal back out of the encoded itemId where possible.
  // Pattern: `service-gap:<studentId>:<requirementId>` or `risk:<studentId>:<requirementId>`.
  const requirementId = useMemo<number | null>(() => {
    const m = itemId.match(/^(?:service-gap|risk|student):\d+:(\d+)/);
    return m ? Number(m[1]) : null;
  }, [itemId]);

  // Outcome handlers ────────────────────────────────────────────────────────
  function handleScheduleMakeup() {
    if (!studentId) {
      toast.error("Cannot schedule makeup", { description: "This item is not linked to a student." });
      return;
    }
    setState(itemId, "recovery_scheduled");
    navigate(buildScheduleMakeupHref({
      studentId,
      serviceRequirementId: requirementId,
      missedSessionId: null,
      from: "action-center",
    }));
  }

  function handleOpenIepBuilder() {
    if (!studentId) {
      toast.error("Cannot open IEP builder", { description: "This item is not linked to a student." });
      return;
    }
    setState(itemId, "under_review");
    navigate(`/students/${studentId}/iep-builder`);
  }

  function handleMarkResolved() {
    setState(itemId, "resolved");
    qc.invalidateQueries({ queryKey: ["action-item-handling"] });
    toast.success("Marked resolved", { description: "This item will drop off the queue for everyone in your district." });
  }

  const [dismissReason, setDismissReason] = useState("");
  const [dismissOpen, setDismissOpen] = useState(false);
  function handleDismiss() {
    if (!dismissReason.trim()) {
      toast.error("Please enter a brief reason");
      return;
    }
    const studentName = student
      ? `${(student as { firstName?: string }).firstName ?? ""} ${(student as { lastName?: string }).lastName ?? ""}`.trim()
      : "";
    dismiss(itemId, {
      title: studentName ? `Reviewed by case manager — ${studentName}` : `Reviewed by case manager`,
      detail: dismissReason.trim(),
    });
    setDismissOpen(false);
    setDismissReason("");
    toast.success("Dismissed", { description: "Hidden from the queue. You can restore it from Action Center → Restored & dismissed." });
    setTimeout(() => navigate("/action-center"), 600);
  }

  const studentName = student
    ? `${(student as { firstName?: string }).firstName ?? ""} ${(student as { lastName?: string }).lastName ?? ""}`.trim() || "Student"
    : null;

  // Aggregate this-month numbers from progress (sum across all service reqs).
  const totalRequired = progressItems.reduce((s, p) => s + (p.requiredMinutes ?? 0), 0);
  const totalDelivered = progressItems.reduce((s, p) => s + (p.deliveredMinutes ?? 0), 0);
  const totalShortfall = Math.max(0, totalRequired - totalDelivered);
  const pctDelivered = totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 100) : null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-5">
        <Link
          href="/action-center"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-800"
          data-testid="link-back-to-action-center"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Action Center
        </Link>
        <div className="flex items-center gap-2">
          {handling && <HandlingStatePill state={handling.state} size="sm" testId="cm-review-state-pill" />}
          {handling?.updatedAt && (
            <span className="text-[11px] text-gray-400" title={handling.updatedAt}>
              Updated {formatRelativeTime(handling.updatedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
          <ClipboardList className="w-3.5 h-3.5" />
          Case manager review
        </div>
        <h1 className="text-[22px] font-semibold text-gray-900 mt-1">
          {studentName ? (
            <>
              <Link href={`/students/${studentId}`} className="hover:underline decoration-gray-300">{studentName}</Link>
              <span className="text-gray-400 font-normal"> — minute-shortfall review</span>
            </>
          ) : (
            "Action item review"
          )}
        </h1>
        <p className="text-[12px] text-gray-500 mt-1">
          Routed here for your decision. Use the requirement, schedule context, and session history below to choose the closing action.
        </p>
      </div>

      {/* Routed-from note */}
      <div className="mb-5">
        <CardShell
          title="Why this is in your queue"
          subtitle={handling?.updatedByName ? `Routed by ${handling.updatedByName}` : "Routed for case-manager review"}
          right={
            handling && (() => {
              const owner = resolveOwnerDisplay(handling);
              return owner.label ? (
                <span className="text-[11px] text-gray-500">Owned by <span className="font-medium text-gray-700">{owner.label}</span></span>
              ) : null;
            })()
          }
        >
          {handling?.note ? (
            <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-gray-700">{handling.note}</pre>
          ) : (
            <p className="text-[12px] text-gray-500 italic">No structured note attached. (This may be an older row routed before the v1 handoff.)</p>
          )}
        </CardShell>
      </div>

      {/* This-month minutes + recent sessions side by side on wide screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <CardShell
          title="This-month minute progress"
          subtitle={pctDelivered != null ? `${pctDelivered}% of required minutes delivered` : "Required vs delivered"}
        >
          {progressItems.length === 0 ? (
            <p className="text-[12px] text-gray-500 italic">No service-requirement progress data available for this student.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-3 pb-3 border-b border-gray-100">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Required</div>
                  <div className="text-[18px] font-semibold text-gray-900 tabular-nums">{totalRequired.toLocaleString()}<span className="text-[11px] font-normal text-gray-400 ml-1">min</span></div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Delivered</div>
                  <div className="text-[18px] font-semibold text-gray-900 tabular-nums">{totalDelivered.toLocaleString()}<span className="text-[11px] font-normal text-gray-400 ml-1">min</span></div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Shortfall</div>
                  <div className={`text-[18px] font-semibold tabular-nums ${totalShortfall > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                    {totalShortfall.toLocaleString()}<span className="text-[11px] font-normal text-gray-400 ml-1">min</span>
                  </div>
                </div>
              </div>
              <ul className="space-y-1.5">
                {progressItems.map((p, i) => {
                  const required = p.requiredMinutes ?? 0;
                  const delivered = p.deliveredMinutes ?? 0;
                  const shortfall = Math.max(0, required - delivered);
                  const pct = required > 0 ? Math.round((delivered / required) * 100) : null;
                  const isHighlighted = requirementId && p.serviceRequirementId === requirementId;
                  return (
                    <li
                      key={i}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-[12px] ${isHighlighted ? "bg-emerald-50 border border-emerald-200" : "bg-gray-50"}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isHighlighted && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full flex-shrink-0" title="The requirement that triggered this item" />}
                        <span className="font-medium text-gray-800 truncate">{p.serviceTypeName ?? p.serviceType ?? "Service"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] tabular-nums">
                        <span className="text-gray-500">{delivered.toLocaleString()} / {required.toLocaleString()} min</span>
                        {shortfall > 0 && <span className="text-amber-700 font-medium">−{shortfall.toLocaleString()}</span>}
                        {pct != null && <span className="text-gray-400">{pct}%</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardShell>

        <CardShell title="Recent sessions" subtitle="Last 20 logged">
          {recentSessions.length === 0 ? (
            <p className="text-[12px] text-gray-500 italic">No sessions logged for this student in the visible window.</p>
          ) : (
            <ul className="divide-y divide-gray-100 -mx-2">
              {recentSessions.slice(0, 12).map((s) => {
                const status = (s.status ?? "completed").toLowerCase();
                const Icon = status === "missed" ? XCircle : status === "scheduled" ? Clock : CheckCircle2;
                const color =
                  status === "missed" ? "text-rose-500" :
                  status === "scheduled" ? "text-amber-500" :
                  "text-emerald-500";
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-2 py-1.5 text-[12px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
                      <span className="text-gray-700 font-medium tabular-nums">{fmtDate(s.sessionDate ?? s.date)}</span>
                      <span className="text-gray-400 truncate">{s.serviceTypeName ?? s.serviceType ?? ""}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 tabular-nums flex-shrink-0">
                      {s.durationMinutes != null ? `${s.durationMinutes} min` : ""}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardShell>
      </div>

      {/* Outcomes */}
      <CardShell
        title="Choose how to close this out"
        subtitle="Each option records a closed-loop outcome — visible to whoever routed this item."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            onClick={handleScheduleMakeup}
            className="flex items-start gap-3 px-3.5 py-3 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-left transition-colors"
            data-testid="cm-review-action-schedule-makeup"
          >
            <CalendarPlus className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-emerald-900">Schedule a makeup session</div>
              <div className="text-[11px] text-emerald-800/80 mt-0.5">Opens the Scheduling Hub at the matching minutes-at-risk row.</div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0 mt-1" />
          </button>

          <button
            onClick={handleOpenIepBuilder}
            className="flex items-start gap-3 px-3.5 py-3 rounded-md border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-left transition-colors"
            data-testid="cm-review-action-open-iep"
          >
            <FileEdit className="w-4 h-4 text-indigo-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-indigo-900">Revise the IEP minutes</div>
              <div className="text-[11px] text-indigo-800/80 mt-0.5">Opens the IEP Builder to draft an amendment to the service grid.</div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-indigo-700 flex-shrink-0 mt-1" />
          </button>

          <button
            onClick={handleMarkResolved}
            className="flex items-start gap-3 px-3.5 py-3 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-left transition-colors"
            data-testid="cm-review-action-resolve"
          >
            <CheckCircle2 className="w-4 h-4 text-gray-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-gray-900">Mark resolved</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Use when the underlying signal has corrected itself (e.g., back-logged sessions caught up).</div>
            </div>
          </button>

          <button
            onClick={() => setDismissOpen(o => !o)}
            className="flex items-start gap-3 px-3.5 py-3 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-left transition-colors"
            data-testid="cm-review-action-dismiss"
          >
            <XCircle className="w-4 h-4 text-gray-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-gray-900">Dismiss with a reason</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Hides from the queue. Use when no further action is needed.</div>
            </div>
          </button>
        </div>

        {dismissOpen && (
          <div className="mt-3 p-3 rounded-md border border-gray-200 bg-gray-50">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1 block">Reason (required — visible to teammates)</label>
            <input
              type="text"
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="e.g. Provider absence covered, no makeup needed"
              className="w-full px-2.5 py-1.5 text-[12px] border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              data-testid="cm-review-dismiss-reason"
              autoFocus
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => { setDismissOpen(false); setDismissReason(""); }}
                className="text-[11px] font-semibold text-gray-500 hover:text-gray-800 px-2 py-1"
              >
                Cancel
              </button>
              <button
                onClick={handleDismiss}
                disabled={!dismissReason.trim()}
                className="text-[11px] font-semibold text-white bg-gray-700 hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-md"
                data-testid="cm-review-dismiss-confirm"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </CardShell>

      {/* Mini history strip */}
      {history.data && history.data.length > 0 && (
        <div className="mt-5">
          <CardShell title="Recent transitions" subtitle="Audit trail for this item across your district">
            <ul className="space-y-1">
              {history.data.slice(0, 8).map((h) => (
                <li key={h.id} className="flex items-center justify-between text-[12px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-3 h-3 text-gray-300 flex-shrink-0" />
                    <span className="text-gray-700 truncate">
                      {h.fromState ? `${h.fromState} → ${h.toState}` : `Set to ${h.toState}`}
                      {h.changedByName && <span className="text-gray-400"> by {h.changedByName}</span>}
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400 tabular-nums">{formatRelativeTime(h.changedAt)}</span>
                </li>
              ))}
            </ul>
          </CardShell>
        </div>
      )}
    </div>
  );
}
