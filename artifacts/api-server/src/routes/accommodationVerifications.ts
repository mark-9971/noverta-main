import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  iepAccommodationsTable,
  accommodationVerificationsTable,
  staffTable,
  studentsTable,
} from "@workspace/db";
import { eq, and, desc, sql, isNull, gte } from "drizzle-orm";
import { logAudit } from "../lib/auditLog";
import { assertCaseloadAccess } from "../lib/tenantAccess";
import { getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";

const VERIFICATION_WINDOW_DAYS = 30;

const VALID_STATUSES = ["verified", "partial", "not_implemented", "not_applicable"] as const;

const COMPLIANT_STATUSES = ["verified", "partial", "not_applicable"] as const;

interface ComplianceRow {
  studentId: string;
  firstName: string;
  lastName: string;
  grade: string | null;
  totalAccommodations: string;
  verifiedCount: string;
  overdueCount: string;
  verificationRate: string;
  lastVerifiedAt: string | null;
}

const router: IRouter = Router();

router.get("/students/:studentId/accommodation-summary", async (req, res): Promise<void> => {
  const studentId = Number(req.params.studentId);
  if (!Number.isFinite(studentId) || studentId <= 0) {
    res.status(400).json({ error: "Invalid student ID" });
    return;
  }

  if (!await assertCaseloadAccess(req, studentId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const accommodations = await db
    .select({
      id: iepAccommodationsTable.id,
      studentId: iepAccommodationsTable.studentId,
      category: iepAccommodationsTable.category,
      description: iepAccommodationsTable.description,
      setting: iepAccommodationsTable.setting,
      frequency: iepAccommodationsTable.frequency,
      provider: iepAccommodationsTable.provider,
      verificationScheduleDays: iepAccommodationsTable.verificationScheduleDays,
      active: iepAccommodationsTable.active,
      createdAt: iepAccommodationsTable.createdAt,
    })
    .from(iepAccommodationsTable)
    .where(and(
      eq(iepAccommodationsTable.studentId, studentId),
      eq(iepAccommodationsTable.active, true),
    ))
    .orderBy(iepAccommodationsTable.setting, iepAccommodationsTable.id);

  const defaultWindowStart = new Date();
  defaultWindowStart.setDate(defaultWindowStart.getDate() - VERIFICATION_WINDOW_DAYS);

  const maxScheduleDays = Math.max(...accommodations.map(a => a.verificationScheduleDays ?? VERIFICATION_WINDOW_DAYS), VERIFICATION_WINDOW_DAYS);
  const broadWindowStart = new Date();
  broadWindowStart.setDate(broadWindowStart.getDate() - maxScheduleDays);

  const recentVerifications = accommodations.length > 0
    ? await db
        .select({
          id: accommodationVerificationsTable.id,
          accommodationId: accommodationVerificationsTable.accommodationId,
          verifiedByStaffId: accommodationVerificationsTable.verifiedByStaffId,
          status: accommodationVerificationsTable.status,
          notes: accommodationVerificationsTable.notes,
          periodStart: accommodationVerificationsTable.periodStart,
          periodEnd: accommodationVerificationsTable.periodEnd,
          createdAt: accommodationVerificationsTable.createdAt,
          staffFirst: staffTable.firstName,
          staffLast: staffTable.lastName,
          staffRole: staffTable.role,
        })
        .from(accommodationVerificationsTable)
        .leftJoin(staffTable, eq(staffTable.id, accommodationVerificationsTable.verifiedByStaffId))
        .where(and(
          sql`${accommodationVerificationsTable.accommodationId} IN (${sql.join(accommodations.map(a => sql`${a.id}`), sql`, `)})`,
          gte(accommodationVerificationsTable.createdAt, broadWindowStart),
        ))
        .orderBy(desc(accommodationVerificationsTable.createdAt))
    : [];

  const verificationsByAccommodation = new Map<number, typeof recentVerifications>();
  for (const v of recentVerifications) {
    if (!verificationsByAccommodation.has(v.accommodationId)) {
      verificationsByAccommodation.set(v.accommodationId, []);
    }
    verificationsByAccommodation.get(v.accommodationId)!.push(v);
  }

  const student = await db
    .select({ firstName: studentsTable.firstName, lastName: studentsTable.lastName, grade: studentsTable.grade })
    .from(studentsTable)
    .where(eq(studentsTable.id, studentId))
    .then(rows => rows[0]);

  const enriched = accommodations.map(a => {
    const scheduleDays = a.verificationScheduleDays ?? VERIFICATION_WINDOW_DAYS;
    const accWindowStart = new Date();
    accWindowStart.setDate(accWindowStart.getDate() - scheduleDays);

    const accVerifications = verificationsByAccommodation.get(a.id) ?? [];
    const inWindowVerifications = accVerifications.filter(v => new Date(v.createdAt) >= accWindowStart);

    const hasCompliant = inWindowVerifications.some(
      v => (COMPLIANT_STATUSES as readonly string[]).includes(v.status)
    );

    const lastV = accVerifications[0];
    return {
      ...a,
      verificationScheduleDays: scheduleDays,
      createdAt: a.createdAt.toISOString(),
      lastVerification: lastV
        ? {
            ...lastV,
            createdAt: lastV.createdAt.toISOString(),
            verifierName: lastV.staffFirst
              ? `${lastV.staffFirst} ${lastV.staffLast}`
              : null,
          }
        : null,
      verificationCount: inWindowVerifications.length,
      isCompliant: hasCompliant,
      isOverdue: !hasCompliant,
    };
  });

  const groupedBySetting: Record<string, typeof enriched> = {};
  for (const a of enriched) {
    const key = a.setting || "general";
    if (!groupedBySetting[key]) groupedBySetting[key] = [];
    groupedBySetting[key].push(a);
  }

  res.json({
    studentId,
    studentName: student ? `${student.firstName} ${student.lastName}` : null,
    studentGrade: student?.grade ?? null,
    totalAccommodations: accommodations.length,
    verifiedCount: enriched.filter(a => a.isCompliant).length,
    overdueCount: enriched.filter(a => a.isOverdue).length,
    verificationRate: accommodations.length > 0
      ? Math.round((enriched.filter(a => !a.isOverdue).length / accommodations.length) * 100)
      : 100,
    accommodationsBySetting: groupedBySetting,
  });
});

router.post("/accommodations/:accommodationId/verify", async (req, res): Promise<void> => {
  const accommodationId = Number(req.params.accommodationId);
  if (!Number.isFinite(accommodationId) || accommodationId <= 0) {
    res.status(400).json({ error: "Invalid accommodation ID" });
    return;
  }

  const [accommodation] = await db
    .select({ id: iepAccommodationsTable.id, studentId: iepAccommodationsTable.studentId })
    .from(iepAccommodationsTable)
    .where(eq(iepAccommodationsTable.id, accommodationId));

  if (!accommodation) {
    res.status(404).json({ error: "Accommodation not found" });
    return;
  }

  if (!await assertCaseloadAccess(req, accommodation.studentId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const authed = req as AuthedRequest;
  const staffId = authed.tenantStaffId;
  if (!staffId) {
    res.status(403).json({ error: "Staff identity required" });
    return;
  }

  const { status, notes, periodStart, periodEnd } = req.body ?? {};
  const finalStatus = (VALID_STATUSES as readonly string[]).includes(status) ? status : "verified";

  const [row] = await db.insert(accommodationVerificationsTable).values({
    accommodationId,
    verifiedByStaffId: staffId,
    status: finalStatus,
    notes: typeof notes === "string" ? notes.slice(0, 2000) : null,
    periodStart: typeof periodStart === "string" ? periodStart : null,
    periodEnd: typeof periodEnd === "string" ? periodEnd : null,
  }).returning();

  logAudit(req, {
    action: "create",
    targetTable: "accommodation_verifications",
    targetId: row.id,
    studentId: accommodation.studentId,
    summary: `Verified accommodation #${accommodationId} for student #${accommodation.studentId} as ${finalStatus}`,
  });

  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.get("/accommodations/:accommodationId/verifications", async (req, res): Promise<void> => {
  const accommodationId = Number(req.params.accommodationId);
  if (!Number.isFinite(accommodationId) || accommodationId <= 0) {
    res.status(400).json({ error: "Invalid accommodation ID" });
    return;
  }

  const [accommodation] = await db
    .select({ studentId: iepAccommodationsTable.studentId })
    .from(iepAccommodationsTable)
    .where(eq(iepAccommodationsTable.id, accommodationId));

  if (!accommodation) {
    res.status(404).json({ error: "Accommodation not found" });
    return;
  }

  if (!await assertCaseloadAccess(req, accommodation.studentId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const verifications = await db
    .select({
      id: accommodationVerificationsTable.id,
      accommodationId: accommodationVerificationsTable.accommodationId,
      verifiedByStaffId: accommodationVerificationsTable.verifiedByStaffId,
      status: accommodationVerificationsTable.status,
      notes: accommodationVerificationsTable.notes,
      periodStart: accommodationVerificationsTable.periodStart,
      periodEnd: accommodationVerificationsTable.periodEnd,
      createdAt: accommodationVerificationsTable.createdAt,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
      staffRole: staffTable.role,
    })
    .from(accommodationVerificationsTable)
    .leftJoin(staffTable, eq(staffTable.id, accommodationVerificationsTable.verifiedByStaffId))
    .where(eq(accommodationVerificationsTable.accommodationId, accommodationId))
    .orderBy(desc(accommodationVerificationsTable.createdAt))
    .limit(50);

  res.json(verifications.map(v => ({
    ...v,
    createdAt: v.createdAt.toISOString(),
    verifierName: v.staffFirst ? `${v.staffFirst} ${v.staffLast}` : null,
  })));
});

router.get("/accommodation-compliance", async (req, res): Promise<void> => {
  const authed = req as AuthedRequest;
  const enforcedDistrictId = getEnforcedDistrictId(authed);
  const callerRole = authed.trellisRole;
  const callerStaffId = authed.tenantStaffId;

  const windowDays = req.query.windowDays
    ? Math.min(Math.max(Number(req.query.windowDays), 1), 365)
    : VERIFICATION_WINDOW_DAYS;

  const districtConditions = enforcedDistrictId !== null
    ? sql`s.school_id IN (SELECT id FROM schools WHERE district_id = ${enforcedDistrictId})`
    : sql`1=1`;

  const COMPLIANCE_BROAD_ROLES = ["admin", "coordinator"];
  const isBroadAccess = COMPLIANCE_BROAD_ROLES.includes(callerRole ?? "");

  if (!isBroadAccess && !callerStaffId) {
    res.status(403).json({ error: "Staff identity required for caseload-scoped access" });
    return;
  }

  let caseloadFilter = sql`1=1`;
  if (isBroadAccess && req.query.staffId) {
    const targetStaffId = Number(req.query.staffId);
    caseloadFilter = sql`(s.case_manager_id = ${targetStaffId} OR s.id IN (SELECT student_id FROM staff_assignments WHERE staff_id = ${targetStaffId}))`;
  } else if (!isBroadAccess && callerStaffId) {
    caseloadFilter = sql`(s.case_manager_id = ${callerStaffId} OR s.id IN (SELECT student_id FROM staff_assignments WHERE staff_id = ${callerStaffId}))`;
  }

  const rows = await db.execute(sql`
    WITH student_accommodations AS (
      SELECT
        s.id AS student_id,
        s.first_name,
        s.last_name,
        s.grade,
        ia.id AS accommodation_id,
        ia.category,
        ia.description,
        ia.setting,
        COALESCE(ia.verification_schedule_days, ${windowDays}) AS schedule_days,
        (
          SELECT COUNT(*)
          FROM accommodation_verifications av
          WHERE av.accommodation_id = ia.id
            AND av.created_at >= NOW() - MAKE_INTERVAL(days => COALESCE(ia.verification_schedule_days, ${windowDays}))
            AND av.status IN ('verified', 'partial', 'not_applicable')
        ) AS recent_verification_count,
        (
          SELECT av.created_at
          FROM accommodation_verifications av
          WHERE av.accommodation_id = ia.id
          ORDER BY av.created_at DESC
          LIMIT 1
        ) AS last_verified_at
      FROM students s
      JOIN iep_accommodations ia ON ia.student_id = s.id AND ia.active = true
      WHERE s.status = 'active'
        AND s.deleted_at IS NULL
        AND ${districtConditions}
        AND ${caseloadFilter}
    )
    SELECT
      student_id AS "studentId",
      first_name AS "firstName",
      last_name AS "lastName",
      grade,
      COUNT(*) AS "totalAccommodations",
      COUNT(*) FILTER (WHERE recent_verification_count > 0) AS "verifiedCount",
      COUNT(*) FILTER (WHERE recent_verification_count = 0) AS "overdueCount",
      CASE
        WHEN COUNT(*) = 0 THEN 100
        ELSE ROUND(COUNT(*) FILTER (WHERE recent_verification_count > 0) * 100.0 / COUNT(*))
      END AS "verificationRate",
      MAX(last_verified_at) AS "lastVerifiedAt"
    FROM student_accommodations
    GROUP BY student_id, first_name, last_name, grade
    ORDER BY "overdueCount" DESC, last_name, first_name
  `);

  const typedRows = rows.rows as ComplianceRow[];
  const totalStudents = typedRows.length;
  const fullyVerified = typedRows.filter(r => Number(r.overdueCount) === 0).length;

  const overallComplianceRate = totalStudents > 0
    ? Math.round(fullyVerified * 100 / totalStudents)
    : 100;

  res.json({
    districtId: enforcedDistrictId,
    totalStudents,
    overallComplianceRate,
    verificationWindowDays: windowDays,
    students: typedRows.map(r => ({
      studentId: Number(r.studentId),
      studentName: `${r.firstName} ${r.lastName}`.trim(),
      grade: r.grade,
      totalAccommodations: Number(r.totalAccommodations),
      verifiedCount: Number(r.verifiedCount),
      overdueCount: Number(r.overdueCount),
      complianceRate: Number(r.verificationRate),
      lastVerified: r.lastVerifiedAt ? new Date(r.lastVerifiedAt).toISOString() : null,
    })),
  });
});

router.get("/students/:studentId/accommodation-card", async (req, res): Promise<void> => {
  const studentId = Number(req.params.studentId);
  if (!Number.isFinite(studentId) || studentId <= 0) {
    res.status(400).json({ error: "Invalid student ID" });
    return;
  }

  if (!await assertCaseloadAccess(req, studentId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const student = await db
    .select({
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
    })
    .from(studentsTable)
    .where(and(eq(studentsTable.id, studentId), isNull(studentsTable.deletedAt)))
    .then(rows => rows[0]);

  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const accommodations = await db
    .select({
      id: iepAccommodationsTable.id,
      category: iepAccommodationsTable.category,
      description: iepAccommodationsTable.description,
      setting: iepAccommodationsTable.setting,
      frequency: iepAccommodationsTable.frequency,
      provider: iepAccommodationsTable.provider,
    })
    .from(iepAccommodationsTable)
    .where(and(
      eq(iepAccommodationsTable.studentId, studentId),
      eq(iepAccommodationsTable.active, true),
    ))
    .orderBy(iepAccommodationsTable.setting, iepAccommodationsTable.id);

  const groupedBySetting: Record<string, typeof accommodations> = {};
  for (const a of accommodations) {
    const key = a.setting || "general";
    if (!groupedBySetting[key]) groupedBySetting[key] = [];
    groupedBySetting[key].push(a);
  }

  logAudit(req, {
    action: "read",
    targetTable: "iep_accommodations",
    studentId,
    summary: `Viewed accommodation card for ${student.firstName} ${student.lastName}`,
  });

  res.json({
    studentName: `${student.firstName} ${student.lastName}`,
    grade: student.grade,
    generatedAt: new Date().toISOString(),
    totalAccommodations: accommodations.length,
    accommodationsBySetting: groupedBySetting,
  });
});

export default router;
