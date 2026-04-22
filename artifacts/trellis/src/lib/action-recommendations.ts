/**
 * Pilot Wedge Phase 1B — operational action recommendation model.
 *
 * Centralizes the "what should the user do next on this at-risk item?"
 * decision so every surface (Action Center today, student detail and the
 * compliance Risk Report later) speaks the same operational language.
 *
 * Honesty notes:
 *   - The `recommendedAction`, `recommendedOwner`, `likelyCause`, and
 *     `confidence` are DERIVED from the existing risk/alert signals.
 *     Nothing here is persisted server-side.
 *   - `HandlingState` IS user-editable and persisted (currently in
 *     localStorage via `useHandlingState`); it represents what the user
 *     has told the product about how this item is being handled, not a
 *     server-of-truth for assignment or workflow.
 *   - When the underlying signals do not let us distinguish documentation
 *     lag from a true missed service (the common case for risk-row items
 *     that come from `useGetComplianceRiskReport`), we explicitly emit
 *     `ambiguous_review_needed` rather than fake precision by defaulting
 *     to "Log Session."
 */

// ─── Taxonomy ────────────────────────────────────────────────────────────────

export type LikelyCause =
  | "documentation_lag"
  | "likely_missed_service"
  | "schedule_mismatch"
  | "requirement_or_data_issue"
  | "deadline_pressure"
  | "provider_absence_or_staffing_issue"
  | "ambiguous_review_needed";

export type RecommendedOwner =
  | "service_provider"
  | "scheduler"
  | "case_manager"
  | "admin"
  | "you";

export type RecommendedActionType =
  | "confirm_and_log_session"
  | "schedule_makeup"
  | "follow_up_with_provider"
  | "review_with_case_manager"
  | "escalate_coverage_issue"
  | "review_requirement_data"
  | "review_iep_timeline"
  | "monitor_only";

export type HandlingState =
  | "needs_action"
  | "awaiting_confirmation"
  | "recovery_scheduled"
  | "handed_off"
  | "under_review"
  | "resolved";

export type Confidence = "high" | "medium" | "low";

// ─── Display labels ──────────────────────────────────────────────────────────

export const CAUSE_LABELS: Record<LikelyCause, string> = {
  documentation_lag: "Documentation lag",
  likely_missed_service: "Likely missed service",
  schedule_mismatch: "Schedule under IEP minutes",
  requirement_or_data_issue: "Requirement / data issue",
  deadline_pressure: "Deadline approaching",
  provider_absence_or_staffing_issue: "Provider / coverage issue",
  ambiguous_review_needed: "Cause unclear — review",
};

export const OWNER_LABELS: Record<RecommendedOwner, string> = {
  service_provider: "Service provider",
  scheduler: "Scheduler",
  case_manager: "Case manager",
  admin: "Admin",
  you: "You",
};

export const ACTION_LABELS: Record<RecommendedActionType, string> = {
  confirm_and_log_session: "Confirm & log session",
  schedule_makeup: "Schedule makeup",
  // T06 — truthful rename. The previous label "Follow up with provider"
  // implied the system would actually contact the provider (email, in-app
  // message, etc.). It does not. Today this CTA only updates the shared
  // handling state to `awaiting_confirmation` so the team knows someone
  // is waiting on the provider's response. The new label states what
  // actually happens; a small helper line in
  // `recommended-next-step-card.tsx` makes the no-notification fact
  // explicit when this CTA is shown.
  follow_up_with_provider: "Mark as awaiting provider response",
  review_with_case_manager: "Review with case manager",
  escalate_coverage_issue: "Escalate coverage gap",
  review_requirement_data: "Review requirement",
  review_iep_timeline: "Review IEP timeline",
  monitor_only: "Monitor",
};

export const HANDLING_LABELS: Record<HandlingState, string> = {
  needs_action: "Needs action",
  awaiting_confirmation: "Awaiting confirmation",
  recovery_scheduled: "Scheduled pending",
  handed_off: "Handed off",
  under_review: "Under review",
  resolved: "Resolved",
};

// ─── Input signal ────────────────────────────────────────────────────────────

/**
 * The minimal shape we need to make a recommendation. Surfaces produce this
 * either from an `alerts` row, a compliance risk report row, a schedule-gap
 * computation, or an evaluation/IEP deadline.
 */
