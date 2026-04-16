import { Router, type IRouter, type Request, type Response } from "express";
import { db, restraintIncidentsTable, studentsTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql, inArray } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

router.get("/protective-measures/incidents", async (req: Request, res: Response) => {
  const { studentId, status, incidentType, startDate, endDate } = req.query;

  const districtId = getEnforcedDistrictId(req as AuthedRequest);

  const conditions: any[] = [];

  if (districtId !== null) {
    conditions.push(
      sql`${restraintIncidentsTable.studentId} IN (
        SELECT s.id FROM students s
        JOIN schools sc ON s.school_id = sc.id
        WHERE sc.district_id = ${districtId}
      )`
    );
  }

  if (studentId) conditions.push(eq(restraintIncidentsTable.studentId, Number(studentId)));
  if (status && status !== "all") {
    if (String(status) === "notification_pending") {
      conditions.push(inArray(restraintIncidentsTable.status, ["under_review", "resolved"]));
      conditions.push(sql`${restraintIncidentsTable.parentNotificationSentAt} IS NULL`);
    } else if (String(status) === "draft") {
      conditions.push(inArray(restraintIncidentsTable.status, ["draft", "draft_quick"]));
    } else {
      conditions.push(eq(restraintIncidentsTable.status, String(status)));
    }
  }
  if (incidentType && incidentType !== "all") conditions.push(eq(restraintIncidentsTable.incidentType, String(incidentType)));
  if (startDate) conditions.push(gte(restraintIncidentsTable.incidentDate, String(startDate)));
  if (endDate) conditions.push(lte(restraintIncidentsTable.incidentDate, String(endDate)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const incidents = await db
    .select({
      id: restraintIncidentsTable.id,
      studentId: restraintIncidentsTable.studentId,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      studentGrade: studentsTable.grade,
      incidentDate: restraintIncidentsTable.incidentDate,
      incidentTime: restraintIncidentsTable.incidentTime,
      endTime: restraintIncidentsTable.endTime,
      durationMinutes: restraintIncidentsTable.durationMinutes,
      incidentType: restraintIncidentsTable.incidentType,
      location: restraintIncidentsTable.location,
      behaviorDescription: restraintIncidentsTable.behaviorDescription,
      restraintType: restraintIncidentsTable.restraintType,
      primaryStaffId: restraintIncidentsTable.primaryStaffId,
      studentInjury: restraintIncidentsTable.studentInjury,
      staffInjury: restraintIncidentsTable.staffInjury,
      medicalAttentionRequired: restraintIncidentsTable.medicalAttentionRequired,
      parentNotified: restraintIncidentsTable.parentNotified,
      parentNotifiedAt: restraintIncidentsTable.parentNotifiedAt,
      parentVerbalNotification: restraintIncidentsTable.parentVerbalNotification,
      writtenReportSent: restraintIncidentsTable.writtenReportSent,
      adminReviewedBy: restraintIncidentsTable.adminReviewedBy,
      adminReviewedAt: restraintIncidentsTable.adminReviewedAt,
      deseReportRequired: restraintIncidentsTable.deseReportRequired,
      deseReportSentAt: restraintIncidentsTable.deseReportSentAt,
      status: restraintIncidentsTable.status,
      createdAt: restraintIncidentsTable.createdAt,
    })
    .from(restraintIncidentsTable)
    .leftJoin(studentsTable, eq(restraintIncidentsTable.studentId, studentsTable.id))
    .where(where)
    .orderBy(desc(restraintIncidentsTable.incidentDate), desc(restraintIncidentsTable.incidentTime));

  logAudit(req, {
    action: "read",
    targetTable: "restraint_incidents",
    studentId: studentId ? Number(studentId) : undefined,
    summary: `Viewed ${incidents.length} restraint incidents${studentId ? ` for student #${studentId}` : ""}`,
  });
  res.json(incidents);
});

router.get("/students/:id/protective-measures", async (req: Request, res: Response) => {
  const studentId = Number(req.params.id);
  if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }

  const incidents = await db
    .select()
    .from(restraintIncidentsTable)
    .where(eq(restraintIncidentsTable.studentId, studentId))
    .orderBy(desc(restraintIncidentsTable.incidentDate));

  const summary = {
    totalIncidents: incidents.length,
    thisMonth: incidents.filter(i => i.incidentDate >= new Date().toISOString().substring(0, 8) + "01").length,
    pendingReview: incidents.filter(i => i.status === "open").length,
    withInjuries: incidents.filter(i => i.studentInjury || i.staffInjury).length,
    deseReportsPending: incidents.filter(i => i.deseReportRequired && !i.deseReportSentAt).length,
  };

  logAudit(req, {
    action: "read",
    targetTable: "restraint_incidents",
    studentId: studentId,
    summary: `Viewed ${incidents.length} protective measures for student #${studentId}`,
  });
  res.json({ incidents, summary });
});

export default router;
