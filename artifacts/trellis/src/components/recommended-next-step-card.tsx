/**
 * Pilot Wedge Phase 1C — Recommended Next Step surface used on student
 * detail (TabSummary). Reuses the centralized `recommendAction()`
 * engine — no second decision tree.
 *
 * The card renders:
 *   - cause + confidence pip
 *   - recommended owner (substituted to "you" when current user matches)
 *   - one-sentence why
 *   - primary CTA driven by the recommendation
 *   - secondary actions in an overflow popover
 *   - current handling-state pill + ability to change it inline
 *
 * Honesty:
 *   - "Schedule makeup" deep-links to the real scheduler (Phase 1D).
 *   - "Mark as awaiting provider response" (T06 truthful rename of the
 *     former "Follow up with provider" CTA) only updates the shared
 *     handling state to `awaiting_confirmation`. It does NOT send a
 *     provider email, in-app notification, or any other outreach. The
 *     card surfaces this fact inline so users don't expect a real
 *     message went out.
 */

import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { MoreHorizontal, Sparkles, ArrowRight } from "lucide-react";
import {
  recommendAction,
  HANDLING_TRANSITIONS,
  type RecommendationSignal,
  type RecommendedActionType,
} from "@/lib/action-recommendations";
import { useHandlingState, resolveOwnerDisplay, formatRelativeTime, handOffToCaseManager, cmReviewHref } from "@/lib/use-handling-state";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import HandlingHistoryPopover from "@/components/handling-history-popover";
import { buildScheduleMakeupHref, type ScheduleMakeupOrigin } from "@/lib/schedule-makeup";
import { HandlingStatePill } from "@/components/wedge-primitives";

const CONFIDENCE_PIP: Record<"high" | "medium" | "low", { dot: string; label: string }> = {
  high: { dot: "bg-emerald-500", label: "high confidence" },
  medium: { dot: "bg-amber-500", label: "medium confidence" },
  low: { dot: "bg-gray-400", label: "lower confidence — review" },
};

interface Props {
  studentId: number;
  signal: RecommendationSignal;
  itemId: string;
  whySummary: string;
  additionalIssueCount?: number;
  currentUserRole?: string;
  /** Distinct handling-state namespace per surface so student-detail
   *  state doesn't bleed into the Action Center queue. */
  userKey: string;
  /** When the recommendation is `confirm_and_log_session` we open the
   *  inline QuickLogSheet rather than mark a handling state. */
  onLogSession?: () => void;
  /** Origin surface for the schedule-makeup deep-link's back-link. */
  scheduleMakeupOrigin?: ScheduleMakeupOrigin;
  /** Optional service requirement id to include in the makeup launch. */
  serviceRequirementId?: number | null;
}