export interface RecommendationSignal {
  /** Coarse work category from the work-queue producers. */
  category:
    | "compliance"
    | "iep"
    | "session"
    | "evaluation"
    | "meeting"
    | "transition"
    | "staffing"
    | "schedule";
  /** Raw alert type when this came from an alerts-table row. */
  alertType?: string;
  /** Risk status when this came from the compliance risk report. */
  riskStatus?: string;
  /** Source bucket — helps distinguish a high-confidence alert from a
   *  derived risk-report row. */
  source?: "alert" | "risk_report" | "deadline" | "schedule_gap" | "dashboard";
  /** Minutes short. Big shortfalls bias toward case-manager review. */
  shortfallMinutes?: number;
  /** Required minutes for the period — used to detect chronic gaps. */
  requiredMinutes?: number;
  /** True if the signal already has hard evidence the service did not
   *  occur (e.g., session_logs.status === "missed"). */
  hasMissedEvidence?: boolean;
  /** Phase 1D — when known, the at-risk service requirement this
   *  signal targets. Used to deep-link "Schedule makeup" into the
   *  right row of the Scheduling Hub. */
  serviceRequirementId?: number | null;
  /** Phase 1D — when known (missed-session alerts), the specific
   *  session log id whose makeup is being planned. */
  missedSessionId?: number | null;
}

export interface ActionRecommendation {
  likelyCause: LikelyCause;
  causeLabel: string;
  confidence: Confidence;
  recommendedOwner: RecommendedOwner;
  ownerLabel: string;
  recommendedAction: RecommendedActionType;
  primaryActionLabel: string;
  explanation: string;
  secondaryActions: { type: RecommendedActionType; label: string }[];
}

// ─── Canonical item identity (Phase 1E) ──────────────────────────────────────

/**
 * Phase 1E — canonical, stable item identity for the shared handling
 * state. Every surface that wants its handling pill to round-trip
 * through the server must use these helpers to produce the `itemId`
 * stored in `action_item_handling`.
 *
 * Format choices:
 *   - `alert:<id>`                        — alerts table row (server pk).
 *   - `risk:<sid>:<reqId>`                — compliance risk-report row,
 *                                            keyed by the at-risk
 *                                            requirement so the same row
 *                                            survives across reseeds.
 *   - `deadline:<sid>:<eventType>`        — IEP/eval deadline row.
 *   - `service-gap:<sid>:<reqId>`         — schedule-gap signal.
 *   - `student:<sid>:<kind>[:<reqId>]`    — student-detail "next step"
 *                                            card; `kind` is short
 *                                            (e.g. "next-step").
 *
 * Surfaces should NOT inline these strings; using the helpers keeps the
 * format singular and grep-discoverable.
 */
export function itemIdForAlert(alertId: number | string): string {
  return `alert:${alertId}`;
}

export function itemIdForRisk(studentId: number, requirementId: number | null | undefined): string {
  return `risk:${studentId}:${requirementId ?? "none"}`;
}

export function itemIdForDeadline(studentId: number, eventType: string): string {
  // Slugify the event type so it survives copy-paste and DB constraints.
  const slug = String(eventType).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `deadline:${studentId}:${slug}`;
}

export function itemIdForServiceGap(studentId: number, requirementId: number | null | undefined): string {
  return `service-gap:${studentId}:${requirementId ?? "none"}`;
}

export function itemIdForStudent(studentId: number, kind: string, requirementId?: number | null): string {
  const slug = String(kind).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return requirementId != null ? `student:${studentId}:${slug}:${requirementId}` : `student:${studentId}:${slug}`;
}

/** Extract the studentId from a canonical itemId, when one is encoded. */
export function studentIdFromItemId(itemId: string): number | null {
  const m = itemId.match(/^(?:risk|deadline|service-gap|student):(\d+)(?::|$)/);
  return m ? Number(m[1]) : null;
}

// ─── Decision logic ──────────────────────────────────────────────────────────

function chronicShortfall(s: RecommendationSignal): boolean {
  if (!s.shortfallMinutes || !s.requiredMinutes) return false;
  return s.shortfallMinutes / s.requiredMinutes >= 0.5;
}

