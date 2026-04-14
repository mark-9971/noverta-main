import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  staffTable, studentsTable, serviceRequirementsTable,
  sessionLogsTable, serviceTypesTable, schoolsTable,
} from "@workspace/db";
import { eq, and, sql, gte, lte, count, sum, type SQL } from "drizzle-orm";

const router: IRouter = Router();

function parseSchoolDistrictFilters(query: Record<string, unknown>) {
  return {
    schoolId: query.schoolId ? Number(query.schoolId) : undefined,
    districtId: query.districtId ? Number(query.districtId) : undefined,
  };
}

router.get("/resource-management/caseload", async (req, res): Promise<void> => {
  const filters = parseSchoolDistrictFilters(req.query);

  const schoolConditions: ReturnType<typeof eq>[] = [];
  if (filters.schoolId) schoolConditions.push(eq(schoolsTable.id, filters.schoolId));
  if (filters.districtId) schoolConditions.push(eq(schoolsTable.districtId, filters.districtId));

  const schools = schoolConditions.length > 0
    ? await db.select().from(schoolsTable).where(and(...schoolConditions))
    : await db.select().from(schoolsTable);

  const activeStaff = await db.select({
    id: staffTable.id,
    firstName: staffTable.firstName,
    lastName: staffTable.lastName,
    role: staffTable.role,
    schoolId: staffTable.schoolId,
    hourlyRate: staffTable.hourlyRate,
    annualSalary: staffTable.annualSalary,
  }).from(staffTable).where(eq(staffTable.status, "active"));

  const activeSRs = await db.select({
    id: serviceRequirementsTable.id,
    studentId: serviceRequirementsTable.studentId,
    serviceTypeId: serviceRequirementsTable.serviceTypeId,
    providerId: serviceRequirementsTable.providerId,
    requiredMinutes: serviceRequirementsTable.requiredMinutes,
  }).from(serviceRequirementsTable).where(eq(serviceRequirementsTable.active, true));

  const activeStudents = await db.select({
    id: studentsTable.id,
    schoolId: studentsTable.schoolId,
  }).from(studentsTable).where(eq(studentsTable.status, "active"));

  const serviceTypes = await db.select({
    id: serviceTypesTable.id,
    name: serviceTypesTable.name,
  }).from(serviceTypesTable);
  const stMap = new Map(serviceTypes.map(st => [st.id, st.name]));

  const ROLE_SERVICE_MAP: Record<string, number[]> = {};
  const namePatterns: [string, string[]][] = [
    ["bcba", ["ABA", "BCBA", "Behavior"]],
    ["slp", ["Speech", "Language", "SLP"]],
    ["ot", ["Occupational", "OT"]],
    ["pt", ["Physical Therapy", "PT"]],
    ["counselor", ["Counseling", "Social Work", "Adjustment"]],
    ["para", ["Para", "1:1", "Direct Support"]],
  ];
  for (const st of serviceTypes) {
    const upper = st.name.toUpperCase();
    for (const [role, patterns] of namePatterns) {
      if (patterns.some(p => upper.includes(p.toUpperCase()))) {
        if (!ROLE_SERVICE_MAP[role]) ROLE_SERVICE_MAP[role] = [];
        if (!ROLE_SERVICE_MAP[role].includes(st.id)) ROLE_SERVICE_MAP[role].push(st.id);
      }
    }
  }

  const providerRoles = ["bcba", "slp", "ot", "pt", "counselor", "para"];

  const schoolResults = schools.map(school => {
    const schoolStaff = activeStaff.filter(s => s.schoolId === school.id);
    const schoolStudents = activeStudents.filter(s => s.schoolId === school.id);
    const schoolStudentIds = new Set(schoolStudents.map(s => s.id));
    const schoolSRs = activeSRs.filter(sr => schoolStudentIds.has(sr.studentId));

    const byRole = providerRoles.map(role => {
      const roleStaff = schoolStaff.filter(s => s.role === role);
      const roleServiceTypeIds = ROLE_SERVICE_MAP[role] || [];
      const roleSRs = schoolSRs.filter(sr => roleServiceTypeIds.includes(sr.serviceTypeId));
      const studentsServed = new Set(roleSRs.map(sr => sr.studentId)).size;
      const totalRequiredMonthly = roleSRs.reduce((sum, sr) => sum + sr.requiredMinutes, 0);
      const totalRequiredWeekly = Math.round(totalRequiredMonthly / 4.3);
      const fteCount = roleStaff.length;
      const capacityWeekly = fteCount * 40 * 60;
      const utilizationPct = capacityWeekly > 0 ? Math.round((totalRequiredWeekly / capacityWeekly) * 100) : 0;
      const unfilledMinutesWeekly = Math.max(0, totalRequiredWeekly - capacityWeekly);

      return {
        role,
        fteCount,
        studentsServed,
        avgCaseload: fteCount > 0 ? Math.round((studentsServed / fteCount) * 10) / 10 : 0,
        totalRequiredWeeklyMinutes: totalRequiredWeekly,
        capacityWeeklyMinutes: capacityWeekly,
        utilizationPercent: utilizationPct,
        unfilledWeeklyMinutes: unfilledMinutesWeekly,
        status: utilizationPct > 100 ? "over_capacity" : utilizationPct > 80 ? "high_load" : utilizationPct > 40 ? "balanced" : "under_utilized",
      };
    });

    return {
      schoolId: school.id,
      schoolName: school.name,
      totalStudents: schoolStudents.length,
      totalProviders: schoolStaff.filter(s => providerRoles.includes(s.role)).length,
      totalStaff: schoolStaff.length,
      byRole,
    };
  });

  res.json({ schools: schoolResults });
});

