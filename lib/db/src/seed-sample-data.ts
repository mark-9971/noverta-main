/**
 * Per-tenant sample data seeder.
 *
 * Generates a small, scenario-rich slice of data inside an EXISTING tenant
 * district so a brand-new admin can experience Trellis's value within minutes
 * of signup. Every row created here is tagged via `students.is_sample` /
 * `staff.is_sample` (or descended from one of those rows) so it can be cleanly
 * removed with `teardownSampleData()`.
 *
 * Scope is intentionally smaller than the global MetroWest demo seeder:
 *   - 5 staff (mix of BCBA / SLP / OT / counselor / case manager)
 *   - 10 students with realistic IEPs, guardians, accommodations
 *   - ~25 service requirements with assigned providers
 *   - 2 weeks of completed + missed sessions seeded against today
 *   - 3 students injected with shortfall / urgent / compensatory scenarios
 *     so compliance-risk and cost-risk panels are non-empty on first load
 *   - Schedule blocks, alerts, compensatory obligations
 *
 * This module never TRUNCATEs — it only inserts and tags rows.
 */
import { db } from "./index";
import {
  districtsTable, schoolsTable, schoolYearsTable,
  studentsTable, staffTable,
  serviceTypesTable, serviceRequirementsTable,
  sessionLogsTable, scheduleBlocksTable,
  iepDocumentsTable, iepGoalsTable,
  iepAccommodationsTable,
  alertsTable, compensatoryObligationsTable,
  guardiansTable, emergencyContactsTable,
} from "./index";
import { eq, and, inArray, sql } from "drizzle-orm";

// ──────────────────────────────────────────────────────────────────
// Constants & helpers
// ──────────────────────────────────────────────────────────────────
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}
function minToTime(mins: number) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}
function isWeekday(dateStr: string) {
  const dow = new Date(dateStr + "T00:00:00").getDay();
  return dow !== 0 && dow !== 6;
}

const FIRST_NAMES = [
  "Aiden", "Maya", "Jaden", "Sofia", "Marcus", "Priya",
  "Liam", "Zoe", "Ethan", "Harper", "Noah", "Camila",
];
const LAST_NAMES = [
  "Anderson", "Bernier", "Cabral", "Hernandez", "Ibrahim", "Keane",
  "Morales", "Nguyen", "Patel", "Walsh",
];
const DISABILITIES = [
  "Autism", "Specific Learning Disability", "Communication Impairment",
  "Emotional Disturbance", "Health Disability", "Developmental Delay",
];
const GRADES = ["K", "1", "2", "3", "4", "5", "6", "7", "8"];

interface SampleStaffSeed {
  firstName: string; lastName: string; role: string;
  title: string; qualifications: string;
}
const SAMPLE_STAFF: SampleStaffSeed[] = [
  { firstName: "Katherine", lastName: "Reilly", role: "bcba",
    title: "Board Certified Behavior Analyst", qualifications: "BCBA, M.Ed." },
  { firstName: "Rachel", lastName: "Ferreira", role: "provider",
    title: "Speech-Language Pathologist", qualifications: "CCC-SLP" },
  { firstName: "Jennifer", lastName: "Walsh", role: "provider",
    title: "Occupational Therapist", qualifications: "OTR/L" },
  { firstName: "Lisa", lastName: "Kowalski", role: "provider",
    title: "School Adjustment Counselor", qualifications: "LICSW" },
  { firstName: "Andrew", lastName: "Costa", role: "case_manager",
    title: "SPED Case Manager", qualifications: "M.Ed. Special Education" },
];

// Service type templates, used only when the tenant has no service types yet.
const SERVICE_TYPE_DEFAULTS = [
  { name: "Speech-Language Therapy", category: "speech", color: "#06b6d4",
    defaultIntervalType: "monthly", cptCode: "92507", defaultBillingRate: "68.00" },
  { name: "Occupational Therapy", category: "ot", color: "#8b5cf6",
    defaultIntervalType: "monthly", cptCode: "97530", defaultBillingRate: "65.00" },
  { name: "Counseling", category: "counseling", color: "#10b981",
    defaultIntervalType: "monthly", cptCode: "90837", defaultBillingRate: "55.00" },
  { name: "ABA Therapy", category: "aba", color: "#6366f1",
    defaultIntervalType: "monthly", cptCode: "97153", defaultBillingRate: "72.00" },
];

type Scenario = "healthy" | "shortfall" | "urgent" | "compensatory_risk";
interface StudentSpec {
  id: number;
  scenario: Scenario;
  serviceTypeIds: number[];
  caseManagerId: number;
}

// ──────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────

