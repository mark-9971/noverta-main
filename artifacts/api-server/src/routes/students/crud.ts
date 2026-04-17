import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, schoolsTable, programsTable, staffTable,
  serviceRequirementsTable, serviceTypesTable, sessionLogsTable,
  alertsTable, staffAssignmentsTable,
} from "@workspace/db";
import {
  ListStudentsQueryParams,
  CreateStudentBody,
  GetStudentParams,
  UpdateStudentParams,
  UpdateStudentBody,
  GetStudentMinuteProgressParams,
  GetStudentSessionsParams,
  GetStudentSessionsQueryParams,
  GetStudentAlertsParams,
} from "@workspace/api-zod";
import { eq, and, ilike, or, desc, sql, isNull } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";
import { logAudit, diffObjects } from "../../lib/auditLog";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";
import { studentIdParamGuard } from "./idGuard";

const router: IRouter = Router();
router.param("id", studentIdParamGuard);

router.get("/students", async (req, res): Promise<void> => {
  const params = ListStudentsQueryParams.safeParse(req.query);

  let query = db
    .select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      externalId: studentsTable.externalId,
      grade: studentsTable.grade,
      placementType: studentsTable.placementType,
      status: studentsTable.status,
      schoolId: studentsTable.schoolId,
      programId: studentsTable.programId,
      caseManagerId: studentsTable.caseManagerId,
      enrolledAt: studentsTable.enrolledAt,
      withdrawnAt: studentsTable.withdrawnAt,
      schoolName: schoolsTable.name,
      programName: programsTable.name,
      caseManagerFirst: staffTable.firstName,
      caseManagerLast: staffTable.lastName,
    })
    .from(studentsTable)
    .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .leftJoin(programsTable, eq(programsTable.id, studentsTable.programId))
    .leftJoin(staffTable, eq(staffTable.id, studentsTable.caseManagerId));

  const conditions: any[] = [isNull(studentsTable.deletedAt), eq(studentsTable.status, "active")];
  if (params.success) {
    const statusValue = params.data.status ?? "active";
    if (statusValue === "all") {
      conditions.splice(1, 1);
    } else {
      conditions[1] = eq(studentsTable.status, statusValue);
    }
    if (params.data.programId) conditions.push(eq(studentsTable.programId, Number(params.data.programId)));
    if (params.data.schoolId) conditions.push(eq(studentsTable.schoolId, Number(params.data.schoolId)));
    {
      const enforcedDid = getEnforcedDistrictId(req as AuthedRequest);
      if (enforcedDid !== null) {
        conditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${enforcedDid})`);
      } else if (params.data.districtId) {
        conditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${Number(params.data.districtId)})`);
      }
    }
    if (params.data.caseManagerId) conditions.push(eq(studentsTable.caseManagerId, Number(params.data.caseManagerId)));
    if (params.data.grade) conditions.push(eq(studentsTable.grade, params.data.grade));
    if ((params.data as any).type === "sped") {
      conditions.push(sql`EXISTS (SELECT 1 FROM service_requirements WHERE student_id = ${studentsTable.id})`);
    } else if ((params.data as any).type === "gen_ed") {
      conditions.push(sql`NOT EXISTS (SELECT 1 FROM service_requirements WHERE student_id = ${studentsTable.id})`);
    }
    if (params.data.search) {
      const searchTerm = `%${params.data.search}%`;
      conditions.push(
        or(
          ilike(studentsTable.firstName, searchTerm),
          ilike(studentsTable.lastName, searchTerm),
          ilike(studentsTable.externalId, searchTerm)
        )
      );
    }
  }

  const rawSchoolYearId = req.query.schoolYearId;
  if (rawSchoolYearId) {
    conditions.push(sql`(
      EXISTS (
        SELECT 1 FROM iep_documents
        WHERE student_id = ${studentsTable.id}
          AND active = true
          AND iep_end_date >= (SELECT start_date FROM school_years WHERE id = ${Number(rawSchoolYearId)})
      )
      OR EXISTS (
        SELECT 1 FROM session_logs
        WHERE student_id = ${studentsTable.id}
          AND school_year_id = ${Number(rawSchoolYearId)}
      )
    )`);
  }

  const pageLimit = (params.success && params.data.limit) ? Math.min(Number(params.data.limit), 500) : 100;
  const pageOffset = (params.success && params.data.offset) ? Number(params.data.offset) : 0;

  const students = conditions.length > 0
    ? await query.where(and(...conditions)).orderBy(studentsTable.lastName).limit(pageLimit).offset(pageOffset)
    : await query.orderBy(studentsTable.lastName).limit(pageLimit).offset(pageOffset);

  const studentIds = students.map((s: any) => s.id);

  const allProgress = studentIds.length > 0
    ? await computeAllActiveMinuteProgress({ studentIds })
    : [];
  const progressByStudent = new Map<number, typeof allProgress>();
  for (const p of allProgress) {
    if (!progressByStudent.has(p.studentId)) progressByStudent.set(p.studentId, []);
    progressByStudent.get(p.studentId)!.push(p);
  }

  const enriched = students.map((s: any) => {
    const prog = progressByStudent.get(s.id) ?? [];
    const onTrackCount = prog.filter((p: any) => p.riskStatus === "on_track" || p.riskStatus === "completed").length;
    const atRiskCount = prog.filter((p: any) => p.riskStatus === "at_risk").length;
    const behindCount = prog.filter((p: any) => p.riskStatus === "out_of_compliance" || p.riskStatus === "slightly_behind").length;

    let riskStatus: string | null = null;
    if (prog.some((p: any) => p.riskStatus === "out_of_compliance")) riskStatus = "out_of_compliance";
    else if (prog.some((p: any) => p.riskStatus === "at_risk")) riskStatus = "at_risk";
    else if (prog.some((p: any) => p.riskStatus === "slightly_behind")) riskStatus = "slightly_behind";
    else if (prog.length > 0) riskStatus = "on_track";

    return {
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      externalId: s.externalId,
      grade: s.grade,
      placementType: s.placementType,
      status: s.status,
      schoolId: s.schoolId,
      programId: s.programId,
      caseManagerId: s.caseManagerId,
      enrolledAt: s.enrolledAt,
      withdrawnAt: s.withdrawnAt,
      schoolName: s.schoolName,
      programName: s.programName,
      caseManagerName: s.caseManagerFirst ? `${s.caseManagerFirst} ${s.caseManagerLast}` : null,
      riskStatus,
      activeRequirementsCount: prog.length,
      onTrackCount,
      atRiskCount,
      behindCount,
    };
  });

  const finalResult = params.success && params.data.riskStatus
    ? enriched.filter((s: any) => s.riskStatus === params.data.riskStatus)
    : enriched;

  res.json(finalResult);
});

