import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, sessionLogsTable, serviceTypesTable, staffTable, programsTable,
  serviceRequirementsTable, parentContactsTable, schoolsTable, iepDocumentsTable,
  alertsTable, missedReasonsTable
} from "@workspace/db";
import {
  GetStudentMinuteSummaryReportQueryParams,
  GetMissedSessionsReportQueryParams,
} from "@workspace/api-zod";
import { eq, and, gte, lte, desc, sql, count, asc } from "drizzle-orm";
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

router.get("/reports/compliance-trend", async (req, res): Promise<void> => {
  try {
    const { startDate, endDate, granularity, schoolId, districtId } = req.query;
    const gran = (granularity as string) || "weekly";
    const now = new Date();
    const defaultEnd = now.toISOString().split("T")[0];
    const defaultStart = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split("T")[0];
    const start = (startDate as string) || defaultStart;
    const end = (endDate as string) || defaultEnd;

    const studentConditions: any[] = [eq(studentsTable.status, "active")];
    if (schoolId) studentConditions.push(eq(studentsTable.schoolId, Number(schoolId)));
    if (districtId) studentConditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${Number(districtId)})`);

    const activeStudents = await db.select({
      id: studentsTable.id,
      schoolId: studentsTable.schoolId,
      schoolName: schoolsTable.name,
    })
      .from(studentsTable)
      .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(and(...studentConditions));

    const studentIds = activeStudents.map(s => s.id);
    if (studentIds.length === 0) {
      res.json({ trend: [], schools: [], semesterMarkers: [] });
      return;
    }

    const sessions = await db.select({
      studentId: sessionLogsTable.studentId,
      sessionDate: sessionLogsTable.sessionDate,
      durationMinutes: sessionLogsTable.durationMinutes,
      status: sessionLogsTable.status,
    })
      .from(sessionLogsTable)
      .where(and(
        gte(sessionLogsTable.sessionDate, start),
        lte(sessionLogsTable.sessionDate, end),
        sql`${sessionLogsTable.studentId} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`
      ));

    const requirements = await db.select({
      studentId: serviceRequirementsTable.studentId,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
    })
      .from(serviceRequirementsTable)
      .where(and(
        eq(serviceRequirementsTable.active, true),
        sql`${serviceRequirementsTable.studentId} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`
      ));

    function normalizeToPeriod(requiredMinutes: number, intervalType: string): number {
      if (gran === "monthly") {
        if (intervalType === "weekly") return requiredMinutes * 4;
        if (intervalType === "monthly") return requiredMinutes;
        if (intervalType === "quarterly") return Math.round(requiredMinutes / 3);
        return requiredMinutes * 4;
      }
      if (intervalType === "monthly") return Math.round(requiredMinutes / 4);
      if (intervalType === "quarterly") return Math.round(requiredMinutes / 13);
      return requiredMinutes;
    }

    const reqByStudent = new Map<number, number>();
    for (const r of requirements) {
      const periodMin = normalizeToPeriod(r.requiredMinutes, r.intervalType);
      reqByStudent.set(r.studentId, (reqByStudent.get(r.studentId) ?? 0) + periodMin);
    }

    const studentsWithReqs = new Set<number>();
    for (const [sid, req] of reqByStudent) {
      if (req > 0) studentsWithReqs.add(sid);
    }

    const schoolMap = new Map<number, string>();
    const studentSchool = new Map<number, number>();
    for (const s of activeStudents) {
      if (s.schoolId) {
        studentSchool.set(s.id, s.schoolId);
        if (s.schoolName) schoolMap.set(s.schoolId, s.schoolName);
      }
    }

    function periodKey(dateStr: string): string {
      const d = new Date(dateStr + "T12:00:00");
      if (gran === "monthly") {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      return monday.toISOString().split("T")[0];
    }

    type PeriodData = { delivered: Map<number, number>; total: number };
    const byPeriod = new Map<string, PeriodData>();
    const bySchoolPeriod = new Map<string, Map<string, PeriodData>>();

    for (const s of sessions) {
      if (s.status !== "completed" && s.status !== "makeup") continue;
      const pk = periodKey(s.sessionDate);
      if (!byPeriod.has(pk)) byPeriod.set(pk, { delivered: new Map(), total: 0 });
      const pd = byPeriod.get(pk)!;
      pd.delivered.set(s.studentId, (pd.delivered.get(s.studentId) ?? 0) + s.durationMinutes);
      pd.total += s.durationMinutes;

      const sid = studentSchool.get(s.studentId);
      if (sid !== undefined) {
        const schoolKey = String(sid);
        if (!bySchoolPeriod.has(schoolKey)) bySchoolPeriod.set(schoolKey, new Map());
        const schoolMap2 = bySchoolPeriod.get(schoolKey)!;
        if (!schoolMap2.has(pk)) schoolMap2.set(pk, { delivered: new Map(), total: 0 });
        const spd = schoolMap2.get(pk)!;
        spd.delivered.set(s.studentId, (spd.delivered.get(s.studentId) ?? 0) + s.durationMinutes);
        spd.total += s.durationMinutes;
      }
    }

    function calcCompliance(pd: PeriodData, studentPool: Set<number>): number {
      let onTrack = 0;
      let total = 0;
      for (const studentId of studentPool) {
        const req = reqByStudent.get(studentId) ?? 0;
        if (req <= 0) continue;
        total++;
        const delivered = pd.delivered.get(studentId) ?? 0;
        if (delivered >= req * 0.85) onTrack++;
      }
      return total > 0 ? Math.round((onTrack / total) * 100) : 100;
    }

    const schoolStudents = new Map<number, Set<number>>();
    for (const sid of studentsWithReqs) {
      const schoolId = studentSchool.get(sid);
      if (schoolId !== undefined) {
        if (!schoolStudents.has(schoolId)) schoolStudents.set(schoolId, new Set());
        schoolStudents.get(schoolId)!.add(sid);
      }
    }

    function getSemesterMarkers(startStr: string, endStr: string) {
      const markers: { date: string; label: string }[] = [];
      const startYear = new Date(startStr + "T12:00:00").getFullYear();
      const endYear = new Date(endStr + "T12:00:00").getFullYear();
      for (let y = startYear - 1; y <= endYear + 1; y++) {
        const sem1Start = `${y}-09-01`;
        const sem2Start = `${y + 1}-01-15`;
        const yearEnd = `${y + 1}-06-30`;
        if (sem1Start >= startStr && sem1Start <= endStr) {
          markers.push({ date: sem1Start, label: `Fall ${y}` });
        }
        if (sem2Start >= startStr && sem2Start <= endStr) {
          markers.push({ date: sem2Start, label: `Spring ${y + 1}` });
        }
        if (yearEnd >= startStr && yearEnd <= endStr) {
          markers.push({ date: yearEnd, label: `Year End ${y + 1}` });
        }
      }
      return markers;
    }

    const periods = [...byPeriod.keys()].sort();
    const trend = periods.map(pk => ({
      period: pk,
      compliancePercent: calcCompliance(byPeriod.get(pk)!, studentsWithReqs),
      totalDelivered: byPeriod.get(pk)!.total,
      studentsTracked: studentsWithReqs.size,
    }));

    const schools: { schoolId: number; schoolName: string; trend: typeof trend }[] = [];
    for (const [schoolIdStr, periodMap] of bySchoolPeriod) {
      const sid = Number(schoolIdStr);
      const pool = schoolStudents.get(sid) ?? new Set();
      const schoolTrend = periods.filter(pk => periodMap.has(pk)).map(pk => ({
        period: pk,
        compliancePercent: calcCompliance(periodMap.get(pk)!, pool),
        totalDelivered: periodMap.get(pk)!.total,
        studentsTracked: pool.size,
      }));
      schools.push({ schoolId: sid, schoolName: schoolMap.get(sid) ?? "Unknown", trend: schoolTrend });
    }

    const semesterMarkers = getSemesterMarkers(start, end);

    res.json({ trend, schools, semesterMarkers });
  } catch (e: any) {
    console.error("GET /reports/compliance-trend error:", e);
    res.status(500).json({ error: "Failed to generate compliance trend" });
  }
});

router.get("/reports/executive-summary", async (req, res): Promise<void> => {
  try {
    const { schoolId, districtId } = req.query;
    const filters: any = {};
    if (schoolId) filters.schoolId = Number(schoolId);
    if (districtId) filters.districtId = Number(districtId);

    const allProgress = await computeAllActiveMinuteProgress(filters);

    const studentConditions: any[] = [eq(studentsTable.status, "active")];
    if (schoolId) studentConditions.push(eq(studentsTable.schoolId, Number(schoolId)));
    if (districtId) studentConditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${Number(districtId)})`);

    const [activeResult] = await db.select({ count: count() }).from(studentsTable).where(and(...studentConditions));

    const studentRisk = new Map<number, string>();
    const riskPriority: Record<string, number> = {
      out_of_compliance: 4, at_risk: 3, slightly_behind: 2, on_track: 1, completed: 0,
    };
    for (const p of allProgress) {
      const current = studentRisk.get(p.studentId);
      if (!current || (riskPriority[p.riskStatus] ?? 0) > (riskPriority[current] ?? 0)) {
        studentRisk.set(p.studentId, p.riskStatus);
      }
    }

    const riskCounts = { onTrack: 0, slightlyBehind: 0, atRisk: 0, outOfCompliance: 0 };
    for (const [_, status] of studentRisk) {
      if (status === "on_track" || status === "completed") riskCounts.onTrack++;
      else if (status === "slightly_behind") riskCounts.slightlyBehind++;
      else if (status === "at_risk") riskCounts.atRisk++;
      else if (status === "out_of_compliance") riskCounts.outOfCompliance++;
    }

    const totalTracked = riskCounts.onTrack + riskCounts.slightlyBehind + riskCounts.atRisk + riskCounts.outOfCompliance;
    const complianceRate = totalTracked > 0 ? Math.round((riskCounts.onTrack / totalTracked) * 100) : 100;

    const totalDelivered = allProgress.reduce((s, p) => s + p.deliveredMinutes, 0);
    const totalRequired = allProgress.reduce((s, p) => s + p.requiredMinutes, 0);
    const totalMissed = allProgress.reduce((s, p) => s + p.missedSessionsCount, 0);
    const totalMakeup = allProgress.reduce((s, p) => s + p.makeupSessionsCount, 0);

    const serviceDelivery: Record<string, { delivered: number; required: number; students: Set<number> }> = {};
    for (const p of allProgress) {
      if (!serviceDelivery[p.serviceTypeName]) {
        serviceDelivery[p.serviceTypeName] = { delivered: 0, required: 0, students: new Set() };
      }
      serviceDelivery[p.serviceTypeName].delivered += p.deliveredMinutes;
      serviceDelivery[p.serviceTypeName].required += p.requiredMinutes;
      serviceDelivery[p.serviceTypeName].students.add(p.studentId);
    }
    const serviceBreakdown = Object.entries(serviceDelivery).map(([name, d]) => ({
      serviceTypeName: name,
      deliveredMinutes: d.delivered,
      requiredMinutes: d.required,
      percentComplete: d.required > 0 ? Math.round((d.delivered / d.required) * 100) : 100,
      studentCount: d.students.size,
    }));

    const iepConditions: any[] = [eq(iepDocumentsTable.active, true)];
    if (schoolId) iepConditions.push(sql`${iepDocumentsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${Number(schoolId)})`);
    if (districtId) iepConditions.push(sql`${iepDocumentsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${Number(districtId)}))`);

    const iepDocs = await db.select({
      iepEndDate: iepDocumentsTable.iepEndDate,
    }).from(iepDocumentsTable).where(and(...iepConditions));

    const todayMs = Date.now();
    const deadlines = { within30: 0, within60: 0, within90: 0, overdue: 0 };
    for (const doc of iepDocs) {
      const days = Math.ceil((new Date(doc.iepEndDate).getTime() - todayMs) / 86400000);
      if (days < 0) deadlines.overdue++;
      else if (days <= 30) deadlines.within30++;
      else if (days <= 60) deadlines.within60++;
      else if (days <= 90) deadlines.within90++;
    }

    const alertConditions: any[] = [eq(alertsTable.resolved, false)];
    if (schoolId) alertConditions.push(sql`${alertsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${Number(schoolId)})`);
    if (districtId) alertConditions.push(sql`${alertsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${Number(districtId)}))`);

    const [alertResult] = await db.select({
      total: count(),
      critical: sql<number>`count(*) filter (where ${alertsTable.severity} = 'critical')`,
    }).from(alertsTable).where(and(...alertConditions));

    res.json({
      generatedAt: new Date().toISOString(),
      totalActiveStudents: activeResult?.count ?? 0,
      complianceRate,
      riskCounts,
      serviceDelivery: {
        totalDeliveredMinutes: totalDelivered,
        totalRequiredMinutes: totalRequired,
        overallPercent: totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 100) : 100,
        totalMissedSessions: totalMissed,
        totalMakeupSessions: totalMakeup,
        byService: serviceBreakdown,
      },
      iepDeadlines: deadlines,
      alerts: {
        openAlerts: alertResult?.total ?? 0,
        criticalAlerts: alertResult?.critical ?? 0,
      },
    });
  } catch (e: any) {
    console.error("GET /reports/executive-summary error:", e);
    res.status(500).json({ error: "Failed to generate executive summary" });
  }
});

