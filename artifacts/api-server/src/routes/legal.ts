import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";
import { requireRoles, type AuthedRequest } from "../middlewares/auth";

const router = Router();

/**
 * POST /api/legal/request-dpa
 * Records a DPA request from an admin user.
 * When email delivery is enabled (Task #65), this route should also send
 * a notification to the Trellis legal contact address.
 */
router.post(
  "/legal/request-dpa",
  requireRoles("admin", "coordinator"),
  async (req, res) => {
    const authed = req as AuthedRequest;
    const { districtName, contactName, contactEmail, contactTitle, notes } = req.body as Record<string, string>;

    if (!districtName || !contactName || !contactEmail) {
      res.status(400).json({ error: "districtName, contactName, and contactEmail are required" });
      return;
    }

    try {
      // Record the request in the audit log as a durable, queryable record
      await db.insert(auditLogsTable).values({
        action: "dpa_request",
        targetTable: "legal",
        targetId: null,
        actorUserId: authed.userId,
        actorRole: authed.trellisRole ?? "admin",
        summary: `DPA request from ${contactName} (${districtName})`,
        metadata: {
          districtName,
          contactName,
          contactEmail,
          contactTitle: contactTitle ?? null,
          notes: notes ?? null,
          requestedAt: new Date().toISOString(),
        },
      });

      // TODO (Task #65): Send email notification to legal@trellis.app with the request details
      // await sendEmail({
      //   to: "legal@trellis.app",
      //   subject: `DPA Request — ${districtName}`,
      //   body: `...`
      // });

      res.json({ ok: true, message: "DPA request recorded. Trellis will follow up within 2 business days." });
    } catch (err) {
      console.error("Failed to record DPA request:", err);
      res.status(500).json({ error: "Failed to record request" });
    }
  }
);

export default router;