router.post("/students", async (req, res): Promise<void> => {
  const parsed = CreateStudentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  {
    const enforcedDistrictId = getEnforcedDistrictId(req as AuthedRequest);
    const schoolId = Number(parsed.data.schoolId ?? 0);
    if (enforcedDistrictId !== null && schoolId > 0) {
      const rows = await db.execute(sql`
        SELECT 1 FROM schools
        WHERE id = ${schoolId}
          AND district_id = ${enforcedDistrictId}
      `);
      if (!rows.rows.length) {
        res.status(403).json({ error: "School does not belong to your district" });
        return;
      }
    }
  }
  const [student] = await db.insert(studentsTable).values(parsed.data).returning();
  logAudit(req, {
    action: "create",
    targetTable: "students",
    targetId: student.id,
    studentId: student.id,
    summary: `Created student ${student.firstName} ${student.lastName}`,
    newValues: parsed.data as Record<string, unknown>,
  });
  res.status(201).json({ ...student, createdAt: student.createdAt.toISOString(), updatedAt: student.updatedAt.toISOString() });
});

router.get("/sped-students", async (req, res): Promise<void> => {
  const conditions: any[] = [eq(studentsTable.status, "active"), isNull(studentsTable.deletedAt)];
  if (req.query.schoolId) conditions.push(eq(studentsTable.schoolId, Number(req.query.schoolId)));
  {
    const enforcedDid = getEnforcedDistrictId(req as AuthedRequest);
    if (enforcedDid !== null) {
      conditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${enforcedDid})`);
    } else if (req.query.districtId) {
      conditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${Number(req.query.districtId)})`);
    }
  }

  const students = await db.selectDistinct({
    id: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
    grade: studentsTable.grade,
    programName: programsTable.name,
    caseManagerFirst: staffTable.firstName,
    caseManagerLast: staffTable.lastName,
  }).from(studentsTable)
    .innerJoin(serviceRequirementsTable, eq(serviceRequirementsTable.studentId, studentsTable.id))
    .leftJoin(programsTable, eq(studentsTable.programId, programsTable.id))
    .leftJoin(staffTable, eq(studentsTable.caseManagerId, staffTable.id))
    .where(and(...conditions))
    .orderBy(studentsTable.lastName, studentsTable.firstName);

  res.json(students);
});

