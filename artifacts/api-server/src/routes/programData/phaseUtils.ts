/**
 * Shared phase-transition utilities for ABA program targets.
 * Used by both crud.ts (manual + probe-driven changes) and
 * dataCollection.ts (session-data-driven auto-progress).
 */
import { db } from "@workspace/db";
import {
  programTargetPhaseHistoryTable,
  programTargetsTable,
  maintenanceProbesTable,
} from "@workspace/db";
import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";

// Accept either the main db handle or a drizzle transaction (which has the same query API)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbOrTx = any;

/**
 * Close the current open phase history entry and insert a new one.
 * Accepts either the main `db` handle or a drizzle transaction.
 */
export async function recordPhaseTransition(
  dbOrTx: DbOrTx,
  programTargetId: number,
  newPhase: string,
  previousPhase: string | null | undefined,
  opts?: {
    reason?: string | null;
    changedByClerkId?: string | null;
    changedByStaffId?: number | null;
  },
): Promise<void> {
  await dbOrTx
    .update(programTargetPhaseHistoryTable)
    .set({ endedAt: new Date() })
    .where(
      and(
        eq(programTargetPhaseHistoryTable.programTargetId, programTargetId),
        isNull(programTargetPhaseHistoryTable.endedAt),
      ),
    );
  await dbOrTx.insert(programTargetPhaseHistoryTable).values({
    programTargetId,
    phase: newPhase,
    previousPhase: previousPhase ?? null,
    reason: opts?.reason ?? null,
    changedByClerkId: opts?.changedByClerkId ?? null,
    changedByStaffId: opts?.changedByStaffId ?? null,
  });
}

/**
 * After a maintenance probe is completed with passed=false,
 * check whether the last `regressionSessions` consecutive completed
 * probes for this target have ALL failed.  If so, and the target is
 * still in mastered/maintenance phase with autoProgressEnabled=true,
 * transition the phase to "reopened" and record history.
 *
 * Returns the new phase ("reopened") if a transition occurred, or null.
 */
export async function checkAndReopenOnProbeFailures(
  programTargetId: number,
  opts?: { changedByClerkId?: string | null },
): Promise<"reopened" | null> {
  const [target] = await db
    .select({
      phase: programTargetsTable.phase,
      autoProgressEnabled: programTargetsTable.autoProgressEnabled,
      regressionSessions: programTargetsTable.regressionSessions,
    })
    .from(programTargetsTable)
    .where(eq(programTargetsTable.id, programTargetId));

  if (!target) return null;
  if (!target.autoProgressEnabled) return null;
  if (target.phase !== "mastered" && target.phase !== "maintenance") return null;

  const n = target.regressionSessions ?? 2;

  const recentCompleted = await db
    .select({ passed: maintenanceProbesTable.passed })
    .from(maintenanceProbesTable)
    .where(
      and(
        eq(maintenanceProbesTable.programTargetId, programTargetId),
        isNotNull(maintenanceProbesTable.completedAt),
      ),
    )
    .orderBy(desc(maintenanceProbesTable.completedAt))
    .limit(n);

  if (recentCompleted.length < n) return null;

  const allFailed = recentCompleted.every(p => p.passed === false);
  if (!allFailed) return null;

  // Transition to reopened
  await db
    .update(programTargetsTable)
    .set({ phase: "reopened", phaseChangedAt: new Date() })
    .where(eq(programTargetsTable.id, programTargetId));

  await recordPhaseTransition(
    db,
    programTargetId,
    "reopened",
    target.phase,
    {
      reason: `Auto-reopened: ${n} consecutive maintenance probe${n === 1 ? "" : "s"} failed`,
      changedByClerkId: opts?.changedByClerkId ?? null,
    },
  );

  return "reopened";
}

/**
 * During data-session auto-progress, if the existing regression rule fires
 * for a target that is in mastered or maintenance phase, also reopen the phase.
 * Called inside a transaction — uses `tx` for the history write.
 *
 * Returns true if a reopen transition was written.
 */
export async function reopenOnSessionRegression(
  tx: DbOrTx,
  programTargetId: number,
  currentPhase: string,
  regressionSessions: number,
  regressionThreshold: number,
): Promise<boolean> {
  if (currentPhase !== "mastered" && currentPhase !== "maintenance") return false;

  await tx
    .update(programTargetsTable)
    .set({ phase: "reopened", phaseChangedAt: new Date() })
    .where(eq(programTargetsTable.id, programTargetId));

  await recordPhaseTransition(
    tx,
    programTargetId,
    "reopened",
    currentPhase,
    {
      reason: `Auto-reopened: ${regressionSessions} consecutive session${regressionSessions === 1 ? "" : "s"} below regression threshold (${regressionThreshold}%)`,
    },
  );

  return true;
}
