import {
  db, studentsTable, staffTable, schoolsTable, serviceRequirementsTable,
  staffAssignmentsTable, scheduleBlocksTable, serviceTypesTable, iepGoalsTable,
} from "@workspace/db";
import { eq, and, isNull, sql, inArray } from "drizzle-orm";

export interface HealthCheck {
  id: string;
  category: "students" | "staff" | "services" | "schedules" | "data_quality";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  count: number;
  total: number;
  items: { id: number; label: string; detail: string }[];
}

export interface DataHealthReport {
  overallStatus: "good" | "needs_attention" | "not_ready";
  summary: {
    totalStudents: number;
    totalStaff: number;
    totalServiceReqs: number;
    totalScheduleBlocks: number;
    checksRun: number;
    passed: number;
    warnings: number;
    critical: number;
  };
  checks: HealthCheck[];
}

export async function runDataHealthChecks(districtId: number): Promise<DataHealthReport> {
  const districtSchools = await db.select({ id: schoolsTable.id }).from(schoolsTable)
    .where(eq(schoolsTable.districtId, districtId));
  const schoolIds = districtSchools.map(s => s.id);

  // Strict district scoping: only include records belonging to one of this district's schools.
  // Records with NULL school_id are intentionally excluded — they cannot be safely attributed
  // to any single district and would leak across tenants. Surface "unassigned to school" as a
  // separate platform-admin-only audit if needed, not here.
  if (schoolIds.length === 0) {
    return {
      overallStatus: "good",
      summary: { totalStudents: 0, totalStaff: 0, totalServiceReqs: 0, totalScheduleBlocks: 0, checksRun: 0, passed: 0, warnings: 0, critical: 0 },
      checks: [],
    };
  }
  const studentDistrictFilter = inArray(studentsTable.schoolId, schoolIds);
  const staffDistrictFilter = inArray(staffTable.schoolId, schoolIds);

  const allStudents = await db.select({
    id: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
    status: studentsTable.status,
    schoolId: studentsTable.schoolId,
    caseManagerId: studentsTable.caseManagerId,
    grade: studentsTable.grade,
    dateOfBirth: studentsTable.dateOfBirth,
    disabilityCategory: studentsTable.disabilityCategory,
  }).from(studentsTable).where(and(
    eq(studentsTable.status, "active"),
    isNull(studentsTable.deletedAt),
    studentDistrictFilter,
  ));

  const allStaff = await db.select({
    id: staffTable.id,
    firstName: staffTable.firstName,
    lastName: staffTable.lastName,
    role: staffTable.role,
    email: staffTable.email,
    schoolId: staffTable.schoolId,
    status: staffTable.status,
  }).from(staffTable).where(and(
    eq(staffTable.status, "active"),
    isNull(staffTable.deletedAt),
    staffDistrictFilter,
  ));

  const studentIds = allStudents.map(s => s.id);
  const staffIds = allStaff.map(s => s.id);

  const allServiceReqs = studentIds.length > 0
    ? await db.select({
        id: serviceRequirementsTable.id,
        studentId: serviceRequirementsTable.studentId,
        providerId: serviceRequirementsTable.providerId,
        requiredMinutes: serviceRequirementsTable.requiredMinutes,
        serviceTypeId: serviceRequirementsTable.serviceTypeId,
      }).from(serviceRequirementsTable).where(and(
        eq(serviceRequirementsTable.active, true),
        inArray(serviceRequirementsTable.studentId, studentIds),
      ))
    : [];

  const allAssignments = studentIds.length > 0
    ? await db.select({
        staffId: staffAssignmentsTable.staffId,
        studentId: staffAssignmentsTable.studentId,
      }).from(staffAssignmentsTable).where(
        inArray(staffAssignmentsTable.studentId, studentIds),
      )
    : [];

  const allScheduleBlocks = staffIds.length > 0
    ? await db.select({
        id: scheduleBlocksTable.id,
        staffId: scheduleBlocksTable.staffId,
        studentId: scheduleBlocksTable.studentId,
        serviceTypeId: scheduleBlocksTable.serviceTypeId,
      }).from(scheduleBlocksTable).where(and(
        isNull(scheduleBlocksTable.deletedAt),
        inArray(scheduleBlocksTable.staffId, staffIds),
      ))
    : [];

  const allGoals = studentIds.length > 0
    ? await db.select({
        id: iepGoalsTable.id,
        studentId: iepGoalsTable.studentId,
        status: iepGoalsTable.status,
      }).from(iepGoalsTable).where(and(
        eq(iepGoalsTable.active, true),
        inArray(iepGoalsTable.studentId, studentIds),
      ))
    : [];

  const checks: HealthCheck[] = [];

  const studentIdsWithReqs = new Set(allServiceReqs.map(r => r.studentId));
  const studentsNoReqs = allStudents.filter(s => !studentIdsWithReqs.has(s.id));
  checks.push({
    id: "students_no_service_reqs",
    category: "students",
    severity: studentsNoReqs.length > 0 ? "critical" : "info",
    title: "Students missing service requirements",
    description: "Active students with no IEP service requirements defined. Without service requirements, Trellis cannot track compliance or calculate delivery gaps.",
    count: studentsNoReqs.length,
    total: allStudents.length,
    items: studentsNoReqs.slice(0, 25).map(s => ({
      id: s.id, label: `${s.firstName} ${s.lastName}`,
      detail: `Grade ${s.grade || "?"} · No service requirements`,
    })),
  });

  const studentsNoCM = allStudents.filter(s => !s.caseManagerId);
  checks.push({
    id: "students_no_case_manager",
    category: "students",
    severity: studentsNoCM.length > 0 ? "warning" : "info",
    title: "Students missing case manager",
    description: "Students without an assigned case manager. Case managers are responsible for IEP oversight and compliance monitoring.",
    count: studentsNoCM.length,
    total: allStudents.length,
    items: studentsNoCM.slice(0, 25).map(s => ({
      id: s.id, label: `${s.firstName} ${s.lastName}`,
      detail: `Grade ${s.grade || "?"} · No case manager assigned`,
    })),
  });

  const studentsNoSchool = allStudents.filter(s => !s.schoolId);
  checks.push({
    id: "students_no_school",
    category: "students",
    severity: studentsNoSchool.length > 0 ? "warning" : "info",
    title: "Students not assigned to a school",
    description: "Students without a school assignment. School is needed for scheduling, coverage tracking, and DESE reporting.",
    count: studentsNoSchool.length,
    total: allStudents.length,
    items: studentsNoSchool.slice(0, 25).map(s => ({
      id: s.id, label: `${s.firstName} ${s.lastName}`,
      detail: `Grade ${s.grade || "?"} · No school`,
    })),
  });

  const reqsNoProvider = allServiceReqs.filter(r => !r.providerId);
  const serviceTypeIds = [...new Set(allServiceReqs.map(r => r.serviceTypeId))];
  const serviceTypeMap = new Map<number, string>();
  if (serviceTypeIds.length > 0) {
    const types = await db.select({ id: serviceTypesTable.id, name: serviceTypesTable.name }).from(serviceTypesTable).where(inArray(serviceTypesTable.id, serviceTypeIds));
    types.forEach(t => serviceTypeMap.set(t.id, t.name));
  }
  const studentMap = new Map(allStudents.map(s => [s.id, `${s.firstName} ${s.lastName}`]));

  checks.push({
    id: "service_reqs_no_provider",
    category: "services",
    severity: reqsNoProvider.length > 0 ? "critical" : "info",
    title: "Service requirements without an assigned provider",
    description: "IEP-mandated services with no provider assigned. Sessions logged by any provider won't auto-match to these requirements for compliance tracking.",
    count: reqsNoProvider.length,
    total: allServiceReqs.length,
    items: reqsNoProvider.slice(0, 25).map(r => ({
      id: r.id, label: studentMap.get(r.studentId) || `Student #${r.studentId}`,
      detail: `${serviceTypeMap.get(r.serviceTypeId) || "Unknown service"} · ${r.requiredMinutes} min · No provider`,
    })),
  });

  const reqsNoMinutes = allServiceReqs.filter(r => !r.requiredMinutes || r.requiredMinutes <= 0);
  checks.push({
    id: "service_reqs_no_minutes",
    category: "services",
    severity: reqsNoMinutes.length > 0 ? "critical" : "info",
    title: "Service requirements with no minute target",
    description: "Service requirements where required_minutes is zero or missing. Compliance percentage cannot be calculated without a target.",
    count: reqsNoMinutes.length,
    total: allServiceReqs.length,
    items: reqsNoMinutes.slice(0, 25).map(r => ({
      id: r.id, label: studentMap.get(r.studentId) || `Student #${r.studentId}`,
      detail: `${serviceTypeMap.get(r.serviceTypeId) || "Unknown service"} · ${r.requiredMinutes || 0} min target`,
    })),
  });

  const clinicalRoles = new Set(["provider", "bcba", "slp", "ot", "pt", "para", "counselor"]);
  const clinicalStaff = allStaff.filter(s => clinicalRoles.has(s.role));
  const staffWithAssignments = new Set(allAssignments.map(a => a.staffId));
  const staffWithSchedule = new Set(allScheduleBlocks.map(b => b.staffId));
  const unassignedProviders = clinicalStaff.filter(s => !staffWithAssignments.has(s.id) && !staffWithSchedule.has(s.id));
  checks.push({
    id: "providers_no_assignments",
    category: "staff",
    severity: unassignedProviders.length > 0 ? "warning" : "info",
    title: "Providers with no student assignments or schedule",
    description: "Clinical staff (providers, BCBAs, paras, therapists) with no students assigned and no schedule blocks. They may not show up in compliance tracking or session logging.",
    count: unassignedProviders.length,
    total: clinicalStaff.length,
    items: unassignedProviders.slice(0, 25).map(s => ({
      id: s.id, label: `${s.firstName} ${s.lastName}`,
      detail: `${s.role} · No assignments or schedule`,
    })),
  });

  const staffNoEmail = allStaff.filter(s => !s.email || !s.email.trim());
  checks.push({
    id: "staff_no_email",
    category: "staff",
    severity: staffNoEmail.length > 0 ? "warning" : "info",
    title: "Staff members without email addresses",
    description: "Staff without email addresses cannot receive Trellis login invitations or notifications.",
    count: staffNoEmail.length,
    total: allStaff.length,
    items: staffNoEmail.slice(0, 25).map(s => ({
      id: s.id, label: `${s.firstName} ${s.lastName}`,
      detail: `${s.role} · No email`,
    })),
  });

  const studentNameCount = new Map<string, typeof allStudents>();
  for (const s of allStudents) {
    const key = `${s.firstName.toLowerCase().trim()}|${s.lastName.toLowerCase().trim()}`;
    if (!studentNameCount.has(key)) studentNameCount.set(key, []);
    studentNameCount.get(key)!.push(s);
  }
  const duplicateGroups = [...studentNameCount.entries()].filter(([, group]) => group.length > 1);
  checks.push({
    id: "duplicate_students",
    category: "data_quality",
    severity: duplicateGroups.length > 0 ? "warning" : "info",
    title: "Possible duplicate students",
    description: "Students with identical first and last names. These may be duplicates from overlapping imports, or may be legitimate (siblings, common names).",
    count: duplicateGroups.length,
    total: allStudents.length,
    items: duplicateGroups.slice(0, 15).map(([, group]) => ({
      id: group[0].id, label: `${group[0].firstName} ${group[0].lastName}`,
      detail: `${group.length} records · IDs: ${group.map(s => s.id).join(", ")}`,
    })),
  });

  const staffNameCount = new Map<string, typeof allStaff>();
  for (const s of allStaff) {
    const key = `${s.firstName.toLowerCase().trim()}|${s.lastName.toLowerCase().trim()}`;
    if (!staffNameCount.has(key)) staffNameCount.set(key, []);
    staffNameCount.get(key)!.push(s);
  }
  const duplicateStaffGroups = [...staffNameCount.entries()].filter(([, group]) => group.length > 1);
  checks.push({
    id: "duplicate_staff",
    category: "data_quality",
    severity: duplicateStaffGroups.length > 0 ? "warning" : "info",
    title: "Possible duplicate staff members",
    description: "Staff with identical first and last names. Review whether these are duplicates from overlapping imports.",
    count: duplicateStaffGroups.length,
    total: allStaff.length,
    items: duplicateStaffGroups.slice(0, 15).map(([, group]) => ({
      id: group[0].id, label: `${group[0].firstName} ${group[0].lastName}`,
      detail: `${group.length} records (${group.map(s => s.role).join(", ")}) · IDs: ${group.map(s => s.id).join(", ")}`,
    })),
  });

  const studentIdsWithSchedule = new Set(allScheduleBlocks.filter(b => b.studentId).map(b => b.studentId!));
  const studentsReqsNoSchedule = allStudents.filter(s => studentIdsWithReqs.has(s.id) && !studentIdsWithSchedule.has(s.id));
  checks.push({
    id: "students_reqs_no_schedule",
    category: "schedules",
    severity: studentsReqsNoSchedule.length > 0 ? "warning" : "info",
    title: "Students with service requirements but no schedule",
    description: "Students who have IEP service mandates but no recurring schedule blocks. Without a schedule, providers won't see them on their daily view and sessions may not get logged.",
    count: studentsReqsNoSchedule.length,
    total: allStudents.filter(s => studentIdsWithReqs.has(s.id)).length || 1,
    items: studentsReqsNoSchedule.slice(0, 25).map(s => ({
      id: s.id, label: `${s.firstName} ${s.lastName}`,
      detail: `Has service requirements but no schedule blocks`,
    })),
  });

  const studentIdsWithGoals = new Set(allGoals.map(g => g.studentId));
  const studentsNoGoals = allStudents.filter(s => !studentIdsWithGoals.has(s.id));
  checks.push({
    id: "students_no_iep_goals",
    category: "students",
    severity: studentsNoGoals.length > 0 ? "warning" : "info",
    title: "Students with no IEP goals",
    description: "Active students without any IEP goals. Progress monitoring and IEP compliance tracking require at least one goal per student.",
    count: studentsNoGoals.length,
    total: allStudents.length,
    items: studentsNoGoals.slice(0, 25).map(s => ({
      id: s.id, label: `${s.firstName} ${s.lastName}`,
      detail: `Grade ${s.grade || "?"} · No IEP goals`,
    })),
  });

  const studentsMissingDemo = allStudents.filter(s => !s.dateOfBirth || !s.grade || !s.disabilityCategory);
  checks.push({
    id: "students_incomplete_demographics",
    category: "data_quality",
    severity: "info",
    title: "Students with incomplete demographics",
    description: "Students missing date of birth, grade, or disability category. These fields are needed for DESE reporting and state compliance.",
    count: studentsMissingDemo.length,
    total: allStudents.length,
    items: studentsMissingDemo.slice(0, 25).map(s => {
      const missing: string[] = [];
      if (!s.dateOfBirth) missing.push("DOB");
      if (!s.grade) missing.push("grade");
      if (!s.disabilityCategory) missing.push("disability");
      return {
        id: s.id, label: `${s.firstName} ${s.lastName}`,
        detail: `Missing: ${missing.join(", ")}`,
      };
    }),
  });

  const criticalCount = checks.filter(c => c.severity === "critical" && c.count > 0).length;
  const warningCount = checks.filter(c => c.severity === "warning" && c.count > 0).length;
  const passedCount = checks.filter(c => c.count === 0).length;

  let overallStatus: "good" | "needs_attention" | "not_ready" = "good";
  if (criticalCount > 0) overallStatus = "not_ready";
  else if (warningCount > 2) overallStatus = "needs_attention";

  return {
    overallStatus,
    summary: {
      totalStudents: allStudents.length,
      totalStaff: allStaff.length,
      totalServiceReqs: allServiceReqs.length,
      totalScheduleBlocks: allScheduleBlocks.length,
      checksRun: checks.length,
      passed: passedCount,
      warnings: warningCount,
      critical: criticalCount,
    },
    checks,
  };
}