router.get("/students/:id", async (req, res): Promise<void> => {
  const params = GetStudentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [student] = await db
    .select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      externalId: studentsTable.externalId,
      grade: studentsTable.grade,
      placementType: studentsTable.placementType,
      status: studentsTable.status,
      schoolId: studentsTable.schoolId,
      programId: studentsTable.programId,
      caseManagerId: studentsTable.caseManagerId,
      notes: studentsTable.notes,
      tags: studentsTable.tags,
      medicaidId: studentsTable.medicaidId,
      enrolledAt: studentsTable.enrolledAt,
      withdrawnAt: studentsTable.withdrawnAt,
      createdAt: studentsTable.createdAt,
      updatedAt: studentsTable.updatedAt,
      schoolName: schoolsTable.name,
      programName: programsTable.name,
      caseManagerFirst: staffTable.firstName,
      caseManagerLast: staffTable.lastName,
    })
    .from(studentsTable)
    .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .leftJoin(programsTable, eq(programsTable.id, studentsTable.programId))
    .leftJoin(staffTable, eq(staffTable.id, studentsTable.caseManagerId))
    .where(and(eq(studentsTable.id, params.data.id), isNull(studentsTable.deletedAt)));

  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const reqs = await db
    .select({
      id: serviceRequirementsTable.id,
      studentId: serviceRequirementsTable.studentId,
      serviceTypeId: serviceRequirementsTable.serviceTypeId,
      providerId: serviceRequirementsTable.providerId,
      deliveryType: serviceRequirementsTable.deliveryType,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
      startDate: serviceRequirementsTable.startDate,
      endDate: serviceRequirementsTable.endDate,
      priority: serviceRequirementsTable.priority,
      notes: serviceRequirementsTable.notes,
      active: serviceRequirementsTable.active,
      createdAt: serviceRequirementsTable.createdAt,
      serviceTypeName: serviceTypesTable.name,
      providerFirst: staffTable.firstName,
      providerLast: staffTable.lastName,
    })
    .from(serviceRequirementsTable)
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, serviceRequirementsTable.providerId))
    .where(eq(serviceRequirementsTable.studentId, params.data.id));

  const minuteProgress = await computeAllActiveMinuteProgress({ studentId: params.data.id });

  const recentSessions = await db
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
    })
    .from(sessionLogsTable)
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, sessionLogsTable.staffId))
    .where(and(eq(sessionLogsTable.studentId, params.data.id), isNull(sessionLogsTable.deletedAt)))
    .orderBy(desc(sessionLogsTable.sessionDate))
    .limit(20);

  const activeAlerts = await db
    .select()
    .from(alertsTable)
    .where(and(eq(alertsTable.studentId, params.data.id), eq(alertsTable.resolved, false)));

  const assignments = await db
    .select({
      id: staffAssignmentsTable.id,
      staffId: staffAssignmentsTable.staffId,
      studentId: staffAssignmentsTable.studentId,
      assignmentType: staffAssignmentsTable.assignmentType,
      startDate: staffAssignmentsTable.startDate,
      endDate: staffAssignmentsTable.endDate,
      notes: staffAssignmentsTable.notes,
      createdAt: staffAssignmentsTable.createdAt,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
      staffRole: staffTable.role,
    })
    .from(staffAssignmentsTable)
    .leftJoin(staffTable, eq(staffTable.id, staffAssignmentsTable.staffId))
    .where(eq(staffAssignmentsTable.studentId, params.data.id));

  res.json({
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    externalId: student.externalId,
    grade: student.grade,
    placementType: student.placementType,
    status: student.status,
    schoolId: student.schoolId,
    programId: student.programId,
    caseManagerId: student.caseManagerId,
    enrolledAt: student.enrolledAt,
    withdrawnAt: student.withdrawnAt,
    notes: student.notes,
    tags: student.tags,
    medicaidId: student.medicaidId,
    schoolName: student.schoolName,
    programName: student.programName,
    caseManagerName: student.caseManagerFirst ? `${student.caseManagerFirst} ${student.caseManagerLast}` : null,
    createdAt: student.createdAt.toISOString(),
    updatedAt: student.updatedAt.toISOString(),
    serviceRequirements: reqs.map(r => ({
      ...r,
      serviceTypeName: r.serviceTypeName,
      providerName: r.providerFirst ? `${r.providerFirst} ${r.providerLast}` : null,
      createdAt: r.createdAt.toISOString(),
    })),
    minuteProgress: minuteProgress.filter(Boolean),
    recentSessions: recentSessions.map(s => ({
      ...s,
      studentName: `${student.firstName} ${student.lastName}`,
      serviceTypeName: s.serviceTypeName,
      staffName: s.staffFirst ? `${s.staffFirst} ${s.staffLast}` : null,
      createdAt: s.createdAt.toISOString(),
    })),
    activeAlerts: activeAlerts.map(a => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      resolvedAt: a.resolvedAt?.toISOString() ?? null,
    })),
    assignedStaff: assignments.map(a => ({
      id: a.id,
      staffId: a.staffId,
      studentId: a.studentId,
      assignmentType: a.assignmentType,
      startDate: a.startDate,
      endDate: a.endDate,
      notes: a.notes,
      createdAt: a.createdAt.toISOString(),
      staffName: a.staffFirst ? `${a.staffFirst} ${a.staffLast}` : null,
      staffRole: a.staffRole,
      studentName: `${student.firstName} ${student.lastName}`,
    })),
  });

  logAudit(req, {
    action: "read",
    targetTable: "students",
    targetId: student.id,
    studentId: student.id,
    summary: `Viewed student detail: ${student.firstName} ${student.lastName}`,
  });
});

