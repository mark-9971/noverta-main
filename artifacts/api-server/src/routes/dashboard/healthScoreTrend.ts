// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { parseSchoolDistrictFilters } from "./shared";
import {
  getHealthScoreTrendForDistrict,
  computeDistrictHealthScore,
  captureDistrictHealthSnapshot,
} from "../../lib/districtHealthSnapshots";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

/**
 * GET /dashboard/health-score-trend
 *
 * Returns the persisted weekly trend of the district's composite health score
 * (the same A–F badge shown in the dashboard header) so the UI can render a
 * "+3 pts vs. last week" delta and a sparkline of recent weeks.
 *
 * Scope: this endpoint is intentionally district-wide and does NOT honour
 * `schoolId` / `schoolYearId` query params. Snapshots are captured once per
 * day per district by the scheduler in lib/districtHealthSnapshots.ts; the
 * "weekly" trend is built by collapsing those daily snapshots to one point
 * per ISO week (latest-in-week wins). A school-scoped trend would require
 * adding a school dimension to the snapshot table and capture functions.
 *
 * Response shape:
 *   {
 *     available: boolean,
 *     current?:    { numeric, grade, snapshotDate },
 *     priorWeek?:  { numeric, grade, snapshotDate },
 *     deltaPts?:   number,
 *     sparkline?:  { snapshotDate, numeric, grade }[]
 *   }
 *
 * On a brand-new district (no snapshot yet) we capture one inline so the very
 * first dashboard load shows *something* — the delta will populate next week.
 */
router.get("/dashboard/health-score-trend", async (req, res): Promise<void> => {
  try {
    const sd = parseSchoolDistrictFilters(req, req.query);
    const districtId = sd.districtId;
    if (!districtId) {
      res.json({ available: false });
      return;
    }

    let trend = await getHealthScoreTrendForDistrict(districtId);

    // Lazy-seed a snapshot on first read so a freshly-deployed district isn't
    // stuck without a current value until tomorrow's scheduler tick.
    if (!trend.current) {
      const computed = await computeDistrictHealthScore(districtId);
      if (computed) {
        await captureDistrictHealthSnapshot(districtId).catch((err) =>
          logger.warn({ err, districtId }, "lazy health snapshot failed (non-fatal)"),
        );
        trend = await getHealthScoreTrendForDistrict(districtId);
      }
    }

    if (!trend.current) {
      res.json({ available: false });
      return;
    }

    res.json({
      available: true,
      current: trend.current,
      priorWeek: trend.priorWeek,
      deltaPts: trend.deltaPts,
      sparkline: trend.sparkline,
    });
  } catch (err) {
    logger.warn({ err }, "GET /dashboard/health-score-trend failed");
    res.json({ available: false });
  }
});

export default router;
