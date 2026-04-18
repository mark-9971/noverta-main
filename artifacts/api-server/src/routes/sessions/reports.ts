// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  sessionLogsTable, serviceTypesTable, staffTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, isNull, asc } from "drizzle-orm";
import { assertStudentInCallerDistrict } from "../../lib/districtScope";
import type { AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

router.get("/students/:studentId/minutes-trend", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, studentId, res))) return;
    const { from, to } = req.query;

    const conditions: any[] = [
      eq(sessionLogsTable.studentId, studentId),
      eq(sessionLogsTable.status, "completed"),
      isNull(sessionLogsTable.deletedAt),
    ];
    if (from) conditions.push(gte(sessionLogsTable.sessionDate, from as string));
    if (to) conditions.push(lte(sessionLogsTable.sessionDate, to as string));

    const rows = await db.select({
      sessionDate: sessionLogsTable.sessionDate,
      durationMinutes: sessionLogsTable.durationMinutes,
      serviceTypeName: serviceTypesTable.name,
      serviceTypeId: sessionLogsTable.serviceTypeId,
      staffId: sessionLogsTable.staffId,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
    })
      .from(sessionLogsTable)
      .innerJoin(serviceTypesTable, eq(sessionLogsTable.serviceTypeId, serviceTypesTable.id))
      .leftJoin(staffTable, eq(sessionLogsTable.staffId, staffTable.id))
      .where(and(...conditions))
      .orderBy(asc(sessionLogsTable.sessionDate));

    const data = rows.map((r) => ({
      date: r.sessionDate,
      value: r.durationMinutes ?? 0,
      serviceTypeName: r.serviceTypeName,
      serviceTypeId: r.serviceTypeId,
      staffId: r.staffId,
      staffName: r.staffFirst && r.staffLast ? `${r.staffFirst} ${r.staffLast}` : null,
    }));

    res.json(data);
  } catch (e: any) {
    console.error("GET minutes-trend error:", e);
    res.status(500).json({ error: "Failed to fetch minutes trend" });
  }
});

export default router;