router.get("/resource-management/provider-utilization", async (req, res): Promise<void> => {
  const filters = parseSchoolDistrictFilters(req.query);

  const staffConditions: (SQL | ReturnType<typeof eq>)[] = [eq(staffTable.status, "active")];
  if (filters.schoolId) staffConditions.push(eq(staffTable.schoolId, filters.schoolId));
  if (filters.districtId) staffConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${filters.districtId})`);

  const providerRoles = ["bcba", "slp", "ot", "pt", "counselor", "para"];
  staffConditions.push(sql`${staffTable.role} IN (${sql.join(providerRoles.map(r => sql`${r}`), sql`, `)})`);

  const providers = await db.select({
    id: staffTable.id,
    firstName: staffTable.firstName,
    lastName: staffTable.lastName,
    role: staffTable.role,
    schoolId: staffTable.schoolId,
    hourlyRate: staffTable.hourlyRate,
    annualSalary: staffTable.annualSalary,
  }).from(staffTable).where(and(...staffConditions));

  const activeSRs = await db.select({
    id: serviceRequirementsTable.id,
    studentId: serviceRequirementsTable.studentId,
    providerId: serviceRequirementsTable.providerId,
    requiredMinutes: serviceRequirementsTable.requiredMinutes,
    serviceTypeId: serviceRequirementsTable.serviceTypeId,
  }).from(serviceRequirementsTable).where(eq(serviceRequirementsTable.active, true));

  const serviceTypes = await db.select({ id: serviceTypesTable.id, name: serviceTypesTable.name }).from(serviceTypesTable);
  const stMap = new Map(serviceTypes.map(st => [st.id, st.name]));

  const schoolRows = await db.select({ id: schoolsTable.id, name: schoolsTable.name }).from(schoolsTable);
  const schoolMap = new Map(schoolRows.map(s => [s.id, s.name]));

  const result = providers.map(p => {
    const provSRs = activeSRs.filter(sr => sr.providerId === p.id);
    const studentsServed = new Set(provSRs.map(sr => sr.studentId)).size;
    const totalRequiredMonthly = provSRs.reduce((sum, sr) => sum + sr.requiredMinutes, 0);
    const scheduledWeeklyMinutes = Math.round(totalRequiredMonthly / 4.3);
    const capacityWeeklyMinutes = 40 * 60;
    const utilizationPct = Math.round((scheduledWeeklyMinutes / capacityWeeklyMinutes) * 100);

    const serviceBreakdown = [...new Set(provSRs.map(sr => sr.serviceTypeId))].map(stId => {
      const srs = provSRs.filter(sr => sr.serviceTypeId === stId);
      return {
        serviceType: stMap.get(stId) || "Unknown",
        studentCount: new Set(srs.map(s => s.studentId)).size,
        weeklyMinutes: Math.round(srs.reduce((sum, sr) => sum + sr.requiredMinutes, 0) / 4.3),
      };
    });

    return {
      staffId: p.id,
      name: `${p.firstName} ${p.lastName}`,
      role: p.role,
      schoolName: schoolMap.get(p.schoolId ?? 0) ?? "Unassigned",
      hourlyRate: p.hourlyRate ? parseFloat(p.hourlyRate) : null,
      studentsServed,
      scheduledWeeklyMinutes,
      capacityWeeklyMinutes,
      utilizationPercent: utilizationPct,
      status: utilizationPct > 100 ? "over_capacity" : utilizationPct > 80 ? "high_load" : utilizationPct > 40 ? "balanced" : "under_utilized",
      serviceBreakdown,
    };
  });

  result.sort((a, b) => b.utilizationPercent - a.utilizationPercent);
  res.json(result);
});

router.get("/resource-management/rebalancing", async (req, res): Promise<void> => {
  const filters = parseSchoolDistrictFilters(req.query);

  const staffConditions: (SQL | ReturnType<typeof eq>)[] = [eq(staffTable.status, "active")];
  if (filters.schoolId) staffConditions.push(eq(staffTable.schoolId, filters.schoolId));
  if (filters.districtId) staffConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${filters.districtId})`);

  const providerRoles = ["bcba", "slp", "ot", "pt", "counselor", "para"];
  staffConditions.push(sql`${staffTable.role} IN (${sql.join(providerRoles.map(r => sql`${r}`), sql`, `)})`);

  const providers = await db.select({
    id: staffTable.id,
    firstName: staffTable.firstName,
    lastName: staffTable.lastName,
    role: staffTable.role,
    schoolId: staffTable.schoolId,
  }).from(staffTable).where(and(...staffConditions));

  const activeSRs = await db.select({
    providerId: serviceRequirementsTable.providerId,
    requiredMinutes: serviceRequirementsTable.requiredMinutes,
    studentId: serviceRequirementsTable.studentId,
  }).from(serviceRequirementsTable).where(eq(serviceRequirementsTable.active, true));

  const schoolRows = await db.select({ id: schoolsTable.id, name: schoolsTable.name }).from(schoolsTable);
  const schoolMap = new Map(schoolRows.map(s => [s.id, s.name]));

  const suggestions: Array<{
    role: string;
    fromSchool: string;
    toSchool: string;
    fromSchoolId: number;
    toSchoolId: number;
    reason: string;
    providerName: string;
    staffId: number;
  }> = [];

  for (const role of providerRoles) {
    const roleProviders = providers.filter(p => p.role === role);
    const bySchool = new Map<number, typeof roleProviders>();
    for (const p of roleProviders) {
      if (p.schoolId) {
        if (!bySchool.has(p.schoolId)) bySchool.set(p.schoolId, []);
        bySchool.get(p.schoolId)!.push(p);
      }
    }

    const schoolUtils = [...bySchool.entries()].map(([schoolId, schoolProviders]) => {
      const totalRequired = schoolProviders.reduce((sum, p) => {
        const pSRs = activeSRs.filter(sr => sr.providerId === p.id);
        return sum + pSRs.reduce((s, sr) => s + sr.requiredMinutes, 0);
      }, 0);
      const weeklyRequired = Math.round(totalRequired / 4.3);
      const capacity = schoolProviders.length * 40 * 60;
      const utilPct = capacity > 0 ? Math.round((weeklyRequired / capacity) * 100) : 0;
      return { schoolId, utilPct, providers: schoolProviders, weeklyRequired, capacity };
    });

    const overSchools = schoolUtils.filter(s => s.utilPct > 90);
    const underSchools = schoolUtils.filter(s => s.utilPct < 50);

    for (const over of overSchools) {
      for (const under of underSchools) {
        const leastLoaded = under.providers.reduce((best, p) => {
          const load = activeSRs.filter(sr => sr.providerId === p.id).reduce((s, sr) => s + sr.requiredMinutes, 0);
          const bestLoad = activeSRs.filter(sr => sr.providerId === best.id).reduce((s, sr) => s + sr.requiredMinutes, 0);
          return load < bestLoad ? p : best;
        }, under.providers[0]);

        if (leastLoaded) {
          suggestions.push({
            role,
            fromSchool: schoolMap.get(under.schoolId) || "Unknown",
            toSchool: schoolMap.get(over.schoolId) || "Unknown",
            fromSchoolId: under.schoolId,
            toSchoolId: over.schoolId,
            reason: `${schoolMap.get(over.schoolId)} has ${over.utilPct}% utilization for ${role} while ${schoolMap.get(under.schoolId)} is at ${under.utilPct}%`,
            providerName: `${leastLoaded.firstName} ${leastLoaded.lastName}`,
            staffId: leastLoaded.id,
          });
        }
      }
    }
  }

  res.json(suggestions);
});

