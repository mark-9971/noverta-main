import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, sessionLogsTable, serviceTypesTable, staffTable, programsTable,
  serviceRequirementsTable
} from "@workspace/db";
import {
  GetStudentMinuteSummaryReportQueryParams,
  GetMissedSessionsReportQueryParams,
} from "@workspace/api-zod";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";

const router: IRouter = Router();

router.get("/reports/student-minute-summary", async (req, res): Promise<void> => {
  const params = GetStudentMinuteSummaryReportQueryParams.safeParse(req.query);
  const filters: any = {};
  if (params.success) {
    if (params.data.programId) filters.programId = Number(params.data.programId);
    if (params.data.riskStatus) filters.riskStatus = params.data.riskStatus;
  }

  const allProgress = await computeAllActiveMinuteProgress(filters.riskStatus ? { riskStatus: filters.riskStatus } : undefined);

  // Enrich with program info
  const studentIds = [...new Set(allProgress.map(p => p.studentId))];
  const students = studentIds.length > 0
    ? await db
        .select({
          id: studentsTable.id,
          grade: studentsTable.grade,
          programId: studentsTable.programId,
          programName: programsTable.name,
        })
        .from(studentsTable)
        .leftJoin(programsTable, eq(programsTable.id, studentsTable.programId))
        .where(undefined)
    : [];

  const studentMap = new Map(students.map(s => [s.id, s]));

  const rows = allProgress.map(p => {
    const student = studentMap.get(p.studentId);
    return {
      studentId: p.studentId,
      studentName: p.studentName,
      grade: student?.grade ?? null,
      programName: student?.programName ?? null,
      serviceTypeName: p.serviceTypeName,
      requiredMinutes: p.requiredMinutes,
      deliveredMinutes: p.deliveredMinutes,
      remainingMinutes: p.remainingMinutes,
      percentComplete: p.percentComplete,
      riskStatus: p.riskStatus,
    };
  });

  // Filter by program if specified
  const filtered = filters.programId
    ? rows.filter(r => {
        const student = studentMap.get(r.studentId);
        return student?.programId === filters.programId;
      })
    : rows;

  res.json(filtered);
});

router.get("/reports/missed-sessions", async (req, res): Promise<void> => {
  const params = GetMissedSessionsReportQueryParams.safeParse(req.query);
  const conditions: any[] = [eq(sessionLogsTable.status, "missed")];

  if (params.success) {
    if (params.data.dateFrom) conditions.push(gte(sessionLogsTable.sessionDate, params.data.dateFrom));
    if (params.data.dateTo) conditions.push(lte(sessionLogsTable.sessionDate, params.data.dateTo));
  }

  const sessions = await db
    .select({
      id: sessionLogsTable.id,
      studentId: sessionLogsTable.studentId,
      serviceRequirementId: sessionLogsTable.serviceRequirementId,
      serviceTypeId: sessionLogsTable.serviceTypeId,
      staffId: sessionLogsTable.staffId,
      sessionDate: sessionLogsTable.sessionDate,
      startTime: sessionLogsTable.startTime,
      endTime: sessionLogsTable.endTime,
      durationMinutes: sessionLogsTable.durationMinutes,
      location: sessionLogsTable.location,
      deliveryMode: sessionLogsTable.deliveryMode,
      status: sessionLogsTable.status,
      missedReasonId: sessionLogsTable.missedReasonId,
      isMakeup: sessionLogsTable.isMakeup,
      notes: sessionLogsTable.notes,
      createdAt: sessionLogsTable.createdAt,
      serviceTypeName: serviceTypesTable.name,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
      studentFirst: studentsTable.firstName,
      studentLast: studentsTable.lastName,
    })
    .from(sessionLogsTable)
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, sessionLogsTable.staffId))
    .leftJoin(studentsTable, eq(studentsTable.id, sessionLogsTable.studentId))
    .where(and(...conditions))
    .orderBy(desc(sessionLogsTable.sessionDate));

  res.json(sessions.map(s => ({
    ...s,
    studentName: s.studentFirst ? `${s.studentFirst} ${s.studentLast}` : null,
    serviceTypeName: s.serviceTypeName,
    staffName: s.staffFirst ? `${s.staffFirst} ${s.staffLast}` : null,
    createdAt: s.createdAt.toISOString(),
  })));
});

router.get("/reports/compliance-risk", async (req, res): Promise<void> => {
  const allProgress = await computeAllActiveMinuteProgress();
  const atRisk = allProgress.filter(p =>
    p.riskStatus === "at_risk" || p.riskStatus === "out_of_compliance" || p.riskStatus === "slightly_behind"
  );
  res.json(atRisk);
});

export default router;
