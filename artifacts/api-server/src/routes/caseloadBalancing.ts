import { Router } from "express";
import { db, staffTable, studentsTable, schoolsTable, serviceRequirementsTable, serviceTypesTable, staffAssignmentsTable } from "@workspace/db";
import { eq, and, sql, isNull, count, sum } from "drizzle-orm";
import { getEnforcedDistrictId, type AuthedRequest, requireRoles } from "../middlewares/auth";
import { requireTierAccess } from "../middlewares/tierGate";
import { logAudit } from "../lib/auditLog";

const router = Router();
// Path-scoped: a path-less router.use() would block every router mounted after this one in
// routes/index.ts, since Express enters this sub-router for every request that reaches it.
router.use("/caseload-balancing", requireRoles("admin", "coordinator"), requireTierAccess("district.caseload_balancing"));

const DEFAULT_THRESHOLDS: Record<string, number> = {
  bcba: 15,
  provider: 30,
  sped_teacher: 20,
  para: 10,
  case_manager: 25,
  coordinator: 40,
  teacher: 30,
  admin: 50,
};

router.get("/caseload-balancing/summary", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });

  try {
    const customThresholds: Record<string, number> = {};
    if (req.query.thresholds) {
      try {
        const parsed = JSON.parse(req.query.thresholds as string);
        if (typeof parsed === "object" && parsed !== null) {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "number" && v > 0) customThresholds[k] = v;
          }
        }
      } catch {}
    }
    const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };

    const providers = await db.select({
      id: staffTable.id,
      firstName: staffTable.firstName,
      lastName: staffTable.lastName,
      role: staffTable.role,
      title: staffTable.title,
      schoolId: staffTable.schoolId,
      schoolName: schoolsTable.name,
    })
    .from(staffTable)
    .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
    .where(and(
      eq(schoolsTable.districtId, districtId),
      eq(staffTable.status, "active"),
      isNull(staffTable.deletedAt),
    ));

    const caseloadCounts = await db.select({
      staffId: staffAssignmentsTable.staffId,
      studentCount: count(staffAssignmentsTable.studentId),
    })
    .from(staffAssignmentsTable)
    .innerJoin(studentsTable, eq(staffAssignmentsTable.studentId, studentsTable.id))
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(and(eq(studentsTable.status, "active"), eq(schoolsTable.districtId, districtId)))
    .groupBy(staffAssignmentsTable.staffId);

    const serviceMinutes = await db.select({
      providerId: serviceRequirementsTable.providerId,
      totalMinutes: sum(serviceRequirementsTable.requiredMinutes),
      serviceCount: count(serviceRequirementsTable.id),
    })
    .from(serviceRequirementsTable)
    .innerJoin(studentsTable, eq(serviceRequirementsTable.studentId, studentsTable.id))
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(and(eq(serviceRequirementsTable.active, true), eq(schoolsTable.districtId, districtId)))
    .groupBy(serviceRequirementsTable.providerId);

    const caseloadMap = new Map(caseloadCounts.map(c => [c.staffId, Number(c.studentCount)]));
    const serviceMap = new Map(serviceMinutes.map(s => [s.providerId!, { totalMinutes: Number(s.totalMinutes) || 0, serviceCount: Number(s.serviceCount) }]));

    const providerCaseloads = providers.map(p => {
      const studentCount = caseloadMap.get(p.id) || 0;
      const svc = serviceMap.get(p.id) || { totalMinutes: 0, serviceCount: 0 };
      const threshold = thresholds[p.role] || 30;
      const utilization = threshold > 0 ? Math.round((studentCount / threshold) * 100) : 0;

      let status: "balanced" | "approaching" | "overloaded" = "balanced";
      if (studentCount >= threshold) status = "overloaded";
      else if (studentCount >= threshold * 0.8) status = "approaching";

      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        role: p.role,
        title: p.title,
        schoolId: p.schoolId,
        schoolName: p.schoolName,
        studentCount,
        totalServiceMinutes: svc.totalMinutes,
        serviceCount: svc.serviceCount,
        threshold,
        utilization,
        status,
      };
    });

    providerCaseloads.sort((a, b) => b.utilization - a.utilization);

    const roleSummary: Record<string, { count: number; totalStudents: number; avgStudents: number; overloaded: number; approaching: number; threshold: number }> = {};
    for (const p of providerCaseloads) {
      if (!roleSummary[p.role]) {
        roleSummary[p.role] = { count: 0, totalStudents: 0, avgStudents: 0, overloaded: 0, approaching: 0, threshold: thresholds[p.role] || 30 };
      }
      const rs = roleSummary[p.role];
      rs.count++;
      rs.totalStudents += p.studentCount;
      if (p.status === "overloaded") rs.overloaded++;
      if (p.status === "approaching") rs.approaching++;
    }
    for (const role of Object.keys(roleSummary)) {
      roleSummary[role].avgStudents = roleSummary[role].count > 0 ? Math.round(roleSummary[role].totalStudents / roleSummary[role].count) : 0;
    }

    const overloadedCount = providerCaseloads.filter(p => p.status === "overloaded").length;
    const approachingCount = providerCaseloads.filter(p => p.status === "approaching").length;
    const balancedCount = providerCaseloads.filter(p => p.status === "balanced").length;

    res.json({
      providers: providerCaseloads,
      roleSummary,
      totals: {
        totalProviders: providerCaseloads.length,
        overloaded: overloadedCount,
        approaching: approachingCount,
        balanced: balancedCount,
      },
      thresholds,
    });
  } catch (err) {
    console.error("GET /caseload-balancing/summary error:", err);
    res.status(500).json({ error: "Failed to load caseload data" });
  }
});