router.get("/reports/audit-package", async (req, res): Promise<void> => {
  try {
    const { startDate, endDate, schoolId, districtId, studentId } = req.query;
    const now = new Date();
    const defaultEnd = now.toISOString().split("T")[0];
    const defaultStart = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split("T")[0];
    const start = (startDate as string) || defaultStart;
    const end = (endDate as string) || defaultEnd;

    const studentConditions: any[] = [eq(studentsTable.status, "active")];
    if (schoolId) studentConditions.push(eq(studentsTable.schoolId, Number(schoolId)));
    if (districtId) studentConditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${Number(districtId)})`);
    if (studentId) studentConditions.push(eq(studentsTable.id, Number(studentId)));

    const students = await db.select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
      schoolId: studentsTable.schoolId,
      schoolName: schoolsTable.name,
    })
      .from(studentsTable)
      .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(and(...studentConditions))
      .orderBy(asc(studentsTable.lastName), asc(studentsTable.firstName));

    if (students.length === 0) {
      res.json({ generatedAt: new Date().toISOString(), dateRange: { start, end }, students: [] });
      return;
    }

    const sIds = students.map(s => s.id);

    const [reqs, sessions, contacts] = await Promise.all([
      db.select({
        id: serviceRequirementsTable.id,
        studentId: serviceRequirementsTable.studentId,
        serviceTypeName: serviceTypesTable.name,
        requiredMinutes: serviceRequirementsTable.requiredMinutes,
        intervalType: serviceRequirementsTable.intervalType,
        startDate: serviceRequirementsTable.startDate,
        endDate: serviceRequirementsTable.endDate,
        active: serviceRequirementsTable.active,
        providerFirstName: staffTable.firstName,
        providerLastName: staffTable.lastName,
      })
        .from(serviceRequirementsTable)
        .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
        .leftJoin(staffTable, eq(staffTable.id, serviceRequirementsTable.providerId))
        .where(sql`${serviceRequirementsTable.studentId} IN (${sql.join(sIds.map(id => sql`${id}`), sql`, `)})`),

      db.select({
        id: sessionLogsTable.id,
        studentId: sessionLogsTable.studentId,
        serviceRequirementId: sessionLogsTable.serviceRequirementId,
        sessionDate: sessionLogsTable.sessionDate,
        durationMinutes: sessionLogsTable.durationMinutes,
        status: sessionLogsTable.status,
        isMakeup: sessionLogsTable.isMakeup,
        notes: sessionLogsTable.notes,
        serviceTypeName: serviceTypesTable.name,
        staffFirstName: staffTable.firstName,
        staffLastName: staffTable.lastName,
        missedReason: missedReasonsTable.label,
        missedReasonCategory: missedReasonsTable.category,
      })
        .from(sessionLogsTable)
        .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
        .leftJoin(staffTable, eq(staffTable.id, sessionLogsTable.staffId))
        .leftJoin(missedReasonsTable, eq(missedReasonsTable.id, sessionLogsTable.missedReasonId))
        .where(and(
          sql`${sessionLogsTable.studentId} IN (${sql.join(sIds.map(id => sql`${id}`), sql`, `)})`,
          gte(sessionLogsTable.sessionDate, start),
          lte(sessionLogsTable.sessionDate, end)
        ))
        .orderBy(asc(sessionLogsTable.sessionDate)),

      db.select({
        id: parentContactsTable.id,
        studentId: parentContactsTable.studentId,
        contactType: parentContactsTable.contactType,
        contactDate: parentContactsTable.contactDate,
        contactMethod: parentContactsTable.contactMethod,
        subject: parentContactsTable.subject,
        notes: parentContactsTable.notes,
        outcome: parentContactsTable.outcome,
        parentName: parentContactsTable.parentName,
        contactedBy: parentContactsTable.contactedBy,
      })
        .from(parentContactsTable)
        .where(and(
          sql`${parentContactsTable.studentId} IN (${sql.join(sIds.map(id => sql`${id}`), sql`, `)})`,
          gte(parentContactsTable.contactDate, start),
          lte(parentContactsTable.contactDate, end)
        ))
        .orderBy(asc(parentContactsTable.contactDate)),
    ]);

    const reqsByStudent = new Map<number, typeof reqs>();
    for (const r of reqs) {
      if (!reqsByStudent.has(r.studentId)) reqsByStudent.set(r.studentId, []);
      reqsByStudent.get(r.studentId)!.push(r);
    }
    const sessionsByStudent = new Map<number, typeof sessions>();
    for (const s of sessions) {
      if (!sessionsByStudent.has(s.studentId)) sessionsByStudent.set(s.studentId, []);
      sessionsByStudent.get(s.studentId)!.push(s);
    }
    const contactsByStudent = new Map<number, typeof contacts>();
    for (const c of contacts) {
      if (!contactsByStudent.has(c.studentId)) contactsByStudent.set(c.studentId, []);
      contactsByStudent.get(c.studentId)!.push(c);
    }

    const result = students.map(student => {
      const sReqs = reqsByStudent.get(student.id) ?? [];
      const sSessions = sessionsByStudent.get(student.id) ?? [];
      const sContacts = contactsByStudent.get(student.id) ?? [];

      const completedSessions = sSessions.filter(s => s.status === "completed" || s.status === "makeup");
      const missedSessions = sSessions.filter(s => s.status === "missed");
      const makeupSessions = sSessions.filter(s => s.isMakeup);

      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        grade: student.grade,
        school: student.schoolName,
        serviceRequirements: sReqs.map(r => ({
          serviceTypeName: r.serviceTypeName,
          requiredMinutes: r.requiredMinutes,
          intervalType: r.intervalType,
          startDate: r.startDate,
          endDate: r.endDate,
          active: r.active,
          provider: r.providerFirstName ? `${r.providerFirstName} ${r.providerLastName}` : null,
        })),
        sessionSummary: {
          totalCompleted: completedSessions.length,
          totalMissed: missedSessions.length,
          totalMakeup: makeupSessions.length,
          deliveredMinutes: completedSessions.reduce((s, sess) => s + sess.durationMinutes, 0),
        },
        sessions: sSessions.map(s => ({
          date: s.sessionDate,
          service: s.serviceTypeName,
          duration: s.durationMinutes,
          status: s.status,
          isMakeup: s.isMakeup,
          provider: s.staffFirstName ? `${s.staffFirstName} ${s.staffLastName}` : null,
          notes: s.notes,
          missedReason: s.missedReason ?? null,
          missedReasonCategory: s.missedReasonCategory ?? null,
        })),
        parentContacts: sContacts.map(c => ({
          date: c.contactDate,
          type: c.contactType,
          method: c.contactMethod,
          subject: c.subject,
          outcome: c.outcome,
          parentName: c.parentName,
          contactedBy: c.contactedBy,
        })),
      };
    });

    res.json({
      generatedAt: new Date().toISOString(),
      dateRange: { start, end },
      students: result,
    });
  } catch (e: any) {
    console.error("GET /reports/audit-package error:", e);
    res.status(500).json({ error: "Failed to generate audit package" });
  }
});

export default router;
