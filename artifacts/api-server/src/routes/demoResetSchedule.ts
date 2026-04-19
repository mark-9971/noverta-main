/**
 * Platform-admin endpoints for managing the automatic demo-reset schedule.
 *
 * GET  /admin/demo-reset-schedule  — fetch current cadence setting
 * PUT  /admin/demo-reset-schedule  — update cadence (off | hourly | before-demo)
 * GET  /admin/demo-reset-audit     — recent audit log of scheduler-triggered resets
 * POST /admin/demo-reset-schedule/run-now — manually trigger a reset via the scheduler path (records audit row)
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { demoResetScheduleTable, demoResetAuditTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requirePlatformAdmin } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { reloadSchedule } from "../lib/demoResetScheduler";
import { z } from "zod";

const router: IRouter = Router();

const cadenceSchema = z.object({
  cadence: z.enum(["off", "hourly", "before-demo"]),
});

// ── GET /admin/demo-reset-schedule ──────────────────────────────────────────
router.get(
  "/admin/demo-reset-schedule",
  requirePlatformAdmin,
  async (_req, res): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(demoResetScheduleTable)
        .where(eq(demoResetScheduleTable.id, 1));

      if (!row) {
        // Shouldn't happen after migration seeds the singleton, but handle it.
        res.json({ id: 1, cadence: "off", updatedAt: null, updatedBy: null });
        return;
      }

      res.json(row);
    } catch (err) {
      logger.error({ err }, "GET /admin/demo-reset-schedule error");
      res.status(500).json({ error: "Failed to fetch demo reset schedule" });
    }
  },
);

// ── PUT /admin/demo-reset-schedule ──────────────────────────────────────────
router.put(
  "/admin/demo-reset-schedule",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const parsed = cadenceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid cadence", details: parsed.error.flatten() });
      return;
    }

    const { cadence } = parsed.data;
    const authedReq = req as unknown as AuthedRequest;
    const updatedBy = authedReq.auth?.userId ?? "unknown";

    try {
      const [updated] = await db
        .insert(demoResetScheduleTable)
        .values({ id: 1, cadence, updatedBy })
        .onConflictDoUpdate({
          target: demoResetScheduleTable.id,
          set: { cadence, updatedBy, updatedAt: new Date() },
        })
        .returning();

      // Hot-reload the in-process scheduler so the new cadence takes effect
      // immediately without a server restart.
      await reloadSchedule();

      logger.info({ cadence, updatedBy }, "demo reset schedule updated");
      res.json({ ok: true, ...updated });
    } catch (err) {
      logger.error({ err }, "PUT /admin/demo-reset-schedule error");
      res.status(500).json({ error: "Failed to update demo reset schedule" });
    }
  },
);

// ── GET /admin/demo-reset-audit ─────────────────────────────────────────────
router.get(
  "/admin/demo-reset-audit",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 100);

      const rows = await db
        .select()
        .from(demoResetAuditTable)
        .orderBy(desc(demoResetAuditTable.startedAt))
        .limit(limit);

      res.json(rows);
    } catch (err) {
      logger.error({ err }, "GET /admin/demo-reset-audit error");
      res.status(500).json({ error: "Failed to fetch demo reset audit log" });
    }
  },
);

export default router;
