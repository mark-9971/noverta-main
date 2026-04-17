import { Router, type IRouter } from "express";
import {
  db,
  shareLinksTable,
  shareLinkAccessLogTable,
  studentsTable,
  schoolsTable,
} from "@workspace/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { logAudit } from "../../lib/auditLog";
import { assertStudentInCallerDistrict } from "../../lib/districtScope";
import { resolveGuardianRecipients, generateProgressSummary } from "./shared";
import {
  SHARE_LINK_CONFIG,
  generateShareToken,
  getClientIp,
  hashToken,
  ipRateLimiter,
  tokenHashPrefix,
  tokenRateLimiter,
} from "../../lib/shareLinks";

const router: IRouter = Router();

type AccessOutcome =
  | "granted"
  | "expired"
  | "revoked"
  | "exhausted"
  | "rate_limited"
  | "not_found";

async function recordAccess(opts: {
  shareLinkId: number | null;
  tokenHashPrefix: string;
  ip: string | null;
  userAgent: string | null;
  outcome: AccessOutcome;
  httpStatus: number;
}): Promise<void> {
  try {
    await db.insert(shareLinkAccessLogTable).values({
      shareLinkId: opts.shareLinkId,
      tokenHashPrefix: opts.tokenHashPrefix,
      ipAddress: opts.ip,
      userAgent: opts.userAgent,
      outcome: opts.outcome,
      httpStatus: opts.httpStatus,
    });
  } catch (err) {
    // Best-effort: never fail the user-facing request because the audit
    // insert failed. Log loudly so an operator notices.
    console.error("share-link access log insert failed:", err);
  }
}

router.get("/students/:studentId/progress-summary", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (!Number.isFinite(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, studentId, res))) return;

    const days = parseInt(req.query.days as string) || 30;
    const summary = await generateProgressSummary(studentId, days);

    if (!summary) { res.status(404).json({ error: "Student not found" }); return; }
    res.json(summary);
  } catch (e: unknown) {
    console.error("GET progress-summary error:", e);
    res.status(500).json({ error: "Failed to generate progress summary" });
  }
});

/**
 * Issue a new parent-facing progress share link.
 *
 * Body (all optional):
 *   - days:           lookback window for the snapshotted summary (1..365)
 *   - expiresInHours: TTL, clamped to SHARE_LINK_MAX_TTL_HOURS
 *   - maxViews:       view cap; null disables; clamped to SHARE_LINK_MAX_MAX_VIEWS
 *   - oneTimeView:    shortcut; when true, forces maxViews = 1
 *
 * Defaults are intentionally conservative (24h TTL, 25 views). Operators
 * can loosen via env. Caller must have district access to the student.
 */
router.post("/students/:studentId/progress-summary/share-link", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (!Number.isFinite(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, studentId, res))) return;

    const cfg = SHARE_LINK_CONFIG;
    const days = Math.max(1, Math.min(parseInt(req.body.days as string) || 30, 365));
    const requestedTtl = parseInt(req.body.expiresInHours as string);
    const expiresInHours = Math.max(
      1,
      Math.min(Number.isFinite(requestedTtl) ? requestedTtl : cfg.defaultTtlHours, cfg.maxTtlHours),
    );

    let maxViews: number | null;
    if (req.body.oneTimeView === true) {
      maxViews = 1;
    } else if (req.body.maxViews === null) {
      maxViews = null;
    } else if (req.body.maxViews !== undefined) {
      const n = parseInt(req.body.maxViews as string);
      if (!Number.isFinite(n) || n < 1) {
        res.status(400).json({ error: "maxViews must be a positive integer or null" });
        return;
      }
      maxViews = Math.min(n, cfg.maxMaxViews);
    } else {
      maxViews = cfg.defaultMaxViews;
    }

    const summary = await generateProgressSummary(studentId, days);
    if (!summary) { res.status(404).json({ error: "Student not found" }); return; }

    // Snapshot the student's current district so revoke/list calls can scope
    // by district even if the student is later moved.
    const [districtRow] = await db
      .select({ districtId: schoolsTable.districtId })
      .from(studentsTable)
      .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
      .where(eq(studentsTable.id, studentId))
      .limit(1);

    const authed = req as AuthedRequest;
    const token = generateShareToken();
    const tokenH = hashToken(token);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const [row] = await db.insert(shareLinksTable).values({
      tokenHash: tokenH,
      studentId,
      districtId: districtRow?.districtId ?? null,
      createdByUserId: authed.userId ?? null,
      createdByStaffId: authed.tenantStaffId ?? null,
      summary: JSON.stringify(summary),
      expiresAt,
      maxViews,
      viewCount: 0,
    }).returning({ id: shareLinksTable.id });

    logAudit(req, {
      action: "create",
      targetTable: "share_links",
      targetId: row?.id,
      studentId,
      summary: `Issued progress share link (ttl=${expiresInHours}h, maxViews=${maxViews ?? "unlimited"})`,
    });

    const guardianRecipients = await resolveGuardianRecipients(studentId);

    res.status(201).json({
      id: row?.id,
      token,
      expiresAt: expiresAt.toISOString(),
      maxViews,
      url: `/api/shared/progress/${token}`,
      guardianRecipients,
    });
  } catch (e: unknown) {
    console.error("POST share-link error:", e);
    res.status(500).json({ error: "Failed to generate share link" });
  }
});

