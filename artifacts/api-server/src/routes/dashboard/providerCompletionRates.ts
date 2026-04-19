// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { parseSchoolDistrictFilters } from "./shared";
import { requireRoles } from "../../middlewares/auth";

const router: IRouter = Router();

const DAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
] as const;

/** Shape returned by the raw aggregation query */
interface ProviderRateRow {
  staffId: string | number;
  staffName: string;
  role: string;
  scheduledCount: string | number;
  completedCount: string | number;
  userId: string | null;
}

router.get(
  "/dashboard/provider-completion-rates",
  requireRoles("admin", "coordinator"),
  async (req, res): Promise<void> => {
    try {
      const sdFilters = parseSchoolDistrictFilters(req, req.query);

      const today = new Date();
      const jsDay = today.getDay(); // 0 = Sun, 1 = Mon … 6 = Sat

      // Week starts on Monday. If today is Sunday (0), the week started 6 days ago.
      const daysFromMonday = jsDay === 0 ? 6 : jsDay - 1;
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - daysFromMonday);
      weekStart.setHours(0, 0, 0, 0);
      const weekStartStr = weekStart.toISOString().substring(0, 10);
      const todayStr = today.toISOString().substring(0, 10);

      // Days that have elapsed so far this week (Mon through today inclusive).
      const elapsedDayNames: string[] = [];
      for (let d = weekStart.getDay(); ; ) {
        elapsedDayNames.push(DAY_NAMES[d]);
        if (DAY_NAMES[d] === DAY_NAMES[today.getDay()]) break;
        d = (d + 1) % 7;
      }

      // Build safe district/school staff filter (values are numbers from parsed query)
      const staffDistrictClauses: string[] = [];
      if (sdFilters.districtId) {
        staffDistrictClauses.push(
          `s.school_id IN (SELECT id FROM schools WHERE district_id = ${Number(sdFilters.districtId)})`
        );
      }
      if (sdFilters.schoolId) {
        staffDistrictClauses.push(`s.school_id = ${Number(sdFilters.schoolId)}`);
      }
      const staffWhere = [
        "s.status = 'active'",
        "s.deleted_at IS NULL",
        ...staffDistrictClauses,
      ].join(" AND ");

      // Day names are from a hardcoded const array — no injection risk.
      const dayList = elapsedDayNames.map(d => `'${d}'`).join(", ");

      const result = await db.execute(sql.raw(`
        SELECT
          s.id                                                     AS "staffId",
          s.first_name || ' ' || s.last_name                      AS "staffName",
          s.role,
          COALESCE(sched.scheduled_count, 0)::int                 AS "scheduledCount",
          COALESCE(done.completed_count,  0)::int                 AS "completedCount",
          s.user_id                                               AS "userId"
        FROM staff s
        LEFT JOIN (
          SELECT staff_id, COUNT(*)::int AS scheduled_count
          FROM schedule_blocks
          WHERE is_recurring = true
            AND day_of_week IN (${dayList})
            AND deleted_at IS NULL
          GROUP BY staff_id
        ) sched ON sched.staff_id = s.id
        LEFT JOIN (
          SELECT staff_id, COUNT(*)::int AS completed_count
          FROM session_logs
          WHERE status = 'completed'
            AND session_date >= '${weekStartStr}'
            AND session_date <= '${todayStr}'
            AND deleted_at IS NULL
          GROUP BY staff_id
        ) done ON done.staff_id = s.id
        WHERE ${staffWhere}
          AND s.role IN ('provider', 'bcba', 'sped_teacher', 'case_manager')
          AND (sched.scheduled_count > 0 OR done.completed_count > 0)
        ORDER BY
          CASE WHEN COALESCE(sched.scheduled_count, 0) = 0 THEN 1 ELSE 0 END,
          CASE
            WHEN COALESCE(sched.scheduled_count, 0) = 0 THEN NULL
            ELSE COALESCE(done.completed_count, 0)::float / sched.scheduled_count::float
          END ASC NULLS LAST
      `));

      const rows = result.rows as unknown as ProviderRateRow[];

      const providers = rows.map(row => {
        const scheduled = Number(row.scheduledCount) || 0;
        const completed = Number(row.completedCount) || 0;
        const completionRate = scheduled > 0
          ? Math.round((completed / scheduled) * 100)
          : 100;
        return {
          staffId: Number(row.staffId),
          staffName: String(row.staffName),
          role: String(row.role),
          scheduledCount: scheduled,
          completedCount: completed,
          completionRate,
          userId: row.userId ?? null,
        };
      });

      res.json(providers);
    } catch (err) {
      console.error("[provider-completion-rates]", err);
      res.status(500).json({ error: "Failed to load provider completion rates" });
    }
  }
);

export default router;