/**
 * Phase 1D — owner-aware "you" substitution.
 *
 * When the current user's role is the natural owner of the
 * recommendation, we substitute "you" so the prompt feels assigned
 * instead of abstract. Mappings are conservative:
 *   - service_provider  ← provider, direct_provider
 *   - case_manager      ← case_manager, sped_teacher, bcba
 *   - admin             ← admin, coordinator
 *   - scheduler         ← admin, coordinator (no dedicated scheduler role
 *                         in the system; admins / coordinators are the
 *                         operators who actually schedule)
 *   - you               ← always remains "you"
 *
 * Returns the (possibly substituted) owner.
 */
export function resolveOwner(
  owner: RecommendedOwner,
  currentUserRole?: string,
): RecommendedOwner {
  if (owner === "you" || !currentUserRole) return owner;
  const r = currentUserRole;
  switch (owner) {
    case "service_provider":
      if (r === "provider" || r === "direct_provider") return "you";
      return owner;
    case "case_manager":
      if (r === "case_manager" || r === "sped_teacher" || r === "bcba") return "you";
      return owner;
    case "admin":
      if (r === "admin" || r === "coordinator") return "you";
      return owner;
    case "scheduler":
      if (r === "admin" || r === "coordinator") return "you";
      return owner;
    default:
      return owner;
  }
}

/**
 * Pure function: given a derived signal, recommend the next operational
 * step. The current user's role can shift the recommended owner from a
 * generic role to "you" when the user is the right person to act.
 */
export function recommendAction(
  signal: RecommendationSignal,
  ctx: { currentUserRole?: string } = {},
): ActionRecommendation {
  const t = signal.alertType ?? "";
  const role = ctx.currentUserRole;

  // 1. Documentation lag — we have a strong signal that the session
  //    likely happened but is not yet detailed in the log.
  if (t === "overdue_session_log") {
    return build({
      cause: "documentation_lag",
      confidence: "high",
      owner: resolveOwner("service_provider", role),
      action: "confirm_and_log_session",
      explanation: "Session was scheduled but no log details were recorded. Confirm whether it happened and finish the entry.",
      secondary: ["follow_up_with_provider", "monitor_only"],
    });
  }

  // 2. Hard-evidence missed service — schedule a makeup, do not log.
  if (t === "missed_sessions" || signal.hasMissedEvidence) {
    return build({
      cause: "likely_missed_service",
      confidence: "high",
      owner: resolveOwner("scheduler", role),
      action: "schedule_makeup",
      explanation: "One or more scheduled sessions were marked missed. Plan a makeup so minutes are recovered.",
      secondary: ["follow_up_with_provider", "review_with_case_manager"],
    });
  }

  // 3. IEP / evaluation deadline pressure.
  if (
    t === "iep_expiring" || t === "iep_expired" || t === "missing_iep" ||
    signal.category === "iep" || signal.category === "meeting"
  ) {
    return build({
      cause: "deadline_pressure",
      confidence: "high",
      owner: resolveOwner("case_manager", role),
      action: "review_iep_timeline",
      explanation: "An IEP or meeting deadline is at or past due. Confirm the meeting is set and consents are in.",
      secondary: ["review_with_case_manager", "monitor_only"],
    });
  }
  if (t === "evaluation_overdue" || t.includes("re_eval") || signal.category === "evaluation") {
    return build({
      cause: "deadline_pressure",
      confidence: "high",
      owner: resolveOwner("admin", role),
      action: "escalate_coverage_issue",
      explanation: "Evaluation timeline is exceeded. Escalate so the eval is assigned and the 60-day window is honored.",
      secondary: ["review_with_case_manager", "monitor_only"],
    });
  }

  // 4. Schedule mismatch — IEP minutes exceed scheduled minutes.
  if (t === "service_gap" || signal.category === "schedule" || signal.source === "schedule_gap") {
    return build({
      cause: "schedule_mismatch",
      confidence: "high",
      owner: resolveOwner("scheduler", role),
      action: "escalate_coverage_issue",
      explanation: "Weekly schedule does not cover the required IEP minutes. The schedule itself needs to be changed, not just back-filled with logs.",
      secondary: ["review_with_case_manager", "follow_up_with_provider"],
    });
  }

  // 5. Big chronic shortfall — likely a programmatic / requirement issue,
  //    not just a missed week. Bring the case manager in.
  if (chronicShortfall(signal)) {
    return build({
      cause: "ambiguous_review_needed",
      confidence: "medium",
      owner: resolveOwner("case_manager", role),
      action: "review_with_case_manager",
      explanation: "Shortfall is large relative to the requirement. Worth checking the IEP minutes, schedule, and provider assignment together before just logging.",
      secondary: ["review_requirement_data", "follow_up_with_provider", "schedule_makeup"],
    });
  }

  // 6. Generic compliance / minutes-behind from the risk report — we
  //    genuinely cannot tell from this signal alone whether it is doc lag
  //    or a true missed service. Be honest.
  if (
    t === "behind_on_minutes" || t === "projected_shortfall" ||
    t === "service_minutes_behind" || signal.source === "risk_report" ||
    signal.category === "compliance" || signal.category === "session"
  ) {
    return build({
      cause: "ambiguous_review_needed",
      confidence: "low",
      owner: resolveOwner("case_manager", role),
      action: "follow_up_with_provider",
      explanation: "Minutes are behind but the cause is not certain — could be undocumented sessions or true missed service. Ask the provider before scheduling makeups.",
      secondary: ["confirm_and_log_session", "schedule_makeup", "review_requirement_data"],
    });
  }

  // 7. Staffing/coverage category.
  if (signal.category === "staffing") {
    return build({
      cause: "provider_absence_or_staffing_issue",
      confidence: "medium",
      owner: resolveOwner("admin", role),
      action: "escalate_coverage_issue",
      explanation: "A provider absence or coverage gap is in play. Ensure coverage or a makeup plan exists.",
      secondary: ["follow_up_with_provider", "review_with_case_manager"],
    });
  }

  // Fallback — surface as monitor.
  return build({
    cause: "ambiguous_review_needed",
    confidence: "low",
    owner: resolveOwner("case_manager", role),
    action: "monitor_only",
    explanation: "No clear cause inferred from current signals. Worth a quick eyes-on review.",
    secondary: ["follow_up_with_provider", "review_with_case_manager"],
  });
}

