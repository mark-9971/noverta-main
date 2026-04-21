/**
 * Pilot Wedge Phase 1D — schedule-makeup launch path.
 *
 * Single source of truth for "where does the Schedule makeup CTA take
 * the user, and with what context?" Used by the Action Center primary
 * CTA, the student-detail Recommended Next Step card, and the
 * compliance Risk Report inline action.
 *
 * Honesty:
 *   - We do NOT auto-create a makeup session. We deep-link to the
 *     existing Scheduling Hub → "Minutes at Risk" tab with enough
 *     context (studentId, optional serviceRequirementId, intent,
 *     from) for that tab to preselect the row, surface a "Makeup
 *     intent" banner, and pre-open the existing BlockFormDialog when
 *     the row is identifiable.
 *   - The same params let the Scheduling tab render a "← Back to
 *     Action Center / Compliance / Student" link so the queue-oriented
 *     workflow is preserved.
 */

export type ScheduleMakeupOrigin =
  | "action-center"
  | "student-detail"
  | "compliance";

export interface ScheduleMakeupContext {
  studentId: number;
  /** When known (most rows), lets the destination preselect / pre-open
   *  the dialog for the exact at-risk service requirement. */
  serviceRequirementId?: number | null;
  /** When known (Action Center missed-session alerts), the destination
   *  can show "scheduling makeup for session X" context. */
  missedSessionId?: number | null;
  /** Producer surface — used by the destination to render a back link. */
  from: ScheduleMakeupOrigin;
  /** Phase A — T02: originating Action Center / Risk Report handling-row
   *  id (e.g. "alert:123", "risk:42:19", "service-gap:42:19"). When
   *  present, the destination scheduling form carries this through to
   *  the created schedule_block via `source_action_item_id`, closing
   *  the loop between an at-risk wedge item and the makeup it
   *  produced. */
  sourceActionItemId?: string | null;
}

/**
 * Build the Scheduling Hub URL for a makeup launch.
 *
 *   /scheduling?tab=minutes&intent=makeup&studentId=N
 *               [&serviceRequirementId=M][&missedSessionId=K]&from=...
 */
export function buildScheduleMakeupHref(ctx: ScheduleMakeupContext): string {
  const params = new URLSearchParams();
  params.set("tab", "minutes");
  params.set("intent", "makeup");
  params.set("studentId", String(ctx.studentId));
  if (ctx.serviceRequirementId != null) {
    params.set("serviceRequirementId", String(ctx.serviceRequirementId));
  }
  if (ctx.missedSessionId != null) {
    params.set("missedSessionId", String(ctx.missedSessionId));
  }
  if (ctx.sourceActionItemId) {
    params.set("sourceActionItemId", ctx.sourceActionItemId);
  }
  params.set("from", ctx.from);
  return `/scheduling?${params.toString()}`;
}

/**
 * Stable item id for compliance Risk Report row handling state.
 *
 * Phase 1E — delegates to the canonical `itemIdForRisk` helper so the
 * id used here is the SAME id the Action Center / student-detail card
 * use, and so a `setState` from any surface lands on the same shared
 * row in `action_item_handling`. Kept as a thin alias so existing
 * imports don't need to be rewritten.
 */
export function riskRowItemId(studentId: number, serviceRequirementId: number): string {
  return `risk:${studentId}:${serviceRequirementId}`;
}
