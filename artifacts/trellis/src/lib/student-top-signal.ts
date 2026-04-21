/**
 * Pilot Wedge Phase 1C — derive a `RecommendationSignal` for the
 * highest-priority *current* operational issue on a student record so
 * student detail can speak the same operational language as the
 * Action Center without reimplementing the recommendation engine.
 *
 * Honesty notes:
 *   - Pure derivation from data the student page already loads. No
 *     new fetches, no schema changes.
 *   - Returns `null` when the student has nothing material to act on,
 *     so the caller can hide the surface entirely instead of inventing
 *     a soft "Monitor" CTA.
 *   - Priority order is operationally chosen, not arbitrary:
 *       1. evaluation overdue   (legal clock)
 *       2. evaluation upcoming  (legal clock soon)
 *       3. likely-missed service (hard evidence: missed_sessions > 0)
 *       4. compliance shortfall (chronic / out-of-compliance / at-risk)
 *       5. nothing
 */

import type { RecommendationSignal } from "./action-recommendations";

export interface StudentTopSignalInput {
  /** From `useGetStudentMinuteProgress` — items the page already filters
   *  to at_risk / slightly_behind / out_of_compliance. */
  atRiskServices: Array<{
    serviceRequirementId?: number;
    serviceTypeName?: string;
    riskStatus?: string;
    requiredMinutes?: number;
    deliveredMinutes?: number;
  }>;
  /** Number of `status === "missed"` rows in recent sessions. */
  missedSessions: number;
  /** Already-shaped re-eval status block from `/api/evaluations/.../re-eval-status`. */
  reEvalStatus?: {
    hasEligibility?: boolean;
    reEvalStatus?: { urgency?: string } | null;
  } | null;
}

export interface StudentTopSignal {
  signal: RecommendationSignal;
  /** Stable id for the surface to key handling state by. */
  itemId: string;
  /** Free-text summary for the "Why" line under the recommendation. */
  whySummary: string;
  /** Cap on the number of *additional* issues so the UI can say
   *  "+ 2 more issues on this student". */
  additionalIssueCount: number;
}

export function deriveStudentTopSignal(
  studentId: number,
  input: StudentTopSignalInput,
): StudentTopSignal | null {
  const { atRiskServices, missedSessions, reEvalStatus } = input;

  const evalUrgency = reEvalStatus?.reEvalStatus?.urgency;

  // Count of distinct issue types that exist on this student so we
  // can honestly say "and N more" rather than pretend the top issue
  // is the only thing happening.
  const issueCount =
    (evalUrgency === "overdue" || evalUrgency === "upcoming" ? 1 : 0) +
    atRiskServices.length;

  // 1. Evaluation overdue — hard legal clock, beats everything.
  if (evalUrgency === "overdue") {
    return {
      itemId: `student:${studentId}:eval-overdue`,
      additionalIssueCount: Math.max(0, issueCount - 1),
      whySummary: "Re-evaluation window is exceeded — escalate so the eval is assigned and the 60-day clock is honored.",
      signal: {
        category: "evaluation",
        alertType: "evaluation_overdue",
        source: "deadline",
      },
    };
  }

  // 2. Evaluation coming up — same shape, less urgent.
  if (evalUrgency === "upcoming") {
    return {
      itemId: `student:${studentId}:eval-upcoming`,
      additionalIssueCount: Math.max(0, issueCount - 1),
      whySummary: "Re-evaluation due soon — confirm the eval is assigned before the window closes.",
      signal: {
        category: "evaluation",
        alertType: "evaluation_overdue",
        source: "deadline",
      },
    };
  }

  // 3. Hard evidence of a missed service on an at-risk requirement —
  //    schedule a makeup, do not log.
  if (atRiskServices.length > 0 && missedSessions > 0) {
    const top = pickWorstService(atRiskServices);
    return {
      itemId: `student:${studentId}:missed-service:${top.serviceRequirementId ?? "any"}`,
      additionalIssueCount: Math.max(0, issueCount - 1),
      whySummary: `${missedSessions} session${missedSessions === 1 ? "" : "s"} marked missed and ${top.serviceTypeName ?? "the service"} is at ${pct(top)}% of required minutes. Plan a makeup so minutes are recovered.`,
      signal: {
        category: "session",
        alertType: "missed_sessions",
        source: "alert",
        riskStatus: top.riskStatus,
        requiredMinutes: top.requiredMinutes,
        shortfallMinutes: shortfall(top),
        hasMissedEvidence: true,
      },
    };
  }

  // 4. Shortfall on at-risk service without missed-evidence — honest
  //    ambiguous risk-report-style signal.
  if (atRiskServices.length > 0) {
    const top = pickWorstService(atRiskServices);
    return {
      itemId: `student:${studentId}:shortfall:${top.serviceRequirementId ?? "any"}`,
      additionalIssueCount: Math.max(0, issueCount - 1),
      whySummary: `${top.serviceTypeName ?? "Service"} is at ${pct(top)}% of required minutes. Could be undocumented sessions or true missed service — ask the provider before scheduling makeups.`,
      signal: {
        category: "compliance",
        alertType: "service_minutes_behind",
        source: "risk_report",
        riskStatus: top.riskStatus,
        requiredMinutes: top.requiredMinutes,
        shortfallMinutes: shortfall(top),
        hasMissedEvidence: false,
      },
    };
  }

  return null;
}

const RISK_PRIORITY: Record<string, number> = {
  out_of_compliance: 0,
  at_risk: 1,
  slightly_behind: 2,
};

function pickWorstService<T extends { riskStatus?: string; requiredMinutes?: number; deliveredMinutes?: number }>(svcs: T[]): T {
  return [...svcs].sort((a, b) => {
    const ar = RISK_PRIORITY[a.riskStatus ?? ""] ?? 99;
    const br = RISK_PRIORITY[b.riskStatus ?? ""] ?? 99;
    if (ar !== br) return ar - br;
    // Tie-break by absolute shortfall.
    return shortfall(b) - shortfall(a);
  })[0];
}

function shortfall(s: { requiredMinutes?: number; deliveredMinutes?: number }): number {
  return Math.max(0, (s.requiredMinutes ?? 0) - (s.deliveredMinutes ?? 0));
}

function pct(s: { requiredMinutes?: number; deliveredMinutes?: number }): number {
  const r = s.requiredMinutes ?? 0;
  if (r <= 0) return 0;
  return Math.round(((s.deliveredMinutes ?? 0) / r) * 100);
}