router.get("/caseload-balancing/provider/:providerId/students", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });

  const providerId = parseInt(req.params.providerId, 10);
  if (!Number.isFinite(providerId)) return res.status(400).json({ error: "Invalid provider ID" });

  try {
    const [provider] = await db.select({
      id: staffTable.id,
      schoolId: staffTable.schoolId,
    }).from(staffTable)
    .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
    .where(and(eq(staffTable.id, providerId), eq(schoolsTable.districtId, districtId)));

    if (!provider) return res.status(404).json({ error: "Provider not found in your district" });

    const students = await db.select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
      schoolId: studentsTable.schoolId,
      schoolName: schoolsTable.name,
      assignmentType: staffAssignmentsTable.assignmentType,
    })
    .from(staffAssignmentsTable)
    .innerJoin(studentsTable, eq(staffAssignmentsTable.studentId, studentsTable.id))
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(and(
      eq(staffAssignmentsTable.staffId, providerId),
      eq(studentsTable.status, "active"),
      eq(schoolsTable.districtId, districtId),
    ));

    res.json({ students });
  } catch (err) {
    console.error("GET /caseload-balancing/provider/:id/students error:", err);
    res.status(500).json({ error: "Failed to load provider students" });
  }
});

router.get("/caseload-balancing/suggestions", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });

  try {
    const customThresholds: Record<string, number> = {};
    if (req.query.thresholds) {
      try {
        const parsed = JSON.parse(req.query.thresholds as string);
        if (typeof parsed === "object" && parsed !== null) {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "number" && v > 0) customThresholds[k] = v;
          }
        }
      } catch {}
    }
    const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };

    const providers = await db.select({
      id: staffTable.id,
      firstName: staffTable.firstName,
      lastName: staffTable.lastName,
      role: staffTable.role,
      schoolId: staffTable.schoolId,
      schoolName: schoolsTable.name,
    })
    .from(staffTable)
    .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
    .where(and(
      eq(schoolsTable.districtId, districtId),
      eq(staffTable.status, "active"),
      isNull(staffTable.deletedAt),
    ));

    const caseloadCounts = await db.select({
      staffId: staffAssignmentsTable.staffId,
      studentCount: count(staffAssignmentsTable.studentId),
    })
    .from(staffAssignmentsTable)
    .innerJoin(studentsTable, eq(staffAssignmentsTable.studentId, studentsTable.id))
    .where(eq(studentsTable.status, "active"))
    .groupBy(staffAssignmentsTable.staffId);

    const caseloadMap = new Map(caseloadCounts.map(c => [c.staffId, Number(c.studentCount)]));

    const providersByRole = new Map<string, Array<{ id: number; name: string; schoolId: number | null; schoolName: string; studentCount: number; threshold: number }>>();
    for (const p of providers) {
      const arr = providersByRole.get(p.role) || [];
      arr.push({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        schoolId: p.schoolId,
        schoolName: p.schoolName,
        studentCount: caseloadMap.get(p.id) || 0,
        threshold: thresholds[p.role] || 30,
      });
      providersByRole.set(p.role, arr);
    }

    const allAssignments = await db.select({
      staffId: staffAssignmentsTable.staffId,
      studentId: staffAssignmentsTable.studentId,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      studentSchoolId: studentsTable.schoolId,
    })
    .from(staffAssignmentsTable)
    .innerJoin(studentsTable, eq(staffAssignmentsTable.studentId, studentsTable.id))
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(and(
      eq(studentsTable.status, "active"),
      eq(schoolsTable.districtId, districtId),
    ));

    const studentServiceTypes = await db.select({
      studentId: serviceRequirementsTable.studentId,
      serviceTypeId: serviceRequirementsTable.serviceTypeId,
    })
    .from(serviceRequirementsTable)
    .where(eq(serviceRequirementsTable.active, true));

    const studentServicesMap = new Map<number, Set<number | null>>();
    for (const s of studentServiceTypes) {
      const set = studentServicesMap.get(s.studentId) || new Set();
      set.add(s.serviceTypeId);
      studentServicesMap.set(s.studentId, set);
    }

    const providerServicesMap = new Map<number, Set<number | null>>();
    for (const a of allAssignments) {
      const studentServices = studentServicesMap.get(a.studentId);
      if (studentServices) {
        const existing = providerServicesMap.get(a.staffId) || new Set();
        for (const s of studentServices) existing.add(s);
        providerServicesMap.set(a.staffId, existing);
      }
    }

    const assignmentsByProvider = new Map<number, typeof allAssignments>();
    for (const a of allAssignments) {
      const arr = assignmentsByProvider.get(a.staffId) || [];
      arr.push(a);
      assignmentsByProvider.set(a.staffId, arr);
    }

    const suggestions: Array<{
      fromProviderId: number;
      fromProviderName: string;
      fromStudentCount: number;
      toProviderId: number;
      toProviderName: string;
      toStudentCount: number;
      role: string;
      sameSchool: boolean;
      studentsToMove: number;
      candidateStudents: Array<{
        id: number;
        name: string;
        schoolId: number | null;
        serviceOverlap: boolean;
        sameSchool: boolean;
      }>;
    }> = [];

    for (const [role, members] of providersByRole) {
      if (members.length < 2) continue;

      const overloaded = members.filter(m => m.studentCount > m.threshold);
      const underloaded = members.filter(m => m.studentCount < m.threshold * 0.7);

      for (const over of overloaded) {
        const sameSchoolTargets = underloaded.filter(u => u.schoolId === over.schoolId);
        const targets = sameSchoolTargets.length > 0 ? sameSchoolTargets : underloaded;

        for (const target of targets.slice(0, 2)) {
          const excess = over.studentCount - over.threshold;
          const capacity = target.threshold - target.studentCount;
          const toMove = Math.min(excess, Math.floor(capacity * 0.5), 5);
          if (toMove < 1) continue;

          const overStudents = assignmentsByProvider.get(over.id) || [];
          const targetServices = providerServicesMap.get(target.id) || new Set();

          const candidates = overStudents.map(s => {
            const studentServices = studentServicesMap.get(s.studentId) || new Set();
            const hasServiceOverlap = [...studentServices].some(svc => targetServices.has(svc));
            return {
              id: s.studentId,
              name: `${s.studentFirstName} ${s.studentLastName}`,
              schoolId: s.studentSchoolId,
              serviceOverlap: hasServiceOverlap,
              sameSchool: s.studentSchoolId === target.schoolId,
            };
          });

          candidates.sort((a, b) => {
            if (a.sameSchool !== b.sameSchool) return a.sameSchool ? -1 : 1;
            if (a.serviceOverlap !== b.serviceOverlap) return a.serviceOverlap ? -1 : 1;
            return 0;
          });

          suggestions.push({
            fromProviderId: over.id,
            fromProviderName: over.name,
            fromStudentCount: over.studentCount,
            toProviderId: target.id,
            toProviderName: target.name,
            toStudentCount: target.studentCount,
            role,
            sameSchool: over.schoolId === target.schoolId,
            studentsToMove: toMove,
            candidateStudents: candidates.slice(0, toMove + 3),
          });
        }
      }
    }

    suggestions.sort((a, b) => {
      if (a.sameSchool !== b.sameSchool) return a.sameSchool ? -1 : 1;
      return b.studentsToMove - a.studentsToMove;
    });

    res.json({ suggestions });
  } catch (err) {
    console.error("GET /caseload-balancing/suggestions error:", err);
    res.status(500).json({ error: "Failed to generate suggestions" });
  }
});