router.get("/resource-management/budget", async (req, res): Promise<void> => {
  const filters = parseSchoolDistrictFilters(req.query);

  const staffConditions: (SQL | ReturnType<typeof eq>)[] = [eq(staffTable.status, "active")];
  if (filters.schoolId) staffConditions.push(eq(staffTable.schoolId, filters.schoolId));
  if (filters.districtId) staffConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${filters.districtId})`);

  const allStaff = await db.select({
    id: staffTable.id,
    firstName: staffTable.firstName,
    lastName: staffTable.lastName,
    role: staffTable.role,
    schoolId: staffTable.schoolId,
    hourlyRate: staffTable.hourlyRate,
    annualSalary: staffTable.annualSalary,
  }).from(staffTable).where(and(...staffConditions));

  const activeSRs = await db.select({
    studentId: serviceRequirementsTable.studentId,
    serviceTypeId: serviceRequirementsTable.serviceTypeId,
    providerId: serviceRequirementsTable.providerId,
    requiredMinutes: serviceRequirementsTable.requiredMinutes,
  }).from(serviceRequirementsTable).where(eq(serviceRequirementsTable.active, true));

  const today = new Date().toISOString().substring(0, 10);
  const yearStart = `${new Date().getFullYear() - 1}-09-01`;

  let sessionConditions: (SQL | ReturnType<typeof eq>)[] = [
    eq(sessionLogsTable.status, "completed"),
    gte(sessionLogsTable.sessionDate, yearStart),
    lte(sessionLogsTable.sessionDate, today),
  ];
  if (filters.schoolId) sessionConditions.push(sql`${sessionLogsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${filters.schoolId})`);
  if (filters.districtId) sessionConditions.push(sql`${sessionLogsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${filters.districtId}))`);

  const deliveredSessions = await db.select({
    staffId: sessionLogsTable.staffId,
    studentId: sessionLogsTable.studentId,
    serviceTypeId: sessionLogsTable.serviceTypeId,
    totalMinutes: sql<number>`sum(${sessionLogsTable.durationMinutes})`,
  }).from(sessionLogsTable)
    .where(and(...sessionConditions))
    .groupBy(sessionLogsTable.staffId, sessionLogsTable.studentId, sessionLogsTable.serviceTypeId);

  const serviceTypes = await db.select({ id: serviceTypesTable.id, name: serviceTypesTable.name }).from(serviceTypesTable);
  const stMap = new Map(serviceTypes.map(st => [st.id, st.name]));

  const schoolRows = await db.select({ id: schoolsTable.id, name: schoolsTable.name }).from(schoolsTable);
  const schoolMap = new Map(schoolRows.map(s => [s.id, s.name]));

  const students = await db.select({
    id: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
    schoolId: studentsTable.schoolId,
  }).from(studentsTable).where(eq(studentsTable.status, "active"));
  const studentMap = new Map(students.map(s => [s.id, s]));

  const staffRateMap = new Map(allStaff.map(s => [s.id, s.hourlyRate ? parseFloat(s.hourlyRate) : 0]));

  // Cost by student
  const studentCosts: Record<number, { name: string; schoolId: number | null; totalCost: number; totalMinutes: number; services: Record<string, { minutes: number; cost: number }> }> = {};
  for (const ds of deliveredSessions) {
    const rate = staffRateMap.get(ds.staffId ?? 0) || 0;
    const mins = Number(ds.totalMinutes);
    const cost = (mins / 60) * rate;
    const stName = stMap.get(ds.serviceTypeId ?? 0) || "Unknown";
    const student = studentMap.get(ds.studentId);
    if (!student) continue;

    if (!studentCosts[ds.studentId]) {
      studentCosts[ds.studentId] = {
        name: `${student.firstName} ${student.lastName}`,
        schoolId: student.schoolId,
        totalCost: 0,
        totalMinutes: 0,
        services: {},
      };
    }
    studentCosts[ds.studentId].totalCost += cost;
    studentCosts[ds.studentId].totalMinutes += mins;
    if (!studentCosts[ds.studentId].services[stName]) {
      studentCosts[ds.studentId].services[stName] = { minutes: 0, cost: 0 };
    }
    studentCosts[ds.studentId].services[stName].minutes += mins;
    studentCosts[ds.studentId].services[stName].cost += cost;
  }

  const costByStudent = Object.entries(studentCosts).map(([sid, data]) => ({
    studentId: Number(sid),
    name: data.name,
    schoolName: schoolMap.get(data.schoolId ?? 0) || "Unknown",
    totalCost: Math.round(data.totalCost * 100) / 100,
    totalMinutes: data.totalMinutes,
    services: Object.entries(data.services).map(([svc, d]) => ({
      serviceType: svc,
      minutes: d.minutes,
      cost: Math.round(d.cost * 100) / 100,
    })),
  })).sort((a, b) => b.totalCost - a.totalCost);

  // Cost by service type
  const svcCosts: Record<string, { minutes: number; cost: number; studentCount: Set<number> }> = {};
  for (const ds of deliveredSessions) {
    const rate = staffRateMap.get(ds.staffId ?? 0) || 0;
    const mins = Number(ds.totalMinutes);
    const cost = (mins / 60) * rate;
    const stName = stMap.get(ds.serviceTypeId ?? 0) || "Unknown";
    if (!svcCosts[stName]) svcCosts[stName] = { minutes: 0, cost: 0, studentCount: new Set() };
    svcCosts[stName].minutes += mins;
    svcCosts[stName].cost += cost;
    svcCosts[stName].studentCount.add(ds.studentId);
  }

  const costByServiceType = Object.entries(svcCosts).map(([svc, d]) => ({
    serviceType: svc,
    totalMinutes: d.minutes,
    totalCost: Math.round(d.cost * 100) / 100,
    studentCount: d.studentCount.size,
    avgCostPerStudent: d.studentCount.size > 0 ? Math.round((d.cost / d.studentCount.size) * 100) / 100 : 0,
  })).sort((a, b) => b.totalCost - a.totalCost);

  // Cost by school
  const schoolCosts: Record<number, { minutes: number; cost: number; studentCount: Set<number> }> = {};
  for (const ds of deliveredSessions) {
    const student = studentMap.get(ds.studentId);
    if (!student?.schoolId) continue;
    const rate = staffRateMap.get(ds.staffId ?? 0) || 0;
    const mins = Number(ds.totalMinutes);
    const cost = (mins / 60) * rate;
    if (!schoolCosts[student.schoolId]) schoolCosts[student.schoolId] = { minutes: 0, cost: 0, studentCount: new Set() };
    schoolCosts[student.schoolId].minutes += mins;
    schoolCosts[student.schoolId].cost += cost;
    schoolCosts[student.schoolId].studentCount.add(ds.studentId);
  }

  const costBySchool = Object.entries(schoolCosts).map(([sid, d]) => ({
    schoolId: Number(sid),
    schoolName: schoolMap.get(Number(sid)) || "Unknown",
    totalMinutes: d.minutes,
    totalCost: Math.round(d.cost * 100) / 100,
    studentCount: d.studentCount.size,
    avgCostPerStudent: d.studentCount.size > 0 ? Math.round((d.cost / d.studentCount.size) * 100) / 100 : 0,
  })).sort((a, b) => b.totalCost - a.totalCost);

  // Staff cost summary
  const totalServiceCost = costByServiceType.reduce((s, d) => s + d.totalCost, 0);
  const totalAnnualSalary = allStaff.reduce((s, staff) => s + (staff.annualSalary ? parseFloat(staff.annualSalary) : 0), 0);

  res.json({
    summary: {
      totalDeliveredMinutes: deliveredSessions.reduce((s, d) => s + Number(d.totalMinutes), 0),
      totalServiceCost: Math.round(totalServiceCost * 100) / 100,
      totalAnnualSalary: Math.round(totalAnnualSalary),
      totalStaff: allStaff.length,
      totalStudentsServed: new Set(deliveredSessions.map(d => d.studentId)).size,
      avgCostPerStudent: costByStudent.length > 0 ? Math.round((totalServiceCost / costByStudent.length) * 100) / 100 : 0,
    },
    costByStudent,
    costByServiceType,
    costBySchool,
  });
});

router.patch("/staff/:id/rates", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { hourlyRate, annualSalary } = req.body || {};
  const updates: { hourlyRate?: string; annualSalary?: string } = {};
  if (hourlyRate !== undefined) updates.hourlyRate = String(hourlyRate);
  if (annualSalary !== undefined) updates.annualSalary = String(annualSalary);

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No rate fields provided" });
    return;
  }

  const [updated] = await db.update(staffTable).set(updates).where(eq(staffTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Staff not found" });
    return;
  }
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

export default router;
