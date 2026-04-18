import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { RequestParamHandler } from "express";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";

export type GoalEntry = {
  iepGoalId: number;
  notes?: string | null;
  behaviorTargetId?: number | null;
  behaviorData?: { value: number; intervalCount?: number | null; intervalsWith?: number | null; hourBlock?: string | null; notes?: string | null } | null;
  programTargetId?: number | null;
  programData?: { trialsCorrect?: number; trialsTotal?: number; prompted?: number | null; stepNumber?: number | null; independenceLevel?: string | null; promptLevelUsed?: string | null; notes?: string | null } | null;
};

export function validateGoalData(arr: any[]): { valid: true; data: GoalEntry[] } | { valid: false; error: string } {
  for (let i = 0; i < arr.length; i++) {
    const entry = arr[i];
    if (typeof entry.iepGoalId !== "number" || !Number.isInteger(entry.iepGoalId)) {
      return { valid: false, error: `goalData[${i}].iepGoalId must be an integer` };
    }
    if (entry.behaviorData && typeof entry.behaviorData.value !== "number") {
      return { valid: false, error: `goalData[${i}].behaviorData.value must be a number` };
    }
  }
  return { valid: true, data: arr as GoalEntry[] };
}

export function sessionToJson(s: any) {
  return {
    ...s,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
  };
}

/**
 * Tenant ownership guard for all session /:id routes (GET, PATCH, DELETE).
 * Runs once per request when Express resolves the :id parameter.
 * Returns 403 if the session's student does not belong to the caller's district.
 * Platform admins (null enforcedDistrictId) bypass this check and see all records.
 */
export const sessionIdGuard: RequestParamHandler = async (req, res, next, id) => {
  const sessionId = Number(id);
  if (!Number.isFinite(sessionId) || sessionId <= 0) { next(); return; }
  const enforcedDistrictId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (enforcedDistrictId !== null) {
    const rows = await db.execute(sql`
      SELECT 1 FROM session_logs
      WHERE id = ${sessionId}
        AND deleted_at IS NULL
        AND student_id IN (
          SELECT id FROM students WHERE school_id IN (
            SELECT id FROM schools WHERE district_id = ${enforcedDistrictId}
          )
        )
    `);
    if (!rows.rows.length) {
      res.status(403).json({ error: "Access denied: session does not belong to your district" });
      return;
    }
  }
  next();
};