router.patch("/students/:id", async (req, res): Promise<void> => {
  const params = UpdateStudentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateStudentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existingStudent] = await db.select({
    sisManaged: studentsTable.sisManaged,
    sisConnectionId: studentsTable.sisConnectionId,
  }).from(studentsTable).where(eq(studentsTable.id, params.data.id));

  const isSisManaged = existingStudent?.sisManaged === "true";

  const SIS_PROTECTED_FIELDS = ["firstName", "lastName", "externalId", "grade", "dateOfBirth", "disabilityCategory", "primaryLanguage", "parentGuardianName", "parentEmail", "parentPhone", "status"] as const;

  if (isSisManaged) {
    const attemptedSisFields = SIS_PROTECTED_FIELDS.filter((f) => (parsed.data as Record<string, unknown>)[f] !== undefined);
    if (attemptedSisFields.length > 0) {
      res.status(403).json({
        error: "Cannot edit SIS-managed fields",
        sisProtectedFields: attemptedSisFields,
        message: `Fields [${attemptedSisFields.join(", ")}] are managed by SIS and cannot be edited directly. Update them in your Student Information System instead.`,
      });
      return;
    }
  }

  const updateData: Partial<typeof studentsTable.$inferInsert> = {};
  if (parsed.data.firstName != null) updateData.firstName = parsed.data.firstName;
  if (parsed.data.lastName != null) updateData.lastName = parsed.data.lastName;
  if (parsed.data.externalId !== undefined) updateData.externalId = parsed.data.externalId;
  if (parsed.data.grade !== undefined) updateData.grade = parsed.data.grade;
  if (parsed.data.placementType !== undefined) updateData.placementType = parsed.data.placementType;
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.schoolId !== undefined) updateData.schoolId = parsed.data.schoolId;
  if (parsed.data.programId !== undefined) updateData.programId = parsed.data.programId;
  if (parsed.data.caseManagerId !== undefined) updateData.caseManagerId = parsed.data.caseManagerId;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.tags !== undefined) updateData.tags = parsed.data.tags;
  if (parsed.data.medicaidId !== undefined) updateData.medicaidId = parsed.data.medicaidId;

  const [oldStudent] = await db.select().from(studentsTable).where(eq(studentsTable.id, params.data.id));
  const [student] = await db.update(studentsTable).set(updateData).where(eq(studentsTable.id, params.data.id)).returning();
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  if (oldStudent) {
    const changes = diffObjects(oldStudent as Record<string, unknown>, student as Record<string, unknown>);
    if (changes) {
      logAudit(req, {
        action: "update",
        targetTable: "students",
        targetId: student.id,
        studentId: student.id,
        summary: `Updated student ${student.firstName} ${student.lastName}`,
        oldValues: changes.old,
        newValues: changes.new,
      });
    }
  }
  res.json({ ...student, createdAt: student.createdAt.toISOString(), updatedAt: student.updatedAt.toISOString() });
});