export interface SeedSampleResult {
  studentsCreated: number;
  staffCreated: number;
  serviceRequirements: number;
  sessionsLogged: number;
  alerts: number;
  compensatoryObligations: number;
}

export interface SampleDataStatus {
  hasSampleData: boolean;
  sampleStudents: number;
  sampleStaff: number;
}

export async function getSampleDataStatus(districtId: number): Promise<SampleDataStatus> {
  const [district] = await db.select({ has: districtsTable.hasSampleData })
    .from(districtsTable).where(eq(districtsTable.id, districtId));
  const schools = await db.select({ id: schoolsTable.id })
    .from(schoolsTable).where(eq(schoolsTable.districtId, districtId));
  const schoolIds = schools.map(s => s.id);

  if (schoolIds.length === 0) {
    return { hasSampleData: !!district?.has, sampleStudents: 0, sampleStaff: 0 };
  }
  const [students] = await db.select({ c: sql<number>`count(*)::int` })
    .from(studentsTable)
    .where(and(eq(studentsTable.isSample, true), inArray(studentsTable.schoolId, schoolIds)));
  const [staff] = await db.select({ c: sql<number>`count(*)::int` })
    .from(staffTable)
    .where(and(eq(staffTable.isSample, true), inArray(staffTable.schoolId, schoolIds)));
  return {
    hasSampleData: !!district?.has,
    sampleStudents: students?.c ?? 0,
    sampleStaff: staff?.c ?? 0,
  };
}