function build(input: {
  cause: LikelyCause;
  confidence: Confidence;
  owner: RecommendedOwner;
  action: RecommendedActionType;
  explanation: string;
  secondary: RecommendedActionType[];
}): ActionRecommendation {
  return {
    likelyCause: input.cause,
    causeLabel: CAUSE_LABELS[input.cause],
    confidence: input.confidence,
    recommendedOwner: input.owner,
    ownerLabel: OWNER_LABELS[input.owner],
    recommendedAction: input.action,
    primaryActionLabel: ACTION_LABELS[input.action],
    explanation: input.explanation,
    secondaryActions: input.secondary
      .filter(a => a !== input.action)
      .map(a => ({ type: a, label: ACTION_LABELS[a] })),
  };
}

// ─── Handling-state transition menu (shared) ─────────────────────────────────

/**
 * Phase 1D — single source of truth for the handling-state transition
 * menu. Action Center and the student-detail Recommended Next Step card
 * both render this menu; pre-1D each had its own copy with cosmetically
 * different help text.
 */
export const HANDLING_TRANSITIONS: { state: HandlingState; label: string; help: string }[] = [
  { state: "needs_action",          label: "Mark as needs action",     help: "Back to the default red state — clears handling" },
  { state: "awaiting_confirmation", label: "Awaiting confirmation",    help: "Asked the provider / parent — waiting for reply" },
  { state: "recovery_scheduled",    label: "Scheduled pending",        help: "Makeup is on the calendar — minutes are pending, not yet delivered" },
  { state: "handed_off",            label: "Handed off",               help: "Passed to scheduler / case manager / admin" },
  { state: "under_review",          label: "Under review",             help: "Looking into the underlying requirement / data" },
  { state: "resolved",              label: "Resolved",                 help: "Done — hide on next refresh" },
];

// ─── Handling state badge styling ────────────────────────────────────────────

export const HANDLING_BADGE: Record<HandlingState, { bg: string; fg: string; ring: string }> = {
  needs_action:          { bg: "bg-red-50",    fg: "text-red-700",    ring: "ring-red-200" },
  awaiting_confirmation: { bg: "bg-amber-50",  fg: "text-amber-700",  ring: "ring-amber-200" },
  recovery_scheduled:    { bg: "bg-blue-50",   fg: "text-blue-700",   ring: "ring-blue-200" },
  handed_off:            { bg: "bg-violet-50", fg: "text-violet-700", ring: "ring-violet-200" },
  under_review:          { bg: "bg-slate-50",  fg: "text-slate-700",  ring: "ring-slate-200" },
  resolved:              { bg: "bg-emerald-50", fg: "text-emerald-700", ring: "ring-emerald-200" },
};
