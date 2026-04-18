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
import { db } from "./db";
import {
  districtsTable, schoolsTable, schoolYearsTable,
  studentsTable, staffTable,
  serviceTypesTable, serviceRequirementsTable,
  sessionLogsTable, scheduleBlocksTable,
  iepDocumentsTable, iepGoalsTable,
  iepAccommodationsTable,
  alertsTable, compensatoryObligationsTable,
  guardiansTable, emergencyContactsTable,
  programTargetsTable, behaviorTargetsTable,
  dataSessionsTable, programDataTable, behaviorDataTable,
  fbasTable, fbaObservationsTable, functionalAnalysesTable,
  behaviorInterventionPlansTable,
  medicalAlertsTable, parentMessagesTable,
} from "./schema";
import { eq, and, inArray, sql } from "drizzle-orm";

// ──────────────────────────────────────────────────────────────────
// Constants & helpers
// ──────────────────────────────────────────────────────────────────
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randf(min: number, max: number) { return min + Math.random() * (max - min); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// Broad bounds (not target outcomes) used by the sample seeder. These define
// the *physical* envelope the generator may pull from — actual values for any
// individual row are randomized within these bounds. They intentionally do
// NOT encode "this kind of student should land at X%" — that role is filled
// by the per-scenario completion ranges below.
const SAMPLE_BOUNDS = {
  // Required service minutes per requirement (monthly). Wide enough to cover
  // brief consults through full-day intensive supports.
  requiredMinutes: [60, 360] as const,
  // School-day session start window (08:00 – 14:30, in minute-of-day).
  startMinuteOfDay: [8 * 60, 14 * 60 + 30] as const,
  // Sessions seeded per (requirement × 2-week window).
  sessionsPerRequirement: [2, 5] as const,
  // Fraction of a single requirement's monthly minutes used as the
  // compensatory obligation seed value.
  compensatoryOwedFraction: {
    urgent: [0.30, 0.60] as const,
    compensatory_risk: [0.15, 0.45] as const,
  },
  // Fraction of an obligation that has already been delivered.
  compensatoryDeliveredFraction: [0.05, 0.40] as const,
};

// Sampled per-(student × session) so that two "shortfall" students do not
// land on the exact same delivery percentage. The bands are deliberately
// wider than the bands they replaced (was: 0.9 / 0.6 / 0.3 / 0.45 fixed).
const COMPLETION_RATE_RANGES: Record<Scenario, readonly [number, number]> = {
  healthy: [0.78, 0.98],
  shortfall: [0.45, 0.78],
  urgent: [0.15, 0.45],
  compensatory_risk: [0.30, 0.60],
};
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
    const schoolYearInsert: typeof schoolYearsTable.$inferInsert = {
      districtId,
      label: `${startYear}-${startYear + 1}`,
      startDate: `${startYear}-08-15`,
      endDate: `${startYear + 1}-06-15`,
      isActive: true,
    };
    [schoolYear] = await db.insert(schoolYearsTable).values(schoolYearInsert).returning();
  }

  let serviceTypes = await db.select().from(serviceTypesTable);
  if (serviceTypes.length === 0) {
    const serviceTypeInserts: (typeof serviceTypesTable.$inferInsert)[] = SERVICE_TYPE_DEFAULTS;
    serviceTypes = await db.insert(serviceTypesTable).values(serviceTypeInserts).returning();
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

  // 3. Sample students: scenario counts drawn from broad ranges each run
  // so the demo never lands on the same fixed 4/2/2/2 shape. At least one
  // of each non-healthy scenario is guaranteed to ensure the compliance-risk
  // surfaces always have representative data.
  const scenarios: Scenario[] = [
    ...Array(rand(2, 5)).fill("healthy" as Scenario),
    ...Array(rand(1, 3)).fill("shortfall" as Scenario),
    ...Array(rand(1, 3)).fill("urgent" as Scenario),
    ...Array(rand(1, 3)).fill("compensatory_risk" as Scenario),
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
  const iepRows: (typeof iepDocumentsTable.$inferInsert)[] = insertedStudents.map(s => ({
    studentId: s.id,
    iepStartDate: addDays(today, -rand(90, 200)),
    iepEndDate: addDays(today, rand(120, 240)),
    status: "active",
  }));
  const insertedIeps = await db.insert(iepDocumentsTable).values(iepRows).returning();
  const iepByStudent = new Map(insertedIeps.map(d => [d.studentId, d.id]));

  const goalRows: (typeof iepGoalsTable.$inferInsert)[] = [];
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
  const srRows: (typeof serviceRequirementsTable.$inferInsert)[] = [];
  for (const spec of studentSpecs) {
    for (const stId of spec.serviceTypeIds) {
      // Round-robin a provider
      const provider = providers[(spec.id + stId) % providers.length];
      srRows.push({
        studentId: spec.id,
        serviceTypeId: stId,
        providerId: provider?.id ?? null,
        requiredMinutes: rand(SAMPLE_BOUNDS.requiredMinutes[0], SAMPLE_BOUNDS.requiredMinutes[1]),
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
  const sessionRows: (typeof sessionLogsTable.$inferInsert)[] = [];
  const now = new Date();
  const dates: string[] = [];
  for (let i = 14; i >= 1; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    if (isWeekday(ds)) dates.push(ds);
  }

  for (const spec of studentSpecs) {
    const srs = srByStudent.get(spec.id) ?? [];
    for (const sr of srs) {
      // Sessions per requirement sampled per requirement so different rows
      // produce naturally varied densities rather than always 3.
      const numSessions = rand(
        SAMPLE_BOUNDS.sessionsPerRequirement[0],
        SAMPLE_BOUNDS.sessionsPerRequirement[1],
      );
      const chosenDates = [...dates].sort(() => Math.random() - 0.5).slice(0, numSessions);
      const [completionLo, completionHi] = COMPLETION_RATE_RANGES[spec.scenario];
      for (const date of chosenDates) {
        // Sample completion threshold per session so two "shortfall" students
        // do not produce identical delivery percentages.
        const completionRate = randf(completionLo, completionHi);
        const completed = Math.random() < completionRate;
        // Sample start time anywhere in the school-day window, snapped to a
        // 5-minute grid (replaces the fixed [9,10,11,13,14] hour list).
        const startMin = Math.round(
          rand(SAMPLE_BOUNDS.startMinuteOfDay[0], SAMPLE_BOUNDS.startMinuteOfDay[1]) / 5,
        ) * 5;
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
  const blockRows: (typeof scheduleBlocksTable.$inferInsert)[] = [];
  for (const sr of insertedSrs) {
    if (!sr.providerId) continue;
    const day = pick(DAYS);
    const startMin = Math.round(
      rand(SAMPLE_BOUNDS.startMinuteOfDay[0], SAMPLE_BOUNDS.startMinuteOfDay[1]) / 5,
    ) * 5;
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
  const accomRows: (typeof iepAccommodationsTable.$inferInsert)[] = [];
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
  const guardianRows: (typeof guardiansTable.$inferInsert)[] = [];
  const emergencyRows: (typeof emergencyContactsTable.$inferInsert)[] = [];
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
  const alertRows: (typeof alertsTable.$inferInsert)[] = [];
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
  const compRows: (typeof compensatoryObligationsTable.$inferInsert)[] = [];
  for (const spec of studentSpecs) {
    if (spec.scenario !== "urgent" && spec.scenario !== "compensatory_risk") continue;
    const srs = srByStudent.get(spec.id) ?? [];
    if (srs.length === 0) continue;
    const sr = srs[0];
    const owedRange = SAMPLE_BOUNDS.compensatoryOwedFraction[
      spec.scenario as "urgent" | "compensatory_risk"
    ];
    const minutesOwed = Math.round(sr.requiredMinutes * randf(owedRange[0], owedRange[1]));
    // Vary obligation period length within a sensible monthly window rather
    // than always using a 30-day block anchored to "today − 45".
    const periodLength = rand(20, 45);
    const periodStart = addDays(today, -rand(30, 75));
    const periodEnd = addDays(periodStart, periodLength - 1);
    const [delivLo, delivHi] = SAMPLE_BOUNDS.compensatoryDeliveredFraction;
    compRows.push({
      studentId: spec.id,
      serviceRequirementId: sr.id,
      periodStart,
      periodEnd,
      minutesOwed,
      minutesDelivered: spec.scenario === "urgent"
        ? 0
        : Math.round(minutesOwed * randf(delivLo, delivHi)),
      status: "pending",
      notes: spec.scenario === "urgent"
        ? "Significant shortfall — compensatory plan required."
        : "Partial gap identified during monthly compliance review.",
      source: "system",
    });
  }
  if (compRows.length > 0) await db.insert(compensatoryObligationsTable).values(compRows);

  // 12. Backfill comprehensive demo content for the new sample students only:
  //     per-goal targets, 90 days of data sessions with start/end times,
  //     program/behavior data points, FBA + BIP, medical alerts, parent
  //     messages. Scoped strictly to the students we just inserted so that
  //     pre-existing real-tenant rows are never touched. Idempotent.
  const { backfillGoalProgressForStudents } = await import("./backfill-goal-progress");
  await backfillGoalProgressForStudents(insertedStudents.map((s) => s.id));

  // 13. Mark district as having sample data
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
  /** Sample staff rows fully deleted (had no real-student schedule blocks). */
  staffRemoved: number;
  /**
   * Sample staff rows that could not be deleted because they were assigned to
   * REAL student schedule blocks; we cleared their `is_sample` flag instead so
   * the real-student blocks (NOT NULL FK) keep working. Admins can review and
   * delete these manually if desired.
   */
  staffGraduated: number;
}

export async function teardownSampleData(districtId: number): Promise<TeardownSampleResult> {
  const schools = await db.select({ id: schoolsTable.id })
    .from(schoolsTable).where(eq(schoolsTable.districtId, districtId));
  const schoolIds = schools.map(s => s.id);

  if (schoolIds.length === 0) {
    await db.update(districtsTable)
      .set({ hasSampleData: false })
      .where(eq(districtsTable.id, districtId));
    return { studentsRemoved: 0, staffRemoved: 0, staffGraduated: 0 };
  }

  const sampleStudentRows = await db.select({ id: studentsTable.id })
    .from(studentsTable)
    .where(and(eq(studentsTable.isSample, true), inArray(studentsTable.schoolId, schoolIds)));
  const sampleStaffRows = await db.select({ id: staffTable.id })
    .from(staffTable)
    .where(and(eq(staffTable.isSample, true), inArray(staffTable.schoolId, schoolIds)));

  const studentIds = sampleStudentRows.map(r => r.id);
  const staffIds = sampleStaffRows.map(r => r.id);
  let _safelyDeletableStaffIdsCount = 0;
  let _stillReferencedStaffIdsCount = 0;

  // Delete in dependency order. Each table is keyed by studentId or staffId
  // via FK; sweeping by these IDs is enough to remove all sample-derived data.
  // The backfill step in seedSampleDataForDistrict creates rows in many
  // additional tables that don't cascade on student delete, so we explicitly
  // sweep them here. Wrapped in a transaction so a partial failure rolls back
  // and leaves teardown re-runnable.
  if (studentIds.length > 0) {
    await db.transaction(async (tx) => {
      // Backfill-created data first (children before parents).
      // program_data / behavior_data cascade on data_sessions, but be explicit.
      await tx.execute(sql`
        DELETE FROM program_data
        WHERE data_session_id IN (
          SELECT id FROM data_sessions WHERE student_id IN ${sql.raw("(" + studentIds.join(",") + ")")}
        )
      `);
      await tx.execute(sql`
        DELETE FROM behavior_data
        WHERE data_session_id IN (
          SELECT id FROM data_sessions WHERE student_id IN ${sql.raw("(" + studentIds.join(",") + ")")}
        )
      `);
      await tx.delete(dataSessionsTable).where(inArray(dataSessionsTable.studentId, studentIds));

      // BIPs reference fbas + behavior_targets + students; delete BIPs before fbas/targets.
      await tx.delete(behaviorInterventionPlansTable).where(inArray(behaviorInterventionPlansTable.studentId, studentIds));
      // FBA sub-tables before fbas.
      await tx.execute(sql`
        DELETE FROM fba_observations
        WHERE fba_id IN (SELECT id FROM fbas WHERE student_id IN ${sql.raw("(" + studentIds.join(",") + ")")})
      `);
      await tx.execute(sql`
        DELETE FROM functional_analyses
        WHERE fba_id IN (SELECT id FROM fbas WHERE student_id IN ${sql.raw("(" + studentIds.join(",") + ")")})
      `);
      await tx.delete(fbasTable).where(inArray(fbasTable.studentId, studentIds));

      // Sessions/schedule/etc.
      await tx.delete(sessionLogsTable).where(inArray(sessionLogsTable.studentId, studentIds));
      await tx.delete(scheduleBlocksTable).where(inArray(scheduleBlocksTable.studentId, studentIds));
      await tx.delete(compensatoryObligationsTable).where(inArray(compensatoryObligationsTable.studentId, studentIds));
      await tx.delete(alertsTable).where(inArray(alertsTable.studentId, studentIds));
      await tx.delete(serviceRequirementsTable).where(inArray(serviceRequirementsTable.studentId, studentIds));
      await tx.delete(iepAccommodationsTable).where(inArray(iepAccommodationsTable.studentId, studentIds));
      // IEP goals reference program/behavior targets — delete goals first, then targets.
      await tx.delete(iepGoalsTable).where(inArray(iepGoalsTable.studentId, studentIds));
      await tx.delete(programTargetsTable).where(inArray(programTargetsTable.studentId, studentIds));
      await tx.delete(behaviorTargetsTable).where(inArray(behaviorTargetsTable.studentId, studentIds));
      await tx.delete(iepDocumentsTable).where(inArray(iepDocumentsTable.studentId, studentIds));
      // Parent messages + medical alerts cascade on student delete, but be explicit
      // so the operation fails loudly here (transaction) rather than mid-cascade.
      await tx.delete(parentMessagesTable).where(inArray(parentMessagesTable.studentId, studentIds));
      await tx.delete(medicalAlertsTable).where(inArray(medicalAlertsTable.studentId, studentIds));
      await tx.delete(guardiansTable).where(inArray(guardiansTable.studentId, studentIds));
      await tx.delete(emergencyContactsTable).where(inArray(emergencyContactsTable.studentId, studentIds));
      // Detach case-manager refs before deleting students/staff to avoid FK errors.
      await tx.update(studentsTable)
        .set({ caseManagerId: null })
        .where(inArray(studentsTable.id, studentIds));
      await tx.delete(studentsTable).where(inArray(studentsTable.id, studentIds));
    });
  }

  if (staffIds.length > 0) {
    // Sample-only mop-up. We must NOT broad-delete by staffId alone — a
    // sample staff member may have legitimately served a real (non-sample)
    // student before the admin clicked teardown, and those records must
    // survive cleanup.
    //
    // Sessions/blocks tied to sample students were already deleted above
    // (studentIds branch). Anything left that points at sample staff is
    // tied to real students and must be preserved.

    // session_logs.staff_id is nullable — detach the staff pointer on any
    // remaining real-student sessions so the staff row can be deleted while
    // the historical session is kept for audit.
    await db.update(sessionLogsTable)
      .set({ staffId: null })
      .where(inArray(sessionLogsTable.staffId, staffIds));

    // schedule_blocks.staff_id is NOT NULL. We can't orphan-detach. So we
    // (a) delete only the blocks that are clearly sample-only (no student
    // OR student is also sample — already deleted above), and (b) for any
    // blocks tied to real students, "graduate" the sample staff member —
    // unset their is_sample flag so they remain in the district as a real
    // staff record alongside the real-student schedule blocks.
    const realStudentBlocks = await db.select({ staffId: scheduleBlocksTable.staffId })
      .from(scheduleBlocksTable)
      .where(inArray(scheduleBlocksTable.staffId, staffIds));
    const stillReferencedStaffIds = [...new Set(realStudentBlocks.map(b => b.staffId))];
    const safelyDeletableStaffIds = staffIds.filter(id => !stillReferencedStaffIds.includes(id));
    _safelyDeletableStaffIdsCount = safelyDeletableStaffIds.length;
    _stillReferencedStaffIdsCount = stillReferencedStaffIds.length;

    // Drop FK references on real service requirements / students that
    // happened to point at a sample staff that we ARE deleting.
    if (safelyDeletableStaffIds.length > 0) {
      await db.update(serviceRequirementsTable)
        .set({ providerId: null })
        .where(inArray(serviceRequirementsTable.providerId, safelyDeletableStaffIds));
      await db.update(studentsTable)
        .set({ caseManagerId: null })
        .where(inArray(studentsTable.caseManagerId, safelyDeletableStaffIds));
      await db.delete(staffTable).where(inArray(staffTable.id, safelyDeletableStaffIds));
    }

    // Graduate any remaining sample staff to real staff so their real-student
    // schedule blocks keep working.
    if (stillReferencedStaffIds.length > 0) {
      await db.update(staffTable)
        .set({ isSample: false })
        .where(inArray(staffTable.id, stillReferencedStaffIds));
    }
  }

  await db.update(districtsTable)
    .set({ hasSampleData: false })
    .where(eq(districtsTable.id, districtId));

  return {
    studentsRemoved: studentIds.length,
    staffRemoved: _safelyDeletableStaffIdsCount,
    staffGraduated: _stillReferencedStaffIdsCount,
  };
}
