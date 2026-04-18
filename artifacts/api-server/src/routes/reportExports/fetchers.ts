import { db } from "@workspace/db";
import {
  studentsTable, serviceRequirementsTable, serviceTypesTable,
  sessionLogsTable, schoolsTable, staffTable, staffAssignmentsTable,
  iepDocumentsTable,
} from "@workspace/db";
import { eq, and, asc, lte, gte, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

export async function fetchComplianceSummaryData(
  districtId: number | null,
  opts: { start: string; end: string; schoolId?: number | null; serviceTypeId?: number | null },
) {
  const { start, end, schoolId, serviceTypeId } = opts;

  const conditions: SQL[] = [isNull(studentsTable.deletedAt), eq(studentsTable.status, "active")];
  if (districtId !== null) {
    conditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${districtId})`);
  }
  if (schoolId) conditions.push(eq(studentsTable.schoolId, schoolId));

  const students = await db.select({
    id: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
    grade: studentsTable.grade,
    schoolName: schoolsTable.name,
  }).from(studentsTable)
    .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .where(and(...conditions))
    .orderBy(asc(studentsTable.lastName));

  if (students.length === 0) {
    return {
      students,
      reqsByStudent: new Map<number, Array<{ studentId: number; serviceTypeName: string | null; requiredMinutes: number | null; intervalType: string | null }>>(),
      sessionMap: new Map<string, { delivered: number; completed: number; missed: number }>(),
    };
  }

  const sIds = students.map(s => s.id);
  const idList = sql.join(sIds.map(id => sql`${id}`), sql`, `);

  const reqConditions: SQL[] = [
    eq(serviceRequirementsTable.active, true),
    sql`${serviceRequirementsTable.studentId} IN (${idList})`,
  ];
  if (serviceTypeId) reqConditions.push(eq(serviceRequirementsTable.serviceTypeId, serviceTypeId));

  const sessConditions: SQL[] = [
    sql`${sessionLogsTable.studentId} IN (${idList})`,
    gte(sessionLogsTable.sessionDate, start),
    lte(sessionLogsTable.sessionDate, end),
    isNull(sessionLogsTable.deletedAt),
  ];
  if (serviceTypeId) sessConditions.push(eq(sessionLogsTable.serviceTypeId, serviceTypeId));

  const [reqs, sessions] = await Promise.all([
    db.select({
      studentId: serviceRequirementsTable.studentId,
      serviceTypeName: serviceTypesTable.name,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
    }).from(serviceRequirementsTable)
      .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
      .where(and(...reqConditions)),

    db.select({
      studentId: sessionLogsTable.studentId,
      serviceTypeName: serviceTypesTable.name,
      status: sessionLogsTable.status,
      durationMinutes: sessionLogsTable.durationMinutes,
    }).from(sessionLogsTable)
      .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
      .where(and(...sessConditions)),
  ]);

  const sessionMap = new Map<string, { delivered: number; completed: number; missed: number }>();
  for (const s of sessions) {
    const key = `${s.studentId}|${s.serviceTypeName ?? ""}`;
    if (!sessionMap.has(key)) sessionMap.set(key, { delivered: 0, completed: 0, missed: 0 });
    const e = sessionMap.get(key)!;
    if (s.status === "completed" || s.status === "makeup") {
      e.completed++;
      e.delivered += s.durationMinutes ?? 0;
    } else if (s.status === "missed") {
      e.missed++;
    }
  }

  const reqsByStudent = new Map<number, typeof reqs>();
  for (const r of reqs) {
    if (!reqsByStudent.has(r.studentId)) reqsByStudent.set(r.studentId, []);
    reqsByStudent.get(r.studentId)!.push(r);
  }

  return { students, reqsByStudent, sessionMap };
}

export async function fetchProviderSessionData(
  districtId: number | null,
  opts: { start: string; end: string; schoolId?: number | null; providerId?: number | null; serviceTypeId?: number | null },
) {
  const { start, end, schoolId, providerId, serviceTypeId } = opts;

  const staffConditions: SQL[] = [isNull(staffTable.deletedAt), eq(staffTable.status, "active")];
  if (districtId !== null) {
    staffConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${districtId})`);
  }
  if (schoolId) staffConditions.push(eq(staffTable.schoolId, schoolId));
  if (providerId) staffConditions.push(eq(staffTable.id, providerId));

  const staffMembers = await db.select({
    id: staffTable.id,
    firstName: staffTable.firstName,
    lastName: staffTable.lastName,
    role: staffTable.role,
    schoolName: schoolsTable.name,
  }).from(staffTable)
    .leftJoin(schoolsTable, eq(schoolsTable.id, staffTable.schoolId))
    .where(and(...staffConditions))
    .orderBy(asc(staffTable.lastName));

  if (staffMembers.length === 0) {
    return { staffMembers, sessionData: [] as Array<{ staffId: number | null; serviceTypeName: string | null; status: string; durationMinutes: number | null; studentId: number | null }> };
  }

  const staffIds = staffMembers.map(s => s.id);
  const staffIdList = sql.join(staffIds.map(id => sql`${id}`), sql`, `);

  const sessConditions: SQL[] = [
    sql`${sessionLogsTable.staffId} IN (${staffIdList})`,
    gte(sessionLogsTable.sessionDate, start),
    lte(sessionLogsTable.sessionDate, end),
    isNull(sessionLogsTable.deletedAt),
  ];
  if (serviceTypeId) sessConditions.push(eq(sessionLogsTable.serviceTypeId, serviceTypeId));

  const sessionData = await db.select({
    staffId: sessionLogsTable.staffId,
    serviceTypeName: serviceTypesTable.name,
    status: sessionLogsTable.status,
    durationMinutes: sessionLogsTable.durationMinutes,
    studentId: sessionLogsTable.studentId,
  }).from(sessionLogsTable)
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
    .where(and(...sessConditions));

  return { staffMembers, sessionData };
}