export async function seedSampleDataForDistrict(districtId: number): Promise<SeedSampleResult> {
  // 1. Resolve / ensure prerequisites: school, school year, service types
  const [district] = await db.select().from(districtsTable).where(eq(districtsTable.id, districtId));
  if (!district) throw new Error(`District ${districtId} not found`);

  let schools = await db.select().from(schoolsTable).where(eq(schoolsTable.districtId, districtId));
  if (schools.length === 0) {
    const [created] = await db.insert(schoolsTable).values({
      districtId, name: "Sample Elementary",
    }).returning();
    schools = [created];
  }
  const school = schools[0];

  let [schoolYear] = await db.select().from(schoolYearsTable)
    .where(and(eq(schoolYearsTable.districtId, districtId), eq(schoolYearsTable.isActive, true)));
  if (!schoolYear) {
    const now = new Date();
    const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    [schoolYear] = await db.insert(schoolYearsTable).values({
      districtId,
      label: `${startYear}-${startYear + 1}`,
      startDate: `${startYear}-08-15`,
      endDate: `${startYear + 1}-06-15`,
      isActive: true,
    } as any).returning();
  }

  let serviceTypes = await db.select().from(serviceTypesTable);
  if (serviceTypes.length === 0) {
    serviceTypes = await db.insert(serviceTypesTable).values(SERVICE_TYPE_DEFAULTS as any).returning();
  }
  // Use the first 4 service types as the sample palette (or all if fewer)
  const samplePalette = serviceTypes.slice(0, 4);

  // 2. Sample staff
  const insertedStaff = await db.insert(staffTable).values(
    SAMPLE_STAFF.map(s => ({
      firstName: s.firstName,
      lastName: s.lastName,
      role: s.role,
      title: s.title,
      qualifications: s.qualifications,
      email: `${s.firstName.toLowerCase()}.${s.lastName.toLowerCase()}@sample.trellis.local`,
      schoolId: school.id,
      status: "active",
      isSample: true,
    })),
  ).returning();

  const caseManager = insertedStaff.find(s => s.role === "case_manager") ?? insertedStaff[0];
  const providers = insertedStaff.filter(s => s.role === "provider" || s.role === "bcba");

  // 3. Sample students (10): mix of scenarios
  const scenarios: Scenario[] = [
    "healthy", "healthy", "healthy", "healthy",
    "shortfall", "shortfall",
    "urgent", "urgent",
    "compensatory_risk", "compensatory_risk",
  ];
  const studentRows = scenarios.map((scenario, i) => ({
    firstName: FIRST_NAMES[i % FIRST_NAMES.length],
    lastName: LAST_NAMES[i % LAST_NAMES.length],
    grade: pick(GRADES),
    disabilityCategory: pick(DISABILITIES),
    schoolId: school.id,
    caseManagerId: caseManager.id,
    status: "active",
    primaryLanguage: "English",
    isSample: true,
    enrolledAt: addDays(new Date().toISOString().split("T")[0], -rand(60, 365)),
  }));
  const insertedStudents = await db.insert(studentsTable).values(studentRows).returning();

  const studentSpecs: StudentSpec[] = insertedStudents.map((s, i) => {
    // Each student gets 2-3 service types
    const numSvc = rand(2, 3);
    const palette = [...samplePalette].sort(() => Math.random() - 0.5).slice(0, numSvc);
    return {
      id: s.id,
      scenario: scenarios[i],
      serviceTypeIds: palette.map(p => p.id),
      caseManagerId: caseManager.id,
    };
  });

  // 4. IEP documents + 2 goals each
  const today = new Date().toISOString().split("T")[0];
  const iepRows = insertedStudents.map(s => ({
    studentId: s.id,
    iepStartDate: addDays(today, -rand(90, 200)),
    iepEndDate: addDays(today, rand(120, 240)),
    status: "active",
  } as any));
  const insertedIeps = await db.insert(iepDocumentsTable).values(iepRows).returning();
  const iepByStudent = new Map(insertedIeps.map(d => [d.studentId, d.id]));

  const goalRows: any[] = [];
  for (const s of insertedStudents) {
    for (let g = 0; g < 2; g++) {
      goalRows.push({
        studentId: s.id,
        iepDocumentId: iepByStudent.get(s.id)!,
        goalArea: pick(["Communication", "Social Skills", "Self-Regulation", "Academics"]),
        goalNumber: g + 1,
        annualGoal: "Sample goal — student will demonstrate the target skill with 80% accuracy across 3 consecutive sessions.",
        baseline: "Baseline data collected during initial evaluation.",
        targetCriterion: "80% accuracy across 3 consecutive sessions",
        measurementMethod: "Direct observation",
        status: "active",
      });
    }
  }
  await db.insert(iepGoalsTable).values(goalRows);

  // 5. Service requirements (one per student per service type)
  const srRows: any[] = [];
  for (const spec of studentSpecs) {
    for (const stId of spec.serviceTypeIds) {
      // Round-robin a provider
      const provider = providers[(spec.id + stId) % providers.length];
      srRows.push({
        studentId: spec.id,
        serviceTypeId: stId,
        providerId: provider?.id ?? null,
        requiredMinutes: pick([120, 150, 180, 240]),
        intervalType: "monthly",
        deliveryType: "direct",
        setting: "Resource Room",
        active: true,
        startDate: addDays(today, -rand(30, 120)),
      });
    }
  }
  const insertedSrs = await db.insert(serviceRequirementsTable).values(srRows).returning();

  // Index requirements by (studentId, serviceTypeId)
  const srByStudent = new Map<number, typeof insertedSrs>();
  for (const sr of insertedSrs) {
    const list = srByStudent.get(sr.studentId) ?? [];
    list.push(sr);
    srByStudent.set(sr.studentId, list);
  }

  // 6. Session logs across the last 14 weekdays. Healthy ≈90% completion,
  //    shortfall ≈60%, urgent ≈30%, compensatory_risk ≈45%.
  const sessionRows: any[] = [];
  const now = new Date();
  const dates: string[] = [];
  for (let i = 14; i >= 1; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    if (isWeekday(ds)) dates.push(ds);
  }

  const completionRate: Record<Scenario, number> = {
    healthy: 0.9, shortfall: 0.6, urgent: 0.3, compensatory_risk: 0.45,
  };

  for (const spec of studentSpecs) {
    const srs = srByStudent.get(spec.id) ?? [];
    for (const sr of srs) {
      // ~3 sessions per requirement across the window
      const numSessions = 3;
      const chosenDates = [...dates].sort(() => Math.random() - 0.5).slice(0, numSessions);
      for (const date of chosenDates) {
        const completed = Math.random() < completionRate[spec.scenario];
        const startMin = pick([9, 10, 11, 13, 14]) * 60;
        sessionRows.push({
          studentId: spec.id,
          staffId: sr.providerId,
          serviceTypeId: sr.serviceTypeId,
          serviceRequirementId: sr.id,
          sessionDate: date,
          startTime: minToTime(startMin),
          endTime: minToTime(startMin + 30),
          durationMinutes: 30,
          status: completed ? "completed" : "missed",
          location: "Resource Room",
          schoolYearId: schoolYear.id,
          notes: completed
            ? "Sample session — student engaged and made progress on goal."
            : "Sample session — student absent.",
        });
      }
    }
  }
  if (sessionRows.length > 0) {
    for (let i = 0; i < sessionRows.length; i += 200) {
      await db.insert(sessionLogsTable).values(sessionRows.slice(i, i + 200));
    }
  }

  // 7. Schedule blocks (recurring weekly slots for each requirement)
  const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const blockRows: any[] = [];
  for (const sr of insertedSrs) {
    if (!sr.providerId) continue;
    const day = pick(DAYS);
    const startMin = pick([9, 10, 11, 13, 14]) * 60;
    blockRows.push({
      staffId: sr.providerId,
      studentId: sr.studentId,
      serviceTypeId: sr.serviceTypeId,
      dayOfWeek: day,
      startTime: minToTime(startMin),
      endTime: minToTime(startMin + 30),
      location: "Resource Room",
      blockType: "service",
      isRecurring: true,
      isAutoGenerated: true,
      schoolYearId: schoolYear.id,
    });
  }
  if (blockRows.length > 0) {
    await db.insert(scheduleBlocksTable).values(blockRows);
  }

  // 8. Accommodations (3 per student, basic set)
  const accomBank = [
    { category: "instruction", description: "Extended time on assignments and assessments" },
    { category: "instruction", description: "Preferential seating near teacher" },
    { category: "instruction", description: "Visual schedule and advance notice of transitions" },
    { category: "assessment", description: "Small-group testing environment" },
    { category: "environmental", description: "Access to sensory tools (fidget, weighted lap pad)" },
    { category: "behavioral", description: "Daily check-in with case manager" },
  ];
  const accomRows: any[] = [];
  for (const s of insertedStudents) {
    const chosen = [...accomBank].sort(() => Math.random() - 0.5).slice(0, 3);
    for (const a of chosen) {
      accomRows.push({
        studentId: s.id,
        iepDocumentId: iepByStudent.get(s.id),
        category: a.category,
        description: a.description,
        provider: "Special Education Teacher",
        active: true,
      });
    }
  }
  await db.insert(iepAccommodationsTable).values(accomRows);

  // 9. Guardians + 1 emergency contact per student
  const guardianRows: any[] = [];
  const emergencyRows: any[] = [];
  for (const s of insertedStudents) {
    guardianRows.push({
      studentId: s.id,
      name: `${pick(["Maria", "John", "Patricia", "Robert"])} ${s.lastName}`,
      relationship: pick(["Mother", "Father"]),
      email: `parent.${s.lastName.toLowerCase()}${s.id}@sample.trellis.local`,
      phone: `(555) ${rand(200, 999)}-${rand(1000, 9999)}`,
      preferredContactMethod: "email",
      contactPriority: 1,
    });
    emergencyRows.push({
      studentId: s.id,
      firstName: pick(["Anna", "James", "Linda", "David"]),
      lastName: pick(LAST_NAMES),
      relationship: pick(["Aunt", "Uncle", "Grandparent"]),
      phone: `(555) ${rand(200, 999)}-${rand(1000, 9999)}`,
      isAuthorizedForPickup: true,
      priority: 1,
    });
  }
  await db.insert(guardiansTable).values(guardianRows);
  await db.insert(emergencyContactsTable).values(emergencyRows);

  // 10. Alerts for non-healthy students (drives compliance-risk surfaces)
  const alertRows: any[] = [];
  for (const spec of studentSpecs) {
    if (spec.scenario === "urgent") {
      alertRows.push({
        type: "compliance",
        severity: "high",
        studentId: spec.id,
        message: "Service delivery below 50% — student at risk of compensatory obligation.",
        suggestedAction: "Schedule make-up sessions and notify case manager.",
        resolved: false,
      });
    } else if (spec.scenario === "compensatory_risk") {
      alertRows.push({
        type: "compliance",
        severity: "medium",
        studentId: spec.id,
        message: "Cumulative shortfall approaching compensatory threshold.",
        suggestedAction: "Calculate minutes owed and prepare a make-up plan.",
        resolved: false,
      });
    } else if (spec.scenario === "shortfall") {
      alertRows.push({
        type: "compliance",
        severity: "medium",
        studentId: spec.id,
        message: "Service delivery below 80% this month.",
        suggestedAction: "Review scheduling and prioritize make-up sessions.",
        resolved: false,
      });
    }
  }
  if (alertRows.length > 0) await db.insert(alertsTable).values(alertRows);

  // 11. Compensatory obligations for urgent + compensatory_risk
  const compRows: any[] = [];
  for (const spec of studentSpecs) {
    if (spec.scenario !== "urgent" && spec.scenario !== "compensatory_risk") continue;
    const srs = srByStudent.get(spec.id) ?? [];
    if (srs.length === 0) continue;
    const sr = srs[0];
    const minutesOwed = Math.round(sr.requiredMinutes * (spec.scenario === "urgent" ? 0.45 : 0.30));
    const periodStart = addDays(today, -45);
    const periodEnd = addDays(periodStart, 29);
    compRows.push({
      studentId: spec.id,
      serviceRequirementId: sr.id,
      periodStart,
      periodEnd,
      minutesOwed,
      minutesDelivered: spec.scenario === "urgent" ? 0 : Math.round(minutesOwed * 0.2),
      status: "pending",
      notes: spec.scenario === "urgent"
        ? "Significant shortfall — compensatory plan required."
        : "Partial gap identified during monthly compliance review.",
      source: "system",
    });
  }
  if (compRows.length > 0) await db.insert(compensatoryObligationsTable).values(compRows);

  // 12. Mark district as having sample data
  await db.update(districtsTable)
    .set({ hasSampleData: true })
    .where(eq(districtsTable.id, districtId));

  return {
    studentsCreated: insertedStudents.length,
    staffCreated: insertedStaff.length,
    serviceRequirements: insertedSrs.length,
    sessionsLogged: sessionRows.length,
    alerts: alertRows.length,
    compensatoryObligations: compRows.length,
  };
}