export default function RecommendedNextStepCard({
  studentId, signal, itemId, whySummary, additionalIssueCount = 0,
  currentUserRole, userKey, onLogSession,
  scheduleMakeupOrigin = "student-detail",
  serviceRequirementId,
}: Props) {
  const recommendation = useMemo(
    () => recommendAction(signal, { currentUserRole }),
    [signal, currentUserRole],
  );
  // Phase 1E: pass `[itemId]` so the hook batch-fetches just this row.
  // `userKey` is retained in the prop signature for backward compat
  // but is no longer used for namespacing (district scoping is enforced
  // server-side).
  void userKey;
  const qc = useQueryClient();
  const { getState, setState, getEntry } = useHandlingState([itemId]);
  const handlingState = getState(itemId);
  const handlingEntry = getEntry(itemId);
  const handlingActive = handlingState !== "needs_action";
  const ownerDisplay = resolveOwnerDisplay(handlingEntry);
  const updatedRel = formatRelativeTime(handlingEntry?.updatedAt);
  const confidencePip = CONFIDENCE_PIP[recommendation.confidence];
  const [, navigate] = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [stateMenuOpen, setStateMenuOpen] = useState(false);

  function applyAction(action: RecommendedActionType) {
    setMenuOpen(false);
    if (action === "confirm_and_log_session") {
      if (onLogSession) onLogSession();
      return;
    }
    if (action === "schedule_makeup") {
      // Phase 1D — real launch path: deep-link to Scheduling Hub →
      // Minutes at Risk with makeup intent prefilled. Also mark
      // recovery_scheduled so the row does not re-surface as
      // untouched on the previous queue.
      setState(itemId, "recovery_scheduled");
      navigate(buildScheduleMakeupHref({
        studentId,
        serviceRequirementId: serviceRequirementId ?? null,
        sourceActionItemId: itemId,
        from: scheduleMakeupOrigin,
      }));
      return;
    }
    if (action === "follow_up_with_provider") return setState(itemId, "awaiting_confirmation");
    if (action === "review_with_case_manager") {
      // Phase 1F — real handoff: route the item to the student's
      // assigned case manager with structured context. Falls back to
      // marking under_review (the prior behavior) if no CM is assigned
      // or the call fails.
      handOffToCaseManager({
        itemId,
        studentId,
        recommendation: {
          causeLabel: recommendation.causeLabel,
          primaryActionLabel: recommendation.primaryActionLabel,
          explanation: recommendation.explanation,
          confidence: recommendation.confidence,
        },
        signal: {
          shortfallMinutes: signal.shortfallMinutes ?? null,
          requiredMinutes: signal.requiredMinutes ?? null,
          serviceRequirementId: signal.serviceRequirementId ?? null,
        },
      }).then((result) => {
        qc.invalidateQueries({ queryKey: ["action-item-handling"] });
        const cmName = result.caseManager?.name ?? "the case manager";
        toast.success(`Routed to ${cmName} for review`, {
          description: "They'll see this in their Action Center with the requirement, schedule, and recent sessions to review together.",
          action: { label: "Open review", onClick: () => navigate(cmReviewHref(itemId)) },
        });
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Could not hand off — marked under review instead.";
        setState(itemId, "under_review");
        toast.error("Handoff failed", { description: msg });
      });
      return;
    }
    if (action === "review_requirement_data") return setState(itemId, "under_review");
    if (action === "escalate_coverage_issue" || action === "review_iep_timeline") return setState(itemId, "handed_off");
    // monitor_only — no state change.
  }

  // Choose a context-page deep-link for the secondary "Open" action.
  const contextLink = (() => {
    if (signal.category === "evaluation") return "/evaluations";
    if (signal.category === "iep" || signal.category === "meeting") return "/iep-meetings";
    // Land on the Minutes-at-Risk tab with the student preselected so
    // the user can immediately see scheduling context for this row,
    // not the generic week grid.
    if (signal.category === "schedule") return `/scheduling?tab=minutes&studentId=${studentId}`;
    if (signal.category === "session") return `/sessions?studentId=${studentId}`;
    return `/compliance?tab=minutes`;
  })();

  return (
    <div
      className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-white p-4 md:p-5"
      data-testid="card-recommended-next-step"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <Sparkles className="w-4 h-4 text-emerald-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-emerald-700">Recommended next step</p>
            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500" title={confidencePip.label}>
              <span className={`w-1.5 h-1.5 rounded-full ${confidencePip.dot}`} aria-hidden="true" />
              {confidencePip.label}
            </span>
          </div>

          <h3 className="text-base md:text-lg font-bold text-gray-800 mt-1" data-testid="text-recommendation-action">
            {recommendation.primaryActionLabel}
          </h3>

          {recommendation.action === "follow_up_with_provider" && (
            // T06 — honest scope note rendered ONLY for the renamed
            // "Mark as awaiting provider response" CTA. The button
            // updates shared handling state; it does not actually
            // notify the provider yet. Keep this short so it doesn't
            // crowd the card.
            <p
              className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1.5 leading-snug"
              data-testid="text-recommendation-honesty-note"
            >
              Updates the team's handling state to "awaiting confirmation". Trellis does not message the provider yet — please reach out directly.
            </p>
          )}

          <p className="text-[12px] text-gray-600 mt-1.5 leading-snug" data-testid="text-recommendation-why">
            <span className="font-semibold text-gray-700">Likely cause:</span> {recommendation.causeLabel}
            <span className="text-gray-300 mx-1.5">·</span>
            <span className="font-semibold text-gray-700">Owner:</span> {recommendation.ownerLabel}
          </p>

          <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
            <span className="font-semibold text-gray-600">Why:</span> {whySummary}
          </p>

          {handlingActive && (ownerDisplay.label || updatedRel) && (
            <p
              className="text-[11px] text-gray-500 mt-1.5 leading-snug flex items-center gap-1.5 flex-wrap"
              data-testid="text-handling-meta"
            >
              {ownerDisplay.label && (
                <span data-testid="text-handling-owner">
                  <span className="font-semibold text-gray-600">
                    {ownerDisplay.source === "recommended_role" ? "Recommended:" :
                     "Owned by:"}
                  </span>{" "}
                  {ownerDisplay.label}
                </span>
              )}
              {ownerDisplay.label && updatedRel && <span className="text-gray-300">·</span>}
              {updatedRel && (
                <span data-testid="text-handling-updated" title={handlingEntry?.updatedAt ?? undefined}>
                  Updated {updatedRel}
                </span>
              )}
            </p>
          )}

          {additionalIssueCount > 0 && (
            <p className="text-[11px] text-gray-400 mt-1.5">
              + {additionalIssueCount} other issue{additionalIssueCount === 1 ? "" : "s"} on this student — see at-risk and re-eval cards below.
            </p>
          )}

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={() => applyAction(recommendation.recommendedAction)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-700 text-white text-[12px] font-semibold hover:bg-emerald-800 transition-colors"
              data-testid="button-recommendation-primary"
            >
              {recommendation.primaryActionLabel}
            </button>

            <Link
              href={contextLink}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 text-[12px] font-semibold hover:bg-emerald-50 transition-colors"
              data-testid="link-recommendation-context"
            >
              Open context <ArrowRight className="w-3 h-3" />
            </Link>

            {/* Handling-state pill / changer */}
            <div className="relative inline-flex items-center gap-1.5">
              <HandlingStatePill
                state={handlingState}
                size="md"
                onClick={() => { setStateMenuOpen(o => !o); setMenuOpen(false); }}
                withChevron
                testId="button-handling-state"
                title="Mark how this is being handled — no message is sent"
              />
              {handlingActive && (
                <HandlingHistoryPopover
                  itemId={itemId}
                  triggerTestId="button-handling-history"
                />
              )}
              {stateMenuOpen && (
                <div
                  className="absolute z-30 left-0 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg py-1"
                  onMouseLeave={() => setStateMenuOpen(false)}
                >
                  <p className="px-2.5 py-1 text-[10px] uppercase tracking-wide text-gray-400">
                    Mark how this is being handled
                  </p>
                  {HANDLING_TRANSITIONS.map(t => (
                    <button
                      key={t.state}
                      onClick={() => { setState(itemId, t.state); setStateMenuOpen(false); }}
                      className={`w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-gray-50 ${t.state === handlingState ? "text-emerald-700 font-semibold" : "text-gray-700"}`}
                      data-testid={`button-handling-${t.state}`}
                    >
                      <div>{t.label}</div>
                      <div className="text-[10px] text-gray-400 leading-tight">{t.help}</div>
                    </button>
                  ))}
                  <p className="px-2.5 py-1 text-[10px] text-gray-400 border-t mt-1">
                    Shared with your district team — no message is sent.
                  </p>
                </div>
              )}
            </div>

            {/* Secondary actions */}
            {recommendation.secondaryActions.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => { setMenuOpen(o => !o); setStateMenuOpen(false); }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 text-[12px] transition-colors"
                  data-testid="button-recommendation-overflow"
                  aria-label="Other actions"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {menuOpen && (
                  <div
                    className="absolute z-30 left-0 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg py-1"
                    onMouseLeave={() => setMenuOpen(false)}
                  >
                    <p className="px-2.5 py-1 text-[10px] uppercase tracking-wide text-gray-400">Other actions</p>
                    {recommendation.secondaryActions.map(sa => (
                      <button
                        key={sa.type}
                        onClick={() => applyAction(sa.type)}
                        className="w-full text-left px-2.5 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50"
                        data-testid={`button-secondary-${sa.type}`}
                      >
                        {sa.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