router.get("/students/:id/minute-progress", async (req, res): Promise<void> => {
  const params = GetStudentMinuteProgressParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const progress = await computeAllActiveMinuteProgress({ studentId: params.data.id });
  res.json(progress);
});

router.get("/students/:id/sessions", async (req, res): Promise<void> => {
  const params = GetStudentSessionsParams.safeParse(req.params);
  const queryParams = GetStudentSessionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const limit = queryParams.success && queryParams.data.limit ? Number(queryParams.data.limit) : 50;

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
    .where(and(eq(sessionLogsTable.studentId, params.data.id), isNull(sessionLogsTable.deletedAt)))
    .orderBy(desc(sessionLogsTable.sessionDate))
    .limit(limit);

  res.json(sessions.map(s => ({
    ...s,
    studentName: s.studentFirst ? `${s.studentFirst} ${s.studentLast}` : null,
    serviceTypeName: s.serviceTypeName,
    staffName: s.staffFirst ? `${s.staffFirst} ${s.staffLast}` : null,
    createdAt: s.createdAt.toISOString(),
  })));
});

router.get("/students/:id/alerts", async (req, res): Promise<void> => {
  const params = GetStudentAlertsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const alerts = await db
    .select()
    .from(alertsTable)
    .where(and(eq(alertsTable.studentId, params.data.id), eq(alertsTable.resolved, false)))
    .orderBy(desc(alertsTable.createdAt));

  res.json(alerts.map(a => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
  })));
});

router.delete("/students/:id", async (req, res): Promise<void> => {
  const params = GetStudentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [updated] = await db
    .update(studentsTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(studentsTable.id, params.data.id), isNull(studentsTable.deletedAt)))
    .returning({ id: studentsTable.id });
  if (!updated) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  logAudit(req, {
    action: "delete",
    targetTable: "students",
    targetId: params.data.id,
    studentId: params.data.id,
    summary: `Soft-deleted student #${params.data.id}`,
  });

  res.json({ success: true });
});

export default router;
