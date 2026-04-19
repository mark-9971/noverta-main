import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { pilotBaselineSnapshotsTable, districtsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getEnforcedDistrictId, requireRoles } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import {
  captureBaselineForDistrict,
  computePilotBaselineMetrics,
} from "../lib/pilotBaselineSnapshots";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * GET /api/pilot/baseline
 * Returns the immutable Day-0 baseline for the caller's district. If the
 * district is in pilot mode but no baseline has been captured yet (e.g. the
 * backfill hasn't run, or it just transitioned), capture one now.
 */
router.get(
  "/pilot/baseline",
  requireRoles("admin", "coordinator"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
      if (districtId == null) {
        res.status(400).json({ error: "District scope required" });
        return;
      }

      // Lazily capture the baseline on first read for districts that are in
      // pilot mode but pre-date the backfill (or whose backfill failed). This
      // makes the endpoint self-healing — admins never see a 404 for a
      // district that ought to have a baseline.
      const [district] = await db
        .select({ isPilot: districtsTable.isPilot })
        .from(districtsTable)
        .where(eq(districtsTable.id, districtId))
        .limit(1);
      if (district?.isPilot) {
        await captureBaselineForDistrict(districtId).catch((err) =>
          logger.warn({ err, districtId }, "lazy baseline capture failed (non-fatal)"),
        );
      }

      const [row] = await db
        .select()
        .from(pilotBaselineSnapshotsTable)
        .where(eq(pilotBaselineSnapshotsTable.districtId, districtId))
        .limit(1);
      if (!row) {
        res.json({ baseline: null });
        return;
      }
      res.json({
        baseline: {
          districtId: row.districtId,
          capturedAt: row.capturedAt,
          compliancePercent: row.compliancePercent,
          exposureDollars: row.exposureDollars,
          compEdMinutesOutstanding: row.compEdMinutesOutstanding,
          overdueEvaluations: row.overdueEvaluations,
          expiringIepsNext60: row.expiringIepsNext60,
        },
      });
    } catch (err) {
      logger.error({ err }, "GET /pilot/baseline failed");
      res.status(500).json({ error: "Failed to load pilot baseline" });
    }
  },
);

/**
 * GET /api/pilot/baseline/comparison
 * Returns the baseline alongside a freshly-computed snapshot of the same five
 * metrics so the UI can render a side-by-side "Day 0" vs "today" comparison.
 * Recomputed on every request — cheap enough at the cardinality we expect
 * (one district at a time, admin-only).
 */
router.get(
  "/pilot/baseline/comparison",
  requireRoles("admin", "coordinator"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
      if (districtId == null) {
        res.status(400).json({ error: "District scope required" });
        return;
      }

      const [district] = await db
        .select({ isPilot: districtsTable.isPilot })
        .from(districtsTable)
        .where(eq(districtsTable.id, districtId))
        .limit(1);
      if (district?.isPilot) {
        await captureBaselineForDistrict(districtId).catch((err) =>
          logger.warn({ err, districtId }, "lazy baseline capture failed (non-fatal)"),
        );
      }

      const [baselineRow] = await db
        .select()
        .from(pilotBaselineSnapshotsTable)
        .where(eq(pilotBaselineSnapshotsTable.districtId, districtId))
        .limit(1);
      const current = await computePilotBaselineMetrics(districtId);

      res.json({
        baseline: baselineRow
          ? {
              capturedAt: baselineRow.capturedAt,
              compliancePercent: baselineRow.compliancePercent,
              exposureDollars: baselineRow.exposureDollars,
              compEdMinutesOutstanding: baselineRow.compEdMinutesOutstanding,
              overdueEvaluations: baselineRow.overdueEvaluations,
              expiringIepsNext60: baselineRow.expiringIepsNext60,
            }
          : null,
        current: {
          generatedAt: new Date().toISOString(),
          ...current,
        },
      });
    } catch (err) {
      logger.error({ err }, "GET /pilot/baseline/comparison failed");
      res.status(500).json({ error: "Failed to load pilot baseline comparison" });
    }
  },
);

export default router;
