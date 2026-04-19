import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireRoles, getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";

const router: IRouter = Router();

const requireAdmin = requireRoles("admin", "coordinator");

/**
 * Admin email-delivery report.
 *
 * Aggregates rows in `email_deliveries` for the caller's district. Because the
 * table itself has no district column, district scope is derived through each
 * of the three foreign-key fan-outs:
 *   - signature_request_id  -> documents -> students -> schools.district_id
 *   - share_link_id         -> share_links.district_id (direct)
 *   - iep_meeting_id        -> team_meetings -> students -> schools.district_id
 * A row that resolves to none of these (e.g. legacy/orphaned) is excluded for
 * district-scoped callers; platform admins (no enforced district) see all.
 *
 * Returns:
 *   stats: { total, byStatus: { delivered, bounced, failed, complained, queued, accepted, not_configured }, deliveredPct, bouncedPct, failedPct }
 *   recentFailures: up to 100 failed/bounced/complained deliveries with recipient + context
 */
router.get("/admin/email-deliveries", requireAdmin, async (req, res): Promise<void> => {
  try {
    const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);

    // Build a CTE that selects all email_deliveries rows in the caller's district.
    // Platform admins (districtId == null) see everything.
    const districtFilter = districtId == null
      ? sql`TRUE`
      : sql`(
          (ed.signature_request_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM signature_requests sr
            JOIN documents d ON d.id = sr.document_id
            JOIN students s ON s.id = d.student_id
            JOIN schools sch ON sch.id = s.school_id
            WHERE sr.id = ed.signature_request_id AND sch.district_id = ${districtId}
          )) OR
          (ed.share_link_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM share_links sl
            WHERE sl.id = ed.share_link_id AND sl.district_id = ${districtId}
          )) OR
          (ed.iep_meeting_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_meetings tm
            JOIN students s ON s.id = tm.student_id
            JOIN schools sch ON sch.id = s.school_id
            WHERE tm.id = ed.iep_meeting_id AND sch.district_id = ${districtId}
          ))
        )`;

    const statsResult = await db.execute(sql`
      SELECT
        COUNT(*)::int                                                                AS total,
        COUNT(*) FILTER (WHERE ed.status = 'delivered')::int                         AS delivered,
        COUNT(*) FILTER (WHERE ed.status = 'bounced')::int                           AS bounced,
        COUNT(*) FILTER (WHERE ed.status = 'failed')::int                            AS failed,
        COUNT(*) FILTER (WHERE ed.status = 'complained')::int                        AS complained,
        COUNT(*) FILTER (WHERE ed.status = 'queued')::int                            AS queued,
        COUNT(*) FILTER (WHERE ed.status = 'accepted')::int                          AS accepted,
        COUNT(*) FILTER (WHERE ed.status = 'not_configured')::int                    AS not_configured
      FROM email_deliveries ed
      WHERE ${districtFilter}
    `);

    const row = statsResult.rows[0] as Record<string, number> | undefined;
    const total = row?.total ?? 0;
    const delivered = row?.delivered ?? 0;
    const bounced = row?.bounced ?? 0;
    const failed = row?.failed ?? 0;
    const complained = row?.complained ?? 0;
    const queued = row?.queued ?? 0;
    const accepted = row?.accepted ?? 0;
    const notConfigured = row?.not_configured ?? 0;

    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

    // Recent failed/bounced/complained deliveries with context.
    const failuresResult = await db.execute(sql`
      SELECT
        ed.id,
        ed.message_type,
        ed.recipient_email,
        ed.recipient_name,
        ed.subject,
        ed.status,
        ed.failed_reason,
        ed.attempted_at,
        ed.failed_at,
        ed.last_webhook_at,
        ed.signature_request_id,
        ed.share_link_id,
        ed.iep_meeting_id
      FROM email_deliveries ed
      WHERE ed.status IN ('bounced', 'failed', 'complained')
        AND ${districtFilter}
      ORDER BY COALESCE(ed.failed_at, ed.last_webhook_at, ed.attempted_at) DESC
      LIMIT 100
    `);

    const recentFailures = failuresResult.rows.map((r) => {
      const rec = r as {
        id: number;
        message_type: string;
        recipient_email: string;
        recipient_name: string | null;
        subject: string;
        status: string;
        failed_reason: string | null;
        attempted_at: Date | string;
        failed_at: Date | string | null;
        last_webhook_at: Date | string | null;
        signature_request_id: number | null;
        share_link_id: number | null;
        iep_meeting_id: number | null;
      };
      const toIso = (v: Date | string | null) =>
        v == null ? null : (v instanceof Date ? v.toISOString() : new Date(v).toISOString());
      return {
        id: rec.id,
        messageType: rec.message_type,
        recipientEmail: rec.recipient_email,
        recipientName: rec.recipient_name,
        subject: rec.subject,
        status: rec.status,
        failedReason: rec.failed_reason,
        attemptedAt: toIso(rec.attempted_at),
        failedAt: toIso(rec.failed_at),
        lastWebhookAt: toIso(rec.last_webhook_at),
        signatureRequestId: rec.signature_request_id,
        shareLinkId: rec.share_link_id,
        iepMeetingId: rec.iep_meeting_id,
      };
    });

    res.json({
      stats: {
        total,
        byStatus: { delivered, bounced, failed, complained, queued, accepted, notConfigured },
        deliveredPct: pct(delivered),
        bouncedPct: pct(bounced),
        failedPct: pct(failed),
        complainedPct: pct(complained),
      },
      recentFailures,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("GET /admin/email-deliveries error:", message);
    res.status(500).json({ error: "Failed to fetch email delivery report" });
  }
});

export default router;
