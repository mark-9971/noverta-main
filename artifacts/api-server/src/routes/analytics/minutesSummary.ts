// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  sessionLogsTable, serviceTypesTable, staffTable,
} from "@workspace/db";
import { eq, and, count, sql, desc, asc, isNull } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";
import { resolveSchoolYearWindow } from "../dashboard/shared";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

router.get("/analytics/minutes-summary", async (req, res): Promise<void> => {
  try {
    const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
    const yearWindow = await resolveSchoolYearWindow(req, req.query as Record<string, unknown>, districtId);
    const dateConds: any[] = [isNull(sessionLogsTable.deletedAt)];
    if (yearWindow.startDate) dateConds.push(sql`${sessionLogsTable.sessionDate} >= ${yearWindow.startDate}`);
    if (yearWindow.endDate) dateConds.push(sql`${sessionLogsTable.sessionDate} <= ${yearWindow.endDate}`);
    const sessionWhere = and(...dateConds);

    const weeklyDelivery = await db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${sessionLogsTable.sessionDate}::date), 'YYYY-MM-DD')`.as("week"),
        totalMinutes: sql<number>`sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end)`,
        completedCount: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'completed')`,
        missedCount: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'missed')`,
      })
      .from(sessionLogsTable)
      .where(sessionWhere)
      .groupBy(sql`date_trunc('week', ${sessionLogsTable.sessionDate}::date)`)
      .orderBy(asc(sql`date_trunc('week', ${sessionLogsTable.sessionDate}::date)`));

    const byService = await db
      .select({
        serviceTypeName: serviceTypesTable.name,
        serviceCategory: serviceTypesTable.category,
        totalDelivered: sql<number>`sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end)`,
        sessionCount: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'completed')`,
        missedCount: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'missed')`,
      })
      .from(sessionLogsTable)
      .where(sessionWhere)
      .innerJoin(serviceTypesTable, eq(sessionLogsTable.serviceTypeId, serviceTypesTable.id))
      .groupBy(serviceTypesTable.name, serviceTypesTable.category);

    const allProgress = await computeAllActiveMinuteProgress({
      ...(districtId !== null ? { districtId } : {}),
      ...(yearWindow.startDate ? { startDate: yearWindow.startDate } : {}),
      ...(yearWindow.endDate ? { endDate: yearWindow.endDate } : {}),
    });
    const serviceAgg = new Map<string, { delivered: number; required: number }>();
    for (const p of allProgress) {
      const existing = serviceAgg.get(p.serviceTypeName) || { delivered: 0, required: 0 };
      existing.delivered += p.deliveredMinutes;
      existing.required += p.requiredMinutes;
      serviceAgg.set(p.serviceTypeName, existing);
    }
    const complianceByService = [...serviceAgg.entries()].map(([name, { delivered, required }]) => ({
      service: name,
      delivered,
      required,
      compliance: required > 0 ? Math.round((delivered / required) * 100) : 0,
    }));

    const staffUtilization = await db
      .select({
        staffId: staffTable.id,
        staffName: sql<string>`${staffTable.firstName} || ' ' || ${staffTable.lastName}`,
        role: staffTable.role,
        totalMinutes: sql<number>`sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end)`,
        sessionCount: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'completed')`,
        missedCount: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'missed')`,
      })
      .from(sessionLogsTable)
      .where(sessionWhere)
      .innerJoin(staffTable, eq(sessionLogsTable.staffId, staffTable.id))
      .groupBy(staffTable.id, staffTable.firstName, staffTable.lastName, staffTable.role)
      .orderBy(desc(sql`sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end)`));

    const dayOfWeekPattern = await db
      .select({
        dayOfWeek: sql<number>`extract(isodow from ${sessionLogsTable.sessionDate}::date)::int`.as("dow"),
        totalMinutes: sql<number>`sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end)`,
        sessionCount: count(),
      })
      .from(sessionLogsTable)
      .where(sessionWhere)
      .groupBy(sql`extract(isodow from ${sessionLogsTable.sessionDate}::date)`)
      .orderBy(asc(sql`extract(isodow from ${sessionLogsTable.sessionDate}::date)`));

    const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    res.json({
      weeklyDelivery,
      byService,
      complianceByService,
      staffUtilization: staffUtilization.slice(0, 20),
      dayOfWeekPattern: dayOfWeekPattern.map(d => ({
        day: dayNames[d.dayOfWeek] || `Day ${d.dayOfWeek}`,
        totalMinutes: d.totalMinutes,
        sessionCount: d.sessionCount,
      })),
    });
  } catch (e: any) {
    console.error("analytics minutes-summary error:", e);
    res.status(500).json({ error: "Failed to fetch minutes summary" });
  }
});

router.get("/analytics/delivery-heatmap", async (_req, res): Promise<void> => {
  try {
    const heatmapData = await db
      .select({
        dayOfWeek: sql<number>`extract(isodow from ${sessionLogsTable.sessionDate}::date)::int`.as("dow"),
        hour: sql<number>`extract(hour from ${sessionLogsTable.startTime}::time)::int`.as("hr"),
        sessionCount: count(),
        totalMinutes: sql<number>`sum(${sessionLogsTable.durationMinutes})`,
      })
      .from(sessionLogsTable)
      .where(and(
        eq(sessionLogsTable.status, "completed"),
        sql`${sessionLogsTable.startTime} is not null`,
        isNull(sessionLogsTable.deletedAt)
      ))
      .groupBy(
        sql`extract(isodow from ${sessionLogsTable.sessionDate}::date)`,
        sql`extract(hour from ${sessionLogsTable.startTime}::time)`
      );

    const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const grid = heatmapData.map(d => ({
      day: dayNames[d.dayOfWeek] || `Day ${d.dayOfWeek}`,
      dayIndex: d.dayOfWeek,
      hour: d.hour,
      sessions: d.sessionCount,
      minutes: d.totalMinutes,
    }));

    res.json({ heatmap: grid });
  } catch (e: any) {
    console.error("analytics delivery-heatmap error:", e);
    res.status(500).json({ error: "Failed to fetch delivery heatmap" });
  }
});

export default router;