/** List active (non-revoked) share links for a student, with view stats. */
router.get("/students/:studentId/progress-summary/share-links", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (!Number.isFinite(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, studentId, res))) return;

    const rows = await db
      .select({
        id: shareLinksTable.id,
        createdAt: shareLinksTable.createdAt,
        expiresAt: shareLinksTable.expiresAt,
        viewCount: shareLinksTable.viewCount,
        maxViews: shareLinksTable.maxViews,
        lastViewedAt: shareLinksTable.lastViewedAt,
        lastViewedIp: shareLinksTable.lastViewedIp,
        revokedAt: shareLinksTable.revokedAt,
        createdByUserId: shareLinksTable.createdByUserId,
      })
      .from(shareLinksTable)
      .where(eq(shareLinksTable.studentId, studentId))
      .orderBy(desc(shareLinksTable.createdAt));

    res.json(rows);
  } catch (e: unknown) {
    console.error("GET share-links error:", e);
    res.status(500).json({ error: "Failed to list share links" });
  }
});

/** Revoke a single share link. Returns 404 cross-tenant. */
router.delete("/students/:studentId/progress-summary/share-link/:id", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const id = parseInt(req.params.id);
    if (!Number.isFinite(studentId) || !Number.isFinite(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, studentId, res))) return;

    const authed = req as AuthedRequest;
    const [updated] = await db
      .update(shareLinksTable)
      .set({ revokedAt: new Date(), revokedByUserId: authed.userId ?? null })
      .where(and(
        eq(shareLinksTable.id, id),
        eq(shareLinksTable.studentId, studentId),
        isNull(shareLinksTable.revokedAt),
      ))
      .returning({ id: shareLinksTable.id });

    if (!updated) { res.status(404).json({ error: "Share link not found" }); return; }

    logAudit(req, {
      action: "delete",
      targetTable: "share_links",
      targetId: id,
      studentId,
      summary: "Revoked progress share link",
    });

    res.json({ ok: true });
  } catch (e: unknown) {
    console.error("DELETE share-link error:", e);
    res.status(500).json({ error: "Failed to revoke share link" });
  }
});

/**
 * Rotate a share link: revoke the existing token and issue a new one bound
 * to the same snapshot/expiry/maxViews/viewCount-reset-to-0.
 */
router.post("/students/:studentId/progress-summary/share-link/:id/rotate", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const id = parseInt(req.params.id);
    if (!Number.isFinite(studentId) || !Number.isFinite(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, studentId, res))) return;

    const authed = req as AuthedRequest;
    const token = generateShareToken();
    const tokenH = hashToken(token);

    // Atomic rotate: a single conditional UPDATE wins the revoke race so two
    // concurrent rotates cannot both mint a new token. The losing rotate
    // gets `claimed.length === 0` and returns 409. Only on a winning claim
    // do we insert the replacement row.
    const claimed = await db
      .update(shareLinksTable)
      .set({ revokedAt: new Date(), revokedByUserId: authed.userId ?? null })
      .where(and(
        eq(shareLinksTable.id, id),
        eq(shareLinksTable.studentId, studentId),
        isNull(shareLinksTable.revokedAt),
      ))
      .returning({
        districtId: shareLinksTable.districtId,
        summary: shareLinksTable.summary,
        expiresAt: shareLinksTable.expiresAt,
        maxViews: shareLinksTable.maxViews,
      });

    if (claimed.length === 0) {
      // Either the link doesn't belong to this student (cross-tenant
      // attempt) or it was already revoked — both should look identical to
      // the caller. We pick 404 to match the rest of the cross-tenant
      // surface, but a concurrent rotate that lost the race will see this
      // and can retry against the new id.
      res.status(404).json({ error: "Share link not found or already revoked" });
      return;
    }
    const existing = claimed[0]!;

    const [newRow] = await db.insert(shareLinksTable).values({
      tokenHash: tokenH,
      studentId,
      districtId: existing.districtId,
      createdByUserId: authed.userId ?? null,
      createdByStaffId: authed.tenantStaffId ?? null,
      summary: existing.summary,
      expiresAt: existing.expiresAt,
      maxViews: existing.maxViews,
      viewCount: 0,
    }).returning({ id: shareLinksTable.id });

    logAudit(req, {
      action: "update",
      targetTable: "share_links",
      targetId: newRow?.id,
      studentId,
      summary: `Rotated share link (old=${id}, new=${newRow?.id})`,
    });

    res.json({
      id: newRow?.id,
      token,
      expiresAt: existing.expiresAt.toISOString(),
      maxViews: existing.maxViews,
      url: `/api/shared/progress/${token}`,
    });
  } catch (e: unknown) {
    console.error("POST rotate share-link error:", e);
    res.status(500).json({ error: "Failed to rotate share link" });
  }
});

// NOTE: the public consumption endpoint /api/shared/progress/:token lives in
// sharedProgressPublic.ts and is mounted on the global router BEFORE
// requireAuth — it cannot live here because this router sits behind auth.

export default router;