router.post("/caseload-balancing/reassign", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });
  const user = req as AuthedRequest;

  const { studentId, fromProviderId, toProviderId } = req.body;
  if (!studentId || !fromProviderId || !toProviderId) {
    return res.status(400).json({ error: "studentId, fromProviderId, and toProviderId are required" });
  }

  try {
    const [fromProvider] = await db.select({ id: staffTable.id, role: staffTable.role }).from(staffTable)
      .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
      .where(and(eq(staffTable.id, fromProviderId), eq(schoolsTable.districtId, districtId)));
    const [toProvider] = await db.select({ id: staffTable.id, role: staffTable.role }).from(staffTable)
      .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
      .where(and(eq(staffTable.id, toProviderId), eq(schoolsTable.districtId, districtId)));

    if (!fromProvider || !toProvider) return res.status(404).json({ error: "Provider not found in your district" });
    if (fromProvider.role !== toProvider.role) return res.status(400).json({ error: "Cannot reassign between providers with different roles" });

    const [student] = await db.select({ id: studentsTable.id }).from(studentsTable)
      .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
      .where(and(eq(studentsTable.id, studentId), eq(schoolsTable.districtId, districtId)));
    if (!student) return res.status(404).json({ error: "Student not found in your district" });

    const [assignment] = await db.select().from(staffAssignmentsTable)
      .where(and(
        eq(staffAssignmentsTable.staffId, fromProviderId),
        eq(staffAssignmentsTable.studentId, studentId),
      ));

    if (!assignment) return res.status(404).json({ error: "No assignment found for this student-provider pair" });

    await db.update(staffAssignmentsTable)
      .set({ staffId: toProviderId })
      .where(eq(staffAssignmentsTable.id, assignment.id));

    await db.update(serviceRequirementsTable)
      .set({ providerId: toProviderId })
      .where(and(
        eq(serviceRequirementsTable.providerId, fromProviderId),
        eq(serviceRequirementsTable.studentId, studentId),
        eq(serviceRequirementsTable.active, true),
      ));

    logAudit(req, {
      action: "update",
      targetTable: "staff_assignments",
      targetId: assignment.id,
      studentId,
      summary: `Reassigned student #${studentId} from provider #${fromProviderId} to provider #${toProviderId} (caseload balancing)`,
      oldValues: { staffId: fromProviderId },
      newValues: { staffId: toProviderId },
    });

    res.json({ ok: true, message: "Student reassigned successfully" });
  } catch (err) {
    console.error("POST /caseload-balancing/reassign error:", err);
    res.status(500).json({ error: "Failed to reassign student" });
  }
});

