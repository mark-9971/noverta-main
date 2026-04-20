import { db, sessionLogsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

/**
 * Service Requirement v1 — supersede flow guard helpers.
 *
 * Once a Service Requirement has any *credited* session activity tied to it,
 * material edits must create a NEW row (via the supersede endpoint) instead
 * of mutating the existing one in-place. This preserves an honest period
 * chain for compliance auditing.
 *
 * "Credited" today = at least one row in `session_logs` with status in
 * ('delivered', 'partial') referencing the requirement. When the
 * `session_participants` table lands, swap the FROM clause here without
 * touching call sites.
 */

const CREDITED_STATUSES = ["delivered", "partial"] as const;

export interface CreditedSessionsResult {
  count: number;
  requiresSupersede: boolean;
}

export async function assertNoCreditedSessions(
  requirementId: number,
): Promise<CreditedSessionsResult> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(sessionLogsTable)
    .where(
      and(
        eq(sessionLogsTable.serviceRequirementId, requirementId),
        inArray(sessionLogsTable.status, CREDITED_STATUSES as unknown as string[]),
      ),
    );
  const count = Number(row?.count ?? 0);
  return { count, requiresSupersede: count > 0 };
}

/**
 * The ONLY in-place patches allowed on a credited Service Requirement.
 * Everything else must go through the supersede endpoint, including
 * silent attempts to mutate chain metadata such as `supersedesId` /
 * `replacedAt`. Note: `active` is allowed only when transitioning to
 * false (end-dating); reopening a credited+ended row would also need a
 * supersede.
 */
export const ALLOWED_NON_MATERIAL_FIELDS = ["priority", "notes"] as const;
const ALLOWED_NON_MATERIAL_SET = new Set<string>(ALLOWED_NON_MATERIAL_FIELDS);

/**
 * Inspect a patch body against the existing row and return the set of
 * field names that would require a supersede. The rule is an explicit
 * ALLOWLIST — any field outside {priority, notes, active=false} that
 * actually changes value is reported.
 */
export function materialFieldsChanging(
  oldRow: Record<string, unknown>,
  patch: Record<string, unknown>,
): string[] {
  const changing: string[] = [];
  for (const key of Object.keys(patch)) {
    const next = patch[key];
    if (next === undefined) continue;
    // active=false is allowed in place (end-dating). Any other value
    // for `active` (i.e. reopening a credited row) requires a supersede.
    if (key === "active") {
      if (next === false) continue;
      if (oldRow.active === next) continue;
      changing.push(key);
      continue;
    }
    if (ALLOWED_NON_MATERIAL_SET.has(key)) continue;
    const prev = oldRow[key];
    if (prev === next) continue;
    if (prev == null && next == null) continue;
    changing.push(key);
  }
  return changing;
}