export interface TeardownSampleResult {
  studentsRemoved: number;
  staffRemoved: number;
}

export async function teardownSampleData(districtId: number): Promise<TeardownSampleResult> {
  const schools = await db.select({ id: schoolsTable.id })
    .from(schoolsTable).where(eq(schoolsTable.districtId, districtId));
  const schoolIds = schools.map(s => s.id);

  if (schoolIds.length === 0) {
    await db.update(districtsTable)
      .set({ hasSampleData: false })
      .where(eq(districtsTable.id, districtId));
    return { studentsRemoved: 0, staffRemoved: 0 };
  }

  const sampleStudentRows = await db.select({ id: studentsTable.id })
    .from(studentsTable)
    .where(and(eq(studentsTable.isSample, true), inArray(studentsTable.schoolId, schoolIds)));
  const sampleStaffRows = await db.select({ id: staffTable.id })
    .from(staffTable)
    .where(and(eq(staffTable.isSample, true), inArray(staffTable.schoolId, schoolIds)));

  const studentIds = sampleStudentRows.map(r => r.id);
  const staffIds = sampleStaffRows.map(r => r.id);

  // Delete in dependency order. Each table is keyed by studentId or staffId
  // via FK; sweeping by these IDs is enough to remove all sample-derived data.
  if (studentIds.length > 0) {
    // Sessions reference both student and staff; clear by student first.
    await db.delete(sessionLogsTable).where(inArray(sessionLogsTable.studentId, studentIds));
    await db.delete(scheduleBlocksTable).where(inArray(scheduleBlocksTable.studentId, studentIds));
    await db.delete(compensatoryObligationsTable).where(inArray(compensatoryObligationsTable.studentId, studentIds));
    await db.delete(alertsTable).where(inArray(alertsTable.studentId, studentIds));
    await db.delete(serviceRequirementsTable).where(inArray(serviceRequirementsTable.studentId, studentIds));
    await db.delete(iepAccommodationsTable).where(inArray(iepAccommodationsTable.studentId, studentIds));
    await db.delete(iepGoalsTable).where(inArray(iepGoalsTable.studentId, studentIds));
    await db.delete(iepDocumentsTable).where(inArray(iepDocumentsTable.studentId, studentIds));
    await db.delete(guardiansTable).where(inArray(guardiansTable.studentId, studentIds));
    await db.delete(emergencyContactsTable).where(inArray(emergencyContactsTable.studentId, studentIds));
    // Detach case-manager refs before deleting students/staff to avoid FK errors.
    await db.update(studentsTable)
      .set({ caseManagerId: null })
      .where(inArray(studentsTable.id, studentIds));
    await db.delete(studentsTable).where(inArray(studentsTable.id, studentIds));
  }

  if (staffIds.length > 0) {
    // Mop up any stragglers (e.g. sessions for sample staff serving non-sample students).
    await db.delete(sessionLogsTable).where(inArray(sessionLogsTable.staffId, staffIds));
    await db.delete(scheduleBlocksTable).where(inArray(scheduleBlocksTable.staffId, staffIds));
    // Drop FK references on remaining service requirements / students.
    await db.update(serviceRequirementsTable)
      .set({ providerId: null })
      .where(inArray(serviceRequirementsTable.providerId, staffIds));
    await db.update(studentsTable)
      .set({ caseManagerId: null })
      .where(inArray(studentsTable.caseManagerId, staffIds));
    await db.delete(staffTable).where(inArray(staffTable.id, staffIds));
  }

  await db.update(districtsTable)
    .set({ hasSampleData: false })
    .where(eq(districtsTable.id, districtId));

  return { studentsRemoved: studentIds.length, staffRemoved: staffIds.length };
}