router.get("/caseload-balancing/trends", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });

  try {
    const months = parseInt(req.query.months as string, 10) || 6;
    const lookback = new Date();
    lookback.setMonth(lookback.getMonth() - Math.min(months, 12));

    const monthlyData = await db.execute(sql`
      WITH district_staff AS (
        SELECT s.id, s.first_name, s.last_name, s.role
        FROM staff s
        INNER JOIN schools sc ON s.school_id = sc.id
        WHERE sc.district_id = ${districtId} AND s.status = 'active' AND s.deleted_at IS NULL
      ),
      months AS (
        SELECT generate_series(
          date_trunc('month', ${lookback}::timestamp),
          date_trunc('month', NOW()),
          '1 month'::interval
        ) AS month_start
      ),
      monthly_counts AS (
        SELECT
          ds.role,
          m.month_start,
          COUNT(DISTINCT st.id) AS student_count,
          COUNT(DISTINCT ds.id) AS provider_count
        FROM months m
        CROSS JOIN district_staff ds
        LEFT JOIN staff_assignments sa ON sa.staff_id = ds.id
          AND sa.created_at <= (m.month_start + '1 month'::interval)
        LEFT JOIN students st ON sa.student_id = st.id AND st.status = 'active'
        GROUP BY ds.role, m.month_start
      )
      SELECT
        role,
        to_char(month_start, 'YYYY-MM') AS month,
        student_count::int,
        provider_count::int,
        CASE WHEN provider_count > 0 THEN ROUND(student_count::numeric / provider_count, 1) ELSE 0 END AS avg_per_provider
      FROM monthly_counts
      ORDER BY month_start, role
    `);

    const trends: Record<string, Array<{ month: string; studentCount: number; providerCount: number; avgPerProvider: number }>> = {};
    for (const row of monthlyData.rows as Array<{ role: string; month: string; student_count: number; provider_count: number; avg_per_provider: number }>) {
      if (!trends[row.role]) trends[row.role] = [];
      trends[row.role].push({
        month: row.month,
        studentCount: Number(row.student_count),
        providerCount: Number(row.provider_count),
        avgPerProvider: Number(row.avg_per_provider),
      });
    }

    res.json({ trends });
  } catch (err) {
    console.error("GET /caseload-balancing/trends error:", err);
    res.status(500).json({ error: "Failed to load trend data" });
  }
});

export default router;
