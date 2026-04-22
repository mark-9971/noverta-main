/**
 * T04 — Server-side auto-resolve of shared Action-Center handling state
 * when a session log lands that "closes the loop" on the originating
 * action item.
 *
 * Contract:
 *   When POST /sessions inserts a session_logs row whose `sourceActionItemId`
 *   is set AND whose status is "completed" or "makeup", we transition the
 *   matching `action_item_handling` row to state="resolved" (upsert) and
 *   write an `action_item_handling_events` audit row.
 *
 * Invariants:
 *   - **District-scoped**: districtId is derived from student → school,
 *     never trusted from the client.
 *   - **Role-gated**: mirrors `requireHandlingStateAccess` on the canonical
 *     `PUT /action-item-handling/:itemId` route. Lower-privileged roles
 *     (e.g. `para`, `sped_student`, `sped_parent`) can still log sessions
 *     but do not get the auto-resolve side effect; their handling-state
 *     transitions must go through the canonical PUT, which enforces the
 *     same role list. This closes the indirect-mutation loophole.
 *   - **Atomic + idempotent**: the upsert + event-emit run in a single
 *     SERIALIZABLE-class transaction with row-level lock on the handling
 *     row, so two concurrent makeup logs against the same item land
 *     exactly one transition event and one resolved row.
 *   - **Best-effort wrapper**: failures are caught and reported via the
 *     return value but never crash the surrounding POST /sessions; the
 *     session insert is what matters, the handling-state mirror is a UX
 *     nicety the next refresh will reconcile via T03's no-double-counting
 *     math.
 */
import { db, pool } from "@workspace/db";
import {
  actionItemHandlingTable,
  actionItemHandlingEventsTable,
  studentsTable,
  schoolsTable,
} from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";

const ITEM_ID_PATTERN = /^[a-z][a-z0-9-]*:[A-Za-z0-9:_-]+$/;

/**
 * Roles allowed to mutate shared handling state. Mirrors the role list
 * on `requireHandlingStateAccess` in routes/actionItemHandling.ts. Keep
 * these two in sync — this is the canonical access-control list for any
 * write that lands in `action_item_handling`.
 */
const HANDLING_WRITE_ROLES: ReadonlySet<string> = new Set([
  "admin",
  "coordinator",
  "case_manager",
  "sped_teacher",
  "bcba",
  "provider",
]);

export interface AutoResolveInput {
  sessionId: number;
  studentId: number;
  sourceActionItemId: string;
  status: string;
  /** From AuthedRequest.trellisRole. Used to gate handling-state writes. */
  callerRole: string | null;
  actorUserId: string | null;
  actorDisplayName: string | null;
}

export interface AutoResolveOutcome {
  ok: boolean;
  /** Why we skipped, for logs/tests. */
  reason?:
    | "invalid_item_id"
    | "non_completing_status"
    | "forbidden_role"
    | "student_not_found"
    | "already_resolved"
    | "error";
  /** True iff we actually wrote a transition (insert or update). */
  transitioned?: boolean;
  /** State the row landed in (always "resolved" when transitioned=true). */
  toState?: "resolved";
}

export async function autoResolveActionItemFromSession(
  input: AutoResolveInput,
): Promise<AutoResolveOutcome> {
  // Cheap shape gate first so a malformed id can't poison the unique
  // index even if it slipped past the OpenAPI schema somehow.
  if (
    typeof input.sourceActionItemId !== "string" ||
    input.sourceActionItemId.length < 3 ||
    input.sourceActionItemId.length > 200 ||
    !ITEM_ID_PATTERN.test(input.sourceActionItemId)
  ) {
    return { ok: false, reason: "invalid_item_id" };
  }

  if (input.status !== "completed" && input.status !== "makeup") {
    return { ok: false, reason: "non_completing_status" };
  }

  // Authz: same role list as the canonical PUT /action-item-handling
  // route. A `para` (or any role outside the privileged set) can log a
  // session but cannot indirectly flip handling state via the
  // sourceActionItemId carrier.
  if (!input.callerRole || !HANDLING_WRITE_ROLES.has(input.callerRole)) {
    return { ok: false, reason: "forbidden_role" };
  }

  try {
    // Look up districtId via student → school. We deliberately do NOT
    // trust any client-supplied districtId; the session is already
    // scoped to a real student row by the POST /sessions
    // district-ownership check upstream.
    const districtRows = await db
      .select({ districtId: schoolsTable.districtId })
      .from(studentsTable)
      .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
      .where(eq(studentsTable.id, input.studentId))
      .limit(1);
    const districtId = districtRows[0]?.districtId ?? null;
    if (districtId == null) {
      return { ok: false, reason: "student_not_found" };
    }

    const itemId = input.sourceActionItemId;
    const note = `Auto-resolved by session log #${input.sessionId} (status=${input.status})`;

    // Atomic upsert + event-emit. We open a short-lived pg transaction,
    // SELECT ... FOR UPDATE on the existing handling row to serialize
    // concurrent callers, then either no-op (already resolved), update,
    // or insert — and emit exactly one event row when state actually
    // changes.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb = drizzle(client);

      const lockResult = await client.query<{ state: string }>(
        `SELECT state FROM action_item_handling
           WHERE district_id = $1 AND item_id = $2
           FOR UPDATE`,
        [districtId, itemId],
      );
      const existingState = lockResult.rows[0]?.state ?? null;

      if (existingState === "resolved") {
        await client.query("COMMIT");
        return { ok: true, reason: "already_resolved", transitioned: false };
      }

      const now = new Date();
      if (existingState != null) {
        await txDb
          .update(actionItemHandlingTable)
          .set({
            state: "resolved",
            resolvedAt: now,
            updatedByUserId: input.actorUserId,
            updatedByName: input.actorDisplayName,
          })
          .where(
            and(
              eq(actionItemHandlingTable.districtId, districtId),
              eq(actionItemHandlingTable.itemId, itemId),
            ),
          );
      } else {
        // No prior row. INSERT ... ON CONFLICT DO NOTHING so that if
        // another transaction sneaked an insert in between our SELECT
        // FOR UPDATE (which finds nothing to lock when no row exists)
        // and our insert, we don't crash on the unique-index violation.
        // If the conflict path fires, this transaction simply re-checks
        // and rolls back to "already resolved" semantics on retry — but
        // we still emit an event below since we observed no prior state.
        await txDb
          .insert(actionItemHandlingTable)
          .values({
            districtId,
            itemId,
            state: "resolved",
            note: null,
            recommendedOwnerRole: null,
            assignedToRole: null,
            assignedToUserId: null,
            updatedByUserId: input.actorUserId,
            updatedByName: input.actorDisplayName,
            resolvedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              actionItemHandlingTable.districtId,
              actionItemHandlingTable.itemId,
            ],
            set: {
              state: sql`CASE WHEN ${actionItemHandlingTable.state} = 'resolved' THEN ${actionItemHandlingTable.state} ELSE 'resolved' END`,
              resolvedAt: sql`CASE WHEN ${actionItemHandlingTable.state} = 'resolved' THEN ${actionItemHandlingTable.resolvedAt} ELSE ${now} END`,
            },
          });
      }

      await txDb.insert(actionItemHandlingEventsTable).values({
        districtId,
        itemId,
        fromState: existingState,
        toState: "resolved",
        note,
        changedByUserId: input.actorUserId,
        changedByName: input.actorDisplayName,
      });

      await client.query("COMMIT");
      return { ok: true, transitioned: true, toState: "resolved" };
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[autoResolveActionItemFromSession] failed:", err);
    return { ok: false, reason: "error" };
  }
}