export async function fetchStudentRosterData(
  districtId: number | null,
  opts: { schoolId?: number | null; statusFilter?: string },
) {
  const { schoolId, statusFilter = "active" } = opts;

  const conditions: SQL[] = [isNull(studentsTable.deletedAt)];
  if (statusFilter !== "all") conditions.push(eq(studentsTable.status, statusFilter));
  if (districtId !== null) {
    conditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${districtId})`);
  }
  if (schoolId) conditions.push(eq(studentsTable.schoolId, schoolId));

  const students = await db.select({
    id: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
    grade: studentsTable.grade,
    dateOfBirth: studentsTable.dateOfBirth,
    status: studentsTable.status,
    disabilityCategory: studentsTable.disabilityCategory,
    placementType: studentsTable.placementType,
    schoolName: schoolsTable.name,
    enrolledAt: studentsTable.enrolledAt,
  }).from(studentsTable)
    .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .where(and(...conditions))
    .orderBy(asc(studentsTable.lastName));

  const sIds = students.map(s => s.id);
  const idList = sIds.length > 0 ? sql.join(sIds.map(id => sql`${id}`), sql`, `) : sql`0`;

  const iepRows = sIds.length > 0 ? await db.select({
    studentId: iepDocumentsTable.studentId,
    iepStartDate: iepDocumentsTable.iepStartDate,
    iepEndDate: iepDocumentsTable.iepEndDate,
    status: iepDocumentsTable.status,
  }).from(iepDocumentsTable)
    .where(and(eq(iepDocumentsTable.active, true), sql`${iepDocumentsTable.studentId} IN (${idList})`)) : [];

  const iepMap = new Map<number, typeof iepRows[0]>();
  for (const r of iepRows) iepMap.set(r.studentId, r);

  return { students, iepMap };
}

export async function fetchCaseloadData(
  districtId: number | null,
  opts: { schoolId?: number | null },
) {
  const { schoolId } = opts;

  const staffConditions: SQL[] = [isNull(staffTable.deletedAt), eq(staffTable.status, "active")];
  if (districtId !== null) {
    staffConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${districtId})`);
  }
  if (schoolId) staffConditions.push(eq(staffTable.schoolId, schoolId));

  const staffMembers = await db.select({
    id: staffTable.id,
    firstName: staffTable.firstName,
    lastName: staffTable.lastName,
    role: staffTable.role,
    schoolName: schoolsTable.name,
  }).from(staffTable)
    .leftJoin(schoolsTable, eq(schoolsTable.id, staffTable.schoolId))
    .where(and(...staffConditions))
    .orderBy(asc(staffTable.lastName));

  const staffIds = staffMembers.map(s => s.id);
  const staffIdList = staffIds.length > 0 ? sql.join(staffIds.map(id => sql`${id}`), sql`, `) : sql`0`;

  const assignments = staffIds.length > 0 ? await db.select({
    staffId: staffAssignmentsTable.staffId,
    studentId: staffAssignmentsTable.studentId,
    assignmentType: staffAssignmentsTable.assignmentType,
  }).from(staffAssignmentsTable)
    .where(sql`${staffAssignmentsTable.staffId} IN (${staffIdList})`) : [];

  return { staffMembers, assignments };
}
