/**
 * CLERK AUDIT LOG (restore version)
 *
 * To restore: cp this file → src/lib/auditLog.ts
 */
import { db, auditLogsTable } from "@workspace/db";
import type { Request } from "express";
import { getAuth } from "@clerk/express";
import type { AuthedRequest } from "../middlewares/auth";
import { isRole } from "./permissions";

interface AuditEntry {
  action: "create" | "read" | "update" | "delete";
  targetTable: string;
  targetId?: string | number | null;
  studentId?: number | null;
  summary?: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || null;
}

function resolveActor(req: Request): { userId: string; role: string } {
  const authed = req as AuthedRequest;
  if (authed.userId && authed.trellisRole) {
    return { userId: authed.userId, role: authed.trellisRole };
  }
  try {
    const auth = getAuth(req);
    if (auth?.userId) {
      const meta = (auth.sessionClaims as Record<string, unknown>)?.publicMetadata as Record<string, unknown> | undefined;
      const role = meta?.role;
      return {
        userId: auth.userId,
        role: typeof role === "string" && isRole(role) ? role : "unknown",
      };
    }
  } catch (_e) {}
  return { userId: "anonymous", role: "unknown" };
}

export function logAudit(req: Request, entry: AuditEntry): void {
  const { userId: actorUserId, role: actorRole } = resolveActor(req);
  const ipAddress = getClientIp(req);

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
      metadata: entry.metadata ?? null,
    })
    .execute()
    .catch((err) => {
      console.error("Audit log insert failed:", err);
    });
}

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
