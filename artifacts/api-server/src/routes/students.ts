import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, schoolsTable, programsTable, staffTable,
  serviceRequirementsTable, serviceTypesTable, sessionLogsTable,
  alertsTable, staffAssignmentsTable, enrollmentEventsTable,
  emergencyContactsTable, medicalAlertsTable,
  MEDICAL_ALERT_TYPES, MEDICAL_ALERT_SEVERITIES,
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
import { eq, and, ilike, or, desc, asc, sql, isNull, gte, lte, inArray } from "drizzle-orm";
import {
  iepGoalsTable, iepDocumentsTable, iepAccommodationsTable,
  restraintIncidentsTable, programTargetsTable, behaviorTargetsTable,
  programDataTable, behaviorDataTable, dataSessionsTable,
} from "@workspace/db";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";
import { logAudit, diffObjects } from "../lib/auditLog";
import { getPublicMeta } from "../lib/clerkClaims";
import { assertStudentAccess } from "../lib/tenantAccess";
import { getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";

const router: IRouter = Router();

/**
 * Tenant ownership guard for all /:id routes in this router.
 * Three cases, determined by the request path:
 *   /students/:id         → :id is a student — verify district via school→district
 *   /emergency-contacts/:id → :id is a contact — verify via contact→student→district
 *   /medical-alerts/:id   → :id is an alert — verify via alert→student→district
 * Platform admins (null enforcedDistrictId) bypass and see all records.
 */
router.param("id", async (req, res, next, id) => {
  const numId = Number(id);
  if (!Number.isFinite(numId) || numId <= 0) { next(); return; }
  const enforcedDistrictId = getEnforcedDistrictId(req as AuthedRequest);
  if (enforcedDistrictId === null) { next(); return; }

  const path = req.path;
  let rows: { rows: unknown[] };

  if (/^\/students\//.test(path)) {
    // :id is a student ID
    rows = await db.execute(sql`
      SELECT 1 FROM students
      WHERE id = ${numId}
        AND school_id IN (SELECT id FROM schools WHERE district_id = ${enforcedDistrictId})
    `);
  } else if (/^\/emergency-contacts\//.test(path)) {
    // :id is an emergency contact ID — look up student
    rows = await db.execute(sql`
      SELECT 1 FROM emergency_contacts ec
      JOIN students s ON s.id = ec.student_id
      WHERE ec.id = ${numId}
        AND s.school_id IN (SELECT id FROM schools WHERE district_id = ${enforcedDistrictId})
    `);
  } else if (/^\/medical-alerts\//.test(path)) {
    // :id is a medical alert ID — look up student
    rows = await db.execute(sql`
      SELECT 1 FROM medical_alerts ma
      JOIN students s ON s.id = ma.student_id
      WHERE ma.id = ${numId}
        AND s.school_id IN (SELECT id FROM schools WHERE district_id = ${enforcedDistrictId})
    `);
  } else {
    next(); return;
  }

  if (!rows.rows.length) {
    res.status(403).json({ error: "Access denied: resource does not belong to your district" });
    return;
  }
  next();
});

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

  // schoolYearId filter: students who had an active IEP overlapping the year OR any
  // sessions in that year. IEP membership uses date-range overlap (iep_end_date >=
  // year start_date) rather than iep_documents.school_year_id so that IEP records
  // never need to be mutated during rollover.
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
  // District ownership check: verify the target school belongs to the caller's district.
  // schoolId is part of CreateStudentBody and required by the students table — it is
  // always present at this point since Zod validation passed.
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

  // Get service requirements with service type and provider names
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

  // Recent sessions
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

  // Active alerts
  const activeAlerts = await db
    .select()
    .from(alertsTable)
    .where(and(eq(alertsTable.studentId, params.data.id), eq(alertsTable.resolved, false)));

  // Staff assignments
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
    notes: student.notes,
    tags: student.tags,
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

// ─── Enrollment Events ────────────────────────────────────────────────────────

const ENROLLMENT_EDIT_ROLES = ["admin", "case_manager"] as const;
const ENROLLMENT_READ_ROLES = ["admin", "case_manager", "sped_teacher", "coordinator", "bcba"] as const;

router.get("/students/:id/enrollment", async (req, res): Promise<void> => {
  const authRole = (req as AuthedRequest).trellisRole;
  if (!(ENROLLMENT_READ_ROLES as readonly string[]).includes(authRole ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const params = GetStudentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const events = await db
    .select({
      id: enrollmentEventsTable.id,
      studentId: enrollmentEventsTable.studentId,
      eventType: enrollmentEventsTable.eventType,
      eventDate: enrollmentEventsTable.eventDate,
      reasonCode: enrollmentEventsTable.reasonCode,
      reason: enrollmentEventsTable.reason,
      notes: enrollmentEventsTable.notes,
      fromSchoolId: enrollmentEventsTable.fromSchoolId,
      toSchoolId: enrollmentEventsTable.toSchoolId,
      fromProgramId: enrollmentEventsTable.fromProgramId,
      toProgramId: enrollmentEventsTable.toProgramId,
      performedById: enrollmentEventsTable.performedById,
      performedByFirst: staffTable.firstName,
      performedByLast: staffTable.lastName,
      recordedById: enrollmentEventsTable.recordedById,
      createdAt: enrollmentEventsTable.createdAt,
    })
    .from(enrollmentEventsTable)
    .leftJoin(staffTable, eq(staffTable.id, enrollmentEventsTable.performedById))
    .where(eq(enrollmentEventsTable.studentId, params.data.id))
    .orderBy(desc(enrollmentEventsTable.eventDate));

  logAudit(req, {
    action: "read",
    targetTable: "enrollment_events",
    studentId: params.data.id,
    summary: `Viewed enrollment history for student #${params.data.id}`,
  });

  res.json(events.map(e => ({ ...e, createdAt: e.createdAt.toISOString() })));
});

router.post("/students/:id/enrollment", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(ENROLLMENT_EDIT_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const params = GetStudentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const { eventType, eventDate, reasonCode, reason, notes, performedById, fromSchoolId, toSchoolId, fromProgramId, toProgramId } = req.body;
  if (!eventType || !eventDate) { res.status(400).json({ error: "eventType and eventDate are required" }); return; }

  const VALID_EVENT_TYPES = new Set([
    "enrolled", "reactivated", "withdrawn", "transferred_in", "transferred_out",
    "program_change", "graduated", "suspended", "leave_of_absence", "note",
  ]);
  if (!VALID_EVENT_TYPES.has(eventType)) {
    res.status(400).json({ error: `Invalid eventType '${eventType}'. Must be one of: ${[...VALID_EVENT_TYPES].join(", ")}` }); return;
  }

  const VALID_REASON_CODES = new Set(["graduation", "transfer", "family_move", "program_completion", "other"]);
  if (reasonCode !== undefined && reasonCode !== null && reasonCode !== "" && !VALID_REASON_CODES.has(reasonCode)) {
    res.status(400).json({ error: `Invalid reasonCode '${reasonCode}'. Must be one of: ${[...VALID_REASON_CODES].join(", ")}` }); return;
  }

  const LIFECYCLE_STATUS: Record<string, string> = {
    enrolled: "active",
    reactivated: "active",
    transferred_in: "active",
    withdrawn: "inactive",
    suspended: "inactive",
    leave_of_absence: "inactive",
    transferred_out: "transferred",
    graduated: "graduated",
  };

  const [event] = await db.transaction(async (tx) => {
    const [ev] = await tx.insert(enrollmentEventsTable).values({
      studentId: params.data.id,
      eventType,
      eventDate,
      reasonCode: reasonCode ?? null,
      reason: reason ?? null,
      notes: notes ?? null,
      fromSchoolId: fromSchoolId ? Number(fromSchoolId) : null,
      toSchoolId: toSchoolId ? Number(toSchoolId) : null,
      fromProgramId: fromProgramId ? Number(fromProgramId) : null,
      toProgramId: toProgramId ? Number(toProgramId) : null,
      performedById: performedById ? Number(performedById) : null,
      recordedById: null,
    }).returning();

    const newStatus = LIFECYCLE_STATUS[eventType];
    if (newStatus) {
      if (newStatus === "active") {
        await tx.update(studentsTable)
          .set({ status: "active", enrolledAt: eventDate, withdrawnAt: null })
          .where(and(eq(studentsTable.id, params.data.id), isNull(studentsTable.deletedAt)));
      } else {
        await tx.update(studentsTable)
          .set({ status: newStatus, withdrawnAt: eventDate })
          .where(and(eq(studentsTable.id, params.data.id), isNull(studentsTable.deletedAt)));
      }
    }

    return [ev];
  });

  logAudit(req, {
    action: "create",
    targetTable: "enrollment_events",
    targetId: event.id,
    studentId: params.data.id,
    summary: `Logged enrollment event '${eventType}' for student #${params.data.id}`,
    newValues: { eventType, eventDate, reasonCode, reason, notes } as Record<string, unknown>,
  });

  res.status(201).json({ ...event, createdAt: event.createdAt.toISOString(), updatedAt: event.updatedAt.toISOString() });
});

router.patch("/students/:id/enrollment/:eventId", async (req, res): Promise<void> => {
  const patchRole = (req as AuthedRequest).trellisRole;
  if (!(ENROLLMENT_EDIT_ROLES as readonly string[]).includes(patchRole ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const studentId = Number(req.params.id);
  const eventId = Number(req.params.eventId);
  if (!studentId || !eventId) { res.status(400).json({ error: "Invalid id" }); return; }

  const { eventType, eventDate, reasonCode, reason, notes } = req.body;

  const VALID_EVENT_TYPES_PATCH = new Set([
    "enrolled", "reactivated", "withdrawn", "transferred_in", "transferred_out",
    "program_change", "graduated", "suspended", "leave_of_absence", "note",
  ]);
  if (eventType !== undefined && !VALID_EVENT_TYPES_PATCH.has(eventType)) {
    res.status(400).json({ error: `Invalid eventType '${eventType}'.` }); return;
  }

  const VALID_REASON_CODES_PATCH = new Set(["graduation", "transfer", "family_move", "program_completion", "other"]);
  if (reasonCode !== undefined && reasonCode !== null && reasonCode !== "" && !VALID_REASON_CODES_PATCH.has(reasonCode)) {
    res.status(400).json({ error: `Invalid reasonCode '${reasonCode}'.` }); return;
  }

  type EventPatch = Partial<Pick<typeof enrollmentEventsTable.$inferInsert, "eventType" | "eventDate" | "reasonCode" | "reason" | "notes">>;
  const updates: EventPatch = {};
  if (eventType !== undefined) updates.eventType = eventType;
  if (eventDate !== undefined) updates.eventDate = eventDate;
  if (reasonCode !== undefined) updates.reasonCode = reasonCode;
  if (reason !== undefined) updates.reason = reason;
  if (notes !== undefined) updates.notes = notes;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  const LIFECYCLE_STATUS_PATCH: Record<string, string> = {
    enrolled: "active",
    reactivated: "active",
    transferred_in: "active",
    withdrawn: "inactive",
    suspended: "inactive",
    leave_of_absence: "inactive",
    transferred_out: "transferred",
    graduated: "graduated",
  };

  const updated = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ eventType: enrollmentEventsTable.eventType, eventDate: enrollmentEventsTable.eventDate })
      .from(enrollmentEventsTable)
      .where(and(eq(enrollmentEventsTable.id, eventId), eq(enrollmentEventsTable.studentId, studentId)));
    if (!current) return null;

    const [ev] = await tx
      .update(enrollmentEventsTable)
      .set(updates)
      .where(and(eq(enrollmentEventsTable.id, eventId), eq(enrollmentEventsTable.studentId, studentId)))
      .returning();

    const effectiveType = updates.eventType ?? current.eventType;
    const effectiveDate = updates.eventDate ?? current.eventDate;
    const newStatus = LIFECYCLE_STATUS_PATCH[effectiveType];
    if (newStatus && (updates.eventType !== undefined || updates.eventDate !== undefined)) {
      if (newStatus === "active") {
        await tx.update(studentsTable)
          .set({ status: "active", enrolledAt: effectiveDate, withdrawnAt: null })
          .where(and(eq(studentsTable.id, studentId), isNull(studentsTable.deletedAt)));
      } else {
        await tx.update(studentsTable)
          .set({ status: newStatus, withdrawnAt: effectiveDate })
          .where(and(eq(studentsTable.id, studentId), isNull(studentsTable.deletedAt)));
      }
    }

    return ev;
  });

  if (!updated) { res.status(404).json({ error: "Event not found" }); return; }

  logAudit(req, {
    action: "update",
    targetTable: "enrollment_events",
    targetId: eventId,
    studentId,
    summary: `Updated enrollment event #${eventId} for student #${studentId}`,
    newValues: updates as Record<string, unknown>,
  });

  res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
});

router.post("/students/:id/archive", async (req, res): Promise<void> => {
  const params = GetStudentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const archiveRole = (req as AuthedRequest).trellisRole;
  if (archiveRole !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const today = new Date().toISOString().slice(0, 10);
  const { reason, notes } = req.body;

  const { updated, event } = await db.transaction(async (tx) => {
    const [stu] = await tx
      .update(studentsTable)
      .set({ status: "inactive", withdrawnAt: today })
      .where(and(eq(studentsTable.id, params.data.id), isNull(studentsTable.deletedAt)))
      .returning({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName });
    if (!stu) return { updated: null, event: null };
    const [ev] = await tx.insert(enrollmentEventsTable).values({
      studentId: params.data.id,
      eventType: "withdrawn",
      eventDate: today,
      reason: reason ?? null,
      notes: notes ?? null,
      performedById: null,
    }).returning();
    return { updated: stu, event: ev };
  });

  if (!updated) { res.status(404).json({ error: "Student not found" }); return; }

  logAudit(req, {
    action: "update",
    targetTable: "students",
    targetId: params.data.id,
    studentId: params.data.id,
    summary: `Archived student ${updated.firstName} ${updated.lastName} (status → inactive)`,
    newValues: { status: "inactive", withdrawnAt: today, reason } as Record<string, unknown>,
  });

  res.json({ success: true, eventId: event!.id });
});

router.post("/students/:id/reactivate", async (req, res): Promise<void> => {
  const params = GetStudentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const reactivateRole = (req as AuthedRequest).trellisRole;
  if (reactivateRole !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const today = new Date().toISOString().slice(0, 10);
  const { notes } = req.body;

  const { updated, event } = await db.transaction(async (tx) => {
    const [stu] = await tx
      .update(studentsTable)
      .set({ status: "active", enrolledAt: today, withdrawnAt: null })
      .where(and(eq(studentsTable.id, params.data.id), isNull(studentsTable.deletedAt)))
      .returning({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName });
    if (!stu) return { updated: null, event: null };
    const [ev] = await tx.insert(enrollmentEventsTable).values({
      studentId: params.data.id,
      eventType: "reactivated",
      eventDate: today,
      reason: null,
      notes: notes ?? null,
      performedById: null,
    }).returning();
    return { updated: stu, event: ev };
  });

  if (!updated) { res.status(404).json({ error: "Student not found" }); return; }

  logAudit(req, {
    action: "update",
    targetTable: "students",
    targetId: params.data.id,
    studentId: params.data.id,
    summary: `Reactivated student ${updated.firstName} ${updated.lastName} (status → active)`,
    newValues: { status: "active", enrolledAt: today } as Record<string, unknown>,
  });

  res.json({ success: true, eventId: event!.id });
});

// ─── Emergency Contacts ───────────────────────────────────────────────────────

const EC_WRITE_ROLES = ["admin", "case_manager"] as const;
const EC_READ_ROLES = ["admin", "case_manager", "sped_teacher", "para", "provider", "coordinator", "bcba"] as const;

router.get("/students/:id/emergency-contacts", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_READ_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const studentId = Number(req.params.id);
  if (!studentId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await assertStudentAccess(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const contacts = await db
    .select()
    .from(emergencyContactsTable)
    .where(eq(emergencyContactsTable.studentId, studentId))
    .orderBy(emergencyContactsTable.priority, emergencyContactsTable.id);

  res.json(contacts.map(c => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })));
});

router.post("/students/:id/emergency-contacts", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_WRITE_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const studentId = Number(req.params.id);
  if (!studentId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await assertStudentAccess(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const { firstName, lastName, relationship, phone, phoneSecondary, email, isAuthorizedForPickup, priority, notes } = req.body;
  if (!firstName || !lastName || !relationship || !phone) {
    res.status(400).json({ error: "firstName, lastName, relationship, and phone are required" }); return;
  }

  const [contact] = await db.insert(emergencyContactsTable).values({
    studentId,
    firstName,
    lastName,
    relationship,
    phone,
    phoneSecondary: phoneSecondary ?? null,
    email: email ?? null,
    isAuthorizedForPickup: isAuthorizedForPickup ?? false,
    priority: priority ?? 1,
    notes: notes ?? null,
  }).returning();

  logAudit(req, {
    action: "create",
    targetTable: "emergency_contacts",
    targetId: contact.id,
    studentId,
    summary: `Added emergency contact ${firstName} ${lastName} for student #${studentId}`,
    newValues: { firstName, lastName, relationship, phone } as Record<string, unknown>,
  });

  res.status(201).json({ ...contact, createdAt: contact.createdAt.toISOString(), updatedAt: contact.updatedAt.toISOString() });
});

router.patch("/emergency-contacts/:id", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_WRITE_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const contactId = Number(req.params.id);
  if (!contactId) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select({ studentId: emergencyContactsTable.studentId }).from(emergencyContactsTable).where(eq(emergencyContactsTable.id, contactId));
  if (!existing) { res.status(404).json({ error: "Emergency contact not found" }); return; }
  if (!await assertStudentAccess(req, existing.studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const { firstName, lastName, relationship, phone, phoneSecondary, email, isAuthorizedForPickup, priority, notes } = req.body;

  type ContactPatch = Partial<typeof emergencyContactsTable.$inferInsert>;
  const updates: ContactPatch = {};
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (relationship !== undefined) updates.relationship = relationship;
  if (phone !== undefined) updates.phone = phone;
  if (phoneSecondary !== undefined) updates.phoneSecondary = phoneSecondary;
  if (email !== undefined) updates.email = email;
  if (isAuthorizedForPickup !== undefined) updates.isAuthorizedForPickup = isAuthorizedForPickup;
  if (priority !== undefined) updates.priority = priority;
  if (notes !== undefined) updates.notes = notes;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  const [contact] = await db
    .update(emergencyContactsTable)
    .set(updates)
    .where(eq(emergencyContactsTable.id, contactId))
    .returning();

  if (!contact) { res.status(404).json({ error: "Emergency contact not found" }); return; }

  logAudit(req, {
    action: "update",
    targetTable: "emergency_contacts",
    targetId: contactId,
    studentId: contact.studentId,
    summary: `Updated emergency contact #${contactId}`,
    newValues: updates as Record<string, unknown>,
  });

  res.json({ ...contact, createdAt: contact.createdAt.toISOString(), updatedAt: contact.updatedAt.toISOString() });
});

router.delete("/emergency-contacts/:id", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_WRITE_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const contactId = Number(req.params.id);
  if (!contactId) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select({ studentId: emergencyContactsTable.studentId }).from(emergencyContactsTable).where(eq(emergencyContactsTable.id, contactId));
  if (!existing) { res.status(404).json({ error: "Emergency contact not found" }); return; }
  if (!await assertStudentAccess(req, existing.studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const [deleted] = await db
    .delete(emergencyContactsTable)
    .where(eq(emergencyContactsTable.id, contactId))
    .returning({ id: emergencyContactsTable.id, studentId: emergencyContactsTable.studentId });

  if (!deleted) { res.status(404).json({ error: "Emergency contact not found" }); return; }

  logAudit(req, {
    action: "delete",
    targetTable: "emergency_contacts",
    targetId: contactId,
    studentId: deleted.studentId,
    summary: `Deleted emergency contact #${contactId}`,
  });

  res.json({ success: true });
});

// ─── Medical Alerts ───────────────────────────────────────────────────────────

router.get("/students/:id/medical-alerts", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_READ_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const studentId = Number(req.params.id);
  if (!studentId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await assertStudentAccess(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const alerts = await db
    .select()
    .from(medicalAlertsTable)
    .where(eq(medicalAlertsTable.studentId, studentId))
    .orderBy(desc(medicalAlertsTable.createdAt));

  res.json(alerts.map(a => ({ ...a, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() })));
});

router.post("/students/:id/medical-alerts", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_WRITE_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const studentId = Number(req.params.id);
  if (!studentId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await assertStudentAccess(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const { alertType, description, severity, treatmentNotes, epiPenOnFile, notifyAllStaff } = req.body;
  if (!alertType || !description || !severity) {
    res.status(400).json({ error: "alertType, description, and severity are required" }); return;
  }
  if (!(MEDICAL_ALERT_TYPES as readonly string[]).includes(alertType)) {
    res.status(400).json({ error: `Invalid alertType. Must be one of: ${MEDICAL_ALERT_TYPES.join(", ")}` }); return;
  }
  if (!(MEDICAL_ALERT_SEVERITIES as readonly string[]).includes(severity)) {
    res.status(400).json({ error: `Invalid severity. Must be one of: ${MEDICAL_ALERT_SEVERITIES.join(", ")}` }); return;
  }

  const [alert] = await db.insert(medicalAlertsTable).values({
    studentId,
    alertType,
    description,
    severity,
    treatmentNotes: treatmentNotes ?? null,
    epiPenOnFile: epiPenOnFile ?? false,
    notifyAllStaff: notifyAllStaff ?? false,
  }).returning();

  logAudit(req, {
    action: "create",
    targetTable: "medical_alerts",
    targetId: alert.id,
    studentId,
    summary: `Added medical alert (${alertType}, ${severity}) for student #${studentId}`,
    newValues: { alertType, description, severity } as Record<string, unknown>,
  });

  res.status(201).json({ ...alert, createdAt: alert.createdAt.toISOString(), updatedAt: alert.updatedAt.toISOString() });
});

router.patch("/medical-alerts/:id", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_WRITE_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const alertId = Number(req.params.id);
  if (!alertId) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existingAlert] = await db.select({ studentId: medicalAlertsTable.studentId }).from(medicalAlertsTable).where(eq(medicalAlertsTable.id, alertId));
  if (!existingAlert) { res.status(404).json({ error: "Medical alert not found" }); return; }
  if (!await assertStudentAccess(req, existingAlert.studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const { alertType, description, severity, treatmentNotes, epiPenOnFile, notifyAllStaff } = req.body;

  if (alertType !== undefined && !(MEDICAL_ALERT_TYPES as readonly string[]).includes(alertType)) {
    res.status(400).json({ error: `Invalid alertType. Must be one of: ${MEDICAL_ALERT_TYPES.join(", ")}` }); return;
  }
  if (severity !== undefined && !(MEDICAL_ALERT_SEVERITIES as readonly string[]).includes(severity)) {
    res.status(400).json({ error: `Invalid severity. Must be one of: ${MEDICAL_ALERT_SEVERITIES.join(", ")}` }); return;
  }

  type AlertPatch = Partial<typeof medicalAlertsTable.$inferInsert>;
  const updates: AlertPatch = {};
  if (alertType !== undefined) updates.alertType = alertType;
  if (description !== undefined) updates.description = description;
  if (severity !== undefined) updates.severity = severity;
  if (treatmentNotes !== undefined) updates.treatmentNotes = treatmentNotes;
  if (epiPenOnFile !== undefined) updates.epiPenOnFile = epiPenOnFile;
  if (notifyAllStaff !== undefined) updates.notifyAllStaff = notifyAllStaff;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  const [alert] = await db
    .update(medicalAlertsTable)
    .set(updates)
    .where(eq(medicalAlertsTable.id, alertId))
    .returning();

  if (!alert) { res.status(404).json({ error: "Medical alert not found" }); return; }

  logAudit(req, {
    action: "update",
    targetTable: "medical_alerts",
    targetId: alertId,
    studentId: alert.studentId,
    summary: `Updated medical alert #${alertId}`,
    newValues: updates as Record<string, unknown>,
  });

  res.json({ ...alert, createdAt: alert.createdAt.toISOString(), updatedAt: alert.updatedAt.toISOString() });
});

router.delete("/medical-alerts/:id", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_WRITE_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const alertId = Number(req.params.id);
  if (!alertId) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existingAlert] = await db.select({ studentId: medicalAlertsTable.studentId }).from(medicalAlertsTable).where(eq(medicalAlertsTable.id, alertId));
  if (!existingAlert) { res.status(404).json({ error: "Medical alert not found" }); return; }
  if (!await assertStudentAccess(req, existingAlert.studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const [deleted] = await db
    .delete(medicalAlertsTable)
    .where(eq(medicalAlertsTable.id, alertId))
    .returning({ id: medicalAlertsTable.id, studentId: medicalAlertsTable.studentId });

  if (!deleted) { res.status(404).json({ error: "Medical alert not found" }); return; }

  logAudit(req, {
    action: "delete",
    targetTable: "medical_alerts",
    targetId: alertId,
    studentId: deleted.studentId,
    summary: `Deleted medical alert #${alertId}`,
  });

  res.json({ success: true });
});

router.get("/students/:id/snapshot", async (req, res): Promise<void> => {
  try {
    const studentId = Number(req.params.id);
    if (!Number.isFinite(studentId) || studentId <= 0) {
      res.status(400).json({ error: "Invalid student ID" });
      return;
    }

    const hasAccess = await assertStudentAccess(req as AuthedRequest, studentId);
    if (!hasAccess) { res.status(403).json({ error: "Access denied" }); return; }

    const [student] = await db.select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
      status: studentsTable.status,
      schoolName: schoolsTable.name,
    }).from(studentsTable)
      .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(and(eq(studentsTable.id, studentId), isNull(studentsTable.deletedAt)));

    if (!student) { res.status(404).json({ error: "Student not found" }); return; }

    const today = new Date().toISOString().slice(0, 10);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
    const fromDate = sixMonthsAgo.toISOString().slice(0, 10);

    const [
      goalsRaw,
      iepDocs,
      accommodationsRaw,
      recentSessionsRaw,
      incidentsRaw,
      minuteProgress,
      activeAlerts,
      reEvalRows,
    ] = await Promise.all([
      db.select({
        id: iepGoalsTable.id,
        goalArea: iepGoalsTable.goalArea,
        goalNumber: iepGoalsTable.goalNumber,
        annualGoal: iepGoalsTable.annualGoal,
        programTargetId: iepGoalsTable.programTargetId,
        behaviorTargetId: iepGoalsTable.behaviorTargetId,
        ptMasteryCriterion: programTargetsTable.masteryCriterionPercent,
        btBaselineValue: behaviorTargetsTable.baselineValue,
        btGoalValue: behaviorTargetsTable.goalValue,
        btTargetDirection: behaviorTargetsTable.targetDirection,
      }).from(iepGoalsTable)
        .leftJoin(programTargetsTable, eq(iepGoalsTable.programTargetId, programTargetsTable.id))
        .leftJoin(behaviorTargetsTable, eq(iepGoalsTable.behaviorTargetId, behaviorTargetsTable.id))
        .where(and(eq(iepGoalsTable.studentId, studentId), eq(iepGoalsTable.active, true)))
        .orderBy(asc(iepGoalsTable.goalArea), asc(iepGoalsTable.goalNumber)),

      db.select({
        id: iepDocumentsTable.id,
        iepStartDate: iepDocumentsTable.iepStartDate,
        iepEndDate: iepDocumentsTable.iepEndDate,
        status: iepDocumentsTable.status,
        active: iepDocumentsTable.active,
      }).from(iepDocumentsTable)
        .where(and(eq(iepDocumentsTable.studentId, studentId), eq(iepDocumentsTable.active, true)))
        .orderBy(desc(iepDocumentsTable.iepStartDate))
        .limit(1),

      db.select({
        id: iepAccommodationsTable.id,
        category: iepAccommodationsTable.category,
        description: iepAccommodationsTable.description,
        setting: iepAccommodationsTable.setting,
        frequency: iepAccommodationsTable.frequency,
        active: iepAccommodationsTable.active,
      }).from(iepAccommodationsTable)
        .where(and(eq(iepAccommodationsTable.studentId, studentId), eq(iepAccommodationsTable.active, true))),

      db.select({
        id: sessionLogsTable.id,
        sessionDate: sessionLogsTable.sessionDate,
        durationMinutes: sessionLogsTable.durationMinutes,
        status: sessionLogsTable.status,
        notes: sessionLogsTable.notes,
        serviceTypeName: serviceTypesTable.name,
        staffFirst: staffTable.firstName,
        staffLast: staffTable.lastName,
      }).from(sessionLogsTable)
        .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
        .leftJoin(staffTable, eq(staffTable.id, sessionLogsTable.staffId))
        .where(and(eq(sessionLogsTable.studentId, studentId), isNull(sessionLogsTable.deletedAt)))
        .orderBy(desc(sessionLogsTable.sessionDate))
        .limit(5),

      db.select({
        id: restraintIncidentsTable.id,
        incidentDate: restraintIncidentsTable.incidentDate,
        incidentType: restraintIncidentsTable.incidentType,
        status: restraintIncidentsTable.status,
        studentInjury: restraintIncidentsTable.studentInjury,
        staffInjury: restraintIncidentsTable.staffInjury,
      }).from(restraintIncidentsTable)
        .where(eq(restraintIncidentsTable.studentId, studentId))
        .orderBy(desc(restraintIncidentsTable.incidentDate))
        .limit(5),

      computeAllActiveMinuteProgress({ studentId }),

      db.select({
        id: alertsTable.id,
        type: alertsTable.type,
        severity: alertsTable.severity,
        message: alertsTable.message,
        createdAt: alertsTable.createdAt,
      }).from(alertsTable)
        .where(and(eq(alertsTable.studentId, studentId), eq(alertsTable.resolved, false)))
        .orderBy(desc(alertsTable.createdAt))
        .limit(10),

      db.execute(sql`
        SELECT ed.next_re_eval_date, ed.primary_disability
        FROM eligibility_determinations ed
        WHERE ed.student_id = ${studentId} AND ed.deleted_at IS NULL
        ORDER BY ed.created_at DESC LIMIT 1
      `),
    ]);

    const programTargetIds = goalsRaw.map(g => g.programTargetId).filter((id): id is number => id !== null);
    const behaviorTargetIds = goalsRaw.map(g => g.behaviorTargetId).filter((id): id is number => id !== null);

    const [allProgramData, allBehaviorData] = await Promise.all([
      programTargetIds.length > 0
        ? db.select({
            programTargetId: programDataTable.programTargetId,
            sessionDate: dataSessionsTable.sessionDate,
            percentCorrect: programDataTable.percentCorrect,
          }).from(programDataTable)
            .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
            .where(and(
              inArray(programDataTable.programTargetId, programTargetIds),
              eq(dataSessionsTable.studentId, studentId),
              gte(dataSessionsTable.sessionDate, fromDate),
            ))
            .orderBy(asc(dataSessionsTable.sessionDate))
        : Promise.resolve([]),
      behaviorTargetIds.length > 0
        ? db.select({
            behaviorTargetId: behaviorDataTable.behaviorTargetId,
            sessionDate: dataSessionsTable.sessionDate,
            value: behaviorDataTable.value,
          }).from(behaviorDataTable)
            .innerJoin(dataSessionsTable, eq(behaviorDataTable.dataSessionId, dataSessionsTable.id))
            .where(and(
              inArray(behaviorDataTable.behaviorTargetId, behaviorTargetIds),
              eq(dataSessionsTable.studentId, studentId),
              gte(dataSessionsTable.sessionDate, fromDate),
            ))
            .orderBy(asc(dataSessionsTable.sessionDate))
        : Promise.resolve([]),
    ]);

    const programDataByTarget = new Map<number, { sessionDate: string; percentCorrect: string | null }[]>();
    for (const row of allProgramData) {
      const arr = programDataByTarget.get(row.programTargetId) || [];
      arr.push({ sessionDate: row.sessionDate, percentCorrect: row.percentCorrect });
      programDataByTarget.set(row.programTargetId, arr);
    }

    const behaviorDataByTarget = new Map<number, { sessionDate: string; value: string }[]>();
    for (const row of allBehaviorData) {
      const arr = behaviorDataByTarget.get(row.behaviorTargetId) || [];
      arr.push({ sessionDate: row.sessionDate, value: row.value });
      behaviorDataByTarget.set(row.behaviorTargetId, arr);
    }

    function computeTrend(values: number[], threshold: number, isDecrease: boolean): "improving" | "declining" | "stable" {
      if (values.length < 4) return "stable";
      const firstHalf = values.slice(0, Math.floor(values.length / 2));
      const secondHalf = values.slice(Math.floor(values.length / 2));
      const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
      if (isDecrease) {
        if (secondAvg < firstAvg - threshold) return "improving";
        if (secondAvg > firstAvg + threshold) return "declining";
      } else {
        if (secondAvg > firstAvg + threshold) return "improving";
        if (secondAvg < firstAvg - threshold) return "declining";
      }
      return "stable";
    }

    const goals = goalsRaw.map((goal) => {
      let latestValue: number | null = null;
      let trendDirection: "improving" | "declining" | "stable" = "stable";
      let progressRating = "not_addressed";
      let dataPointCount = 0;

      if (goal.programTargetId) {
        const rows = programDataByTarget.get(goal.programTargetId) || [];
        dataPointCount = rows.length;
        if (rows.length > 0) {
          const values = rows.map(r => parseFloat(r.percentCorrect ?? "0"));
          latestValue = values[values.length - 1];
          const masteryPct = goal.ptMasteryCriterion ?? 80;
          if (latestValue >= masteryPct) progressRating = "mastered";
          else if (latestValue >= masteryPct * 0.75) progressRating = "sufficient_progress";
          else if (latestValue >= masteryPct * 0.5) progressRating = "some_progress";
          else progressRating = "insufficient_progress";
          trendDirection = computeTrend(values, 5, false);
        }
      } else if (goal.behaviorTargetId) {
        const rows = behaviorDataByTarget.get(goal.behaviorTargetId) || [];
        dataPointCount = rows.length;
        if (rows.length > 0) {
          const values = rows.map(r => parseFloat(r.value));
          latestValue = values[values.length - 1];
          const goalVal = goal.btGoalValue ? parseFloat(goal.btGoalValue) : null;
          const targetDir = goal.btTargetDirection || "decrease";
          if (goalVal !== null) {
            const met = targetDir === "decrease" ? latestValue <= goalVal : latestValue >= goalVal;
            if (met) progressRating = "mastered";
            else {
              const base = goal.btBaselineValue ? parseFloat(goal.btBaselineValue) : null;
              if (base !== null) {
                const totalRange = Math.abs(goalVal - base);
                const progress = Math.abs(latestValue - base);
                const pct = totalRange > 0 ? progress / totalRange : 0;
                if (pct >= 0.75) progressRating = "sufficient_progress";
                else if (pct >= 0.25) progressRating = "some_progress";
                else progressRating = "insufficient_progress";
              } else {
                progressRating = "some_progress";
              }
            }
          }
          trendDirection = computeTrend(values, 0.5, (targetDir || "decrease") === "decrease");
        }
      }

      return {
        id: goal.id,
        goalArea: goal.goalArea,
        goalNumber: goal.goalNumber,
        annualGoal: goal.annualGoal,
        latestValue,
        trendDirection,
        progressRating,
        dataPointCount,
      };
    });

    const activeIep = iepDocs[0] || null;

    const deadlines: { label: string; date: string; daysUntil: number; urgency: "overdue" | "critical" | "soon" | "ok" }[] = [];

    if (activeIep?.iepEndDate) {
      const endDate = new Date(activeIep.iepEndDate);
      const daysUntil = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      deadlines.push({
        label: "IEP Annual Review",
        date: activeIep.iepEndDate,
        daysUntil,
        urgency: daysUntil < 0 ? "overdue" : daysUntil <= 30 ? "critical" : daysUntil <= 60 ? "soon" : "ok",
      });
    }

    const reEvalRow = (reEvalRows.rows as Record<string, unknown>[])[0];
    if (reEvalRow?.next_re_eval_date) {
      const reEvalDate = new Date(reEvalRow.next_re_eval_date as string);
      const daysUntil = Math.ceil((reEvalDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      deadlines.push({
        label: "Re-Evaluation Due",
        date: reEvalRow.next_re_eval_date as string,
        daysUntil,
        urgency: daysUntil < 0 ? "overdue" : daysUntil <= 30 ? "critical" : daysUntil <= 90 ? "soon" : "ok",
      });
    }

    const upcomingMeetings = await db.execute(sql`
      SELECT id, scheduled_date, meeting_type, status
      FROM team_meetings
      WHERE student_id = ${studentId}
        AND scheduled_date >= ${today}
        AND status != 'cancelled'
      ORDER BY scheduled_date ASC
      LIMIT 3
    `);
    for (const mtg of upcomingMeetings.rows as Record<string, unknown>[]) {
      if (mtg.scheduled_date) {
        const mtgDate = new Date(mtg.scheduled_date as string);
        const daysUntil = Math.ceil((mtgDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        deadlines.push({
          label: `Meeting: ${String(mtg.meeting_type || "Team").replace(/_/g, " ")}`,
          date: mtg.scheduled_date as string,
          daysUntil,
          urgency: daysUntil <= 7 ? "critical" : daysUntil <= 30 ? "soon" : "ok",
        });
      }
    }

    deadlines.sort((a, b) => a.daysUntil - b.daysUntil);

    const complianceStatus = {
      servicesOnTrack: minuteProgress.filter((p: { riskStatus: string }) => p.riskStatus === "on_track" || p.riskStatus === "completed").length,
      servicesAtRisk: minuteProgress.filter((p: { riskStatus: string }) => p.riskStatus === "at_risk" || p.riskStatus === "slightly_behind").length,
      servicesOutOfCompliance: minuteProgress.filter((p: { riskStatus: string }) => p.riskStatus === "out_of_compliance").length,
      totalServices: minuteProgress.length,
      iepStatus: activeIep ? activeIep.status : "none",
      iepExpiring: activeIep?.iepEndDate ? Math.ceil((new Date(activeIep.iepEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 30 : false,
      activeAlertCount: activeAlerts.length,
    };

    res.json({
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        grade: student.grade,
        status: student.status,
        schoolName: student.schoolName,
      },
      goals,
      deadlines,
      recentSessions: recentSessionsRaw.map(s => ({
        id: s.id,
        sessionDate: s.sessionDate,
        durationMinutes: s.durationMinutes,
        status: s.status,
        notes: s.notes,
        serviceTypeName: s.serviceTypeName,
        staffName: s.staffFirst && s.staffLast ? `${s.staffFirst} ${s.staffLast}` : null,
      })),
      recentIncidents: incidentsRaw.map(i => ({
        id: i.id,
        incidentDate: i.incidentDate,
        incidentType: i.incidentType,
        status: i.status,
        studentInjury: i.studentInjury,
        staffInjury: i.staffInjury,
      })),
      accommodations: accommodationsRaw.map(a => ({
        id: a.id,
        category: a.category,
        description: a.description,
        setting: a.setting,
        frequency: a.frequency,
      })),
      complianceStatus,
      activeAlerts: activeAlerts.map(a => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        message: a.message,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (e: unknown) {
    console.error("Student snapshot error:", e);
    res.status(500).json({ error: "Failed to load student snapshot" });
  }
});

export default router;
