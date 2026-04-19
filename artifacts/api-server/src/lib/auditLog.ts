import { db, auditLogsTable } from "@workspace/db";
import type { Request } from "express";
import type { AuthedRequest } from "../middlewares/auth";
import { getClerkUserId, getPublicMeta } from "./clerkClaims";
import { isRole } from "./permissions";
import { getClientIp } from "./clientIp";

interface AuditEntry {
  action: "create" | "read" | "update" | "delete" | "rate_limit_exceeded" | "restore";
  targetTable: string;
  targetId?: string | number | null;
  studentId?: number | null;
  summary?: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

function resolveActor(req: Request): { userId: string; role: string } {
  const authed = req as unknown as AuthedRequest;
  if (authed.userId && authed.trellisRole) {
    return { userId: authed.userId, role: authed.trellisRole };
  }
  const clerkUserId = getClerkUserId(req);
  if (clerkUserId) {
    const meta = getPublicMeta(req);
    const role = isRole(meta.role) ? meta.role : "unknown";
    return { userId: clerkUserId, role };
  }
  return { userId: "anonymous", role: "unknown" };
}

export function logAudit(req: Request, entry: AuditEntry): void {
  const { userId: actorUserId, role: actorRole } = resolveActor(req);
  const ipAddress = getClientIp(req);

  // If the request is being made under an active "view-as" session (a platform
  // admin acting AS a target user), preserve that context inside the audit row's
  // metadata. The actorUserId/actorRole columns intentionally reflect the
  // EFFECTIVE user (the target), so route-level invariants like "this row was
  // created by the case manager" still hold; the impersonation is recorded as a
  // sidecar tag that compliance review can filter on.
  const authed = req as unknown as AuthedRequest;
  let metadata = entry.metadata ?? null;
  if (authed.viewAsAdminUserId) {
    metadata = {
      ...(metadata ?? {}),
      viewAs: {
        adminUserId: authed.viewAsAdminUserId,
        adminRole: authed.viewAsAdminRole ?? null,
        sessionId: authed.viewAsSessionId ?? null,
      },
    };
  }
  // Trellis-support session tag. Captures which support session the action
  // happened under so a district admin can later filter audit history by
  // session id and see exactly what was viewed during a given support call.
  if (authed.supportSessionId) {
    metadata = {
      ...(metadata ?? {}),
      supportSession: {
        sessionId: authed.supportSessionId,
        supportUserId: authed.supportUserId ?? null,
      },
    };
  }

  db.insert(auditLogsTable)
    .values({
      actorUserId,
      actorRole,
      action: entry.action,
      targetTable: entry.targetTable,
      targetId: entry.targetId != null ? String(entry.targetId) : null,
      studentId: entry.studentId ?? null,
      ipAddress,
      summary: entry.summary ?? null,
      oldValues: entry.oldValues ?? null,
      newValues: entry.newValues ?? null,
      metadata,
    })
    .execute()
    .catch((err) => {
      console.error("Audit log insert failed:", err);
    });
}

/** Alias for logAudit — prefer this name for non-CRUD actions (e.g. rate_limit_exceeded). */
export const logAuditEvent = logAudit;

export function diffObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>
): { old: Record<string, unknown>; new: Record<string, unknown> } | null {
  const oldDiff: Record<string, unknown> = {};
  const newDiff: Record<string, unknown> = {};
  let hasDiff = false;

  for (const key of Object.keys(newObj)) {
    const oldVal = oldObj[key];
    const newVal = newObj[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      oldDiff[key] = oldVal;
      newDiff[key] = newVal;
      hasDiff = true;
    }
  }

  return hasDiff ? { old: oldDiff, new: newDiff } : null;
}
