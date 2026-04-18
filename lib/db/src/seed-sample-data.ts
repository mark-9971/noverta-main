/**
 * Per-tenant sample data seeder.
 *
 * Generates a rich, scenario-driven sample district inside an EXISTING tenant
 * so a brand-new admin can experience Trellis's value within minutes of signup.
 * Every row created here is tagged via `students.is_sample` / `staff.is_sample`
 * (or descended from one of those rows) so it can be cleanly removed with
 * `teardownSampleData()`.
 *
 * Scope:
 *   - 8 staff covering all roles (BCBA, SLP, OT, PT, Counselor, Case Manager, Para, Admin)
 *   - 50 students with realistic IEPs, goals, guardians, accommodations
 *   - 5 schools across K–12
 *   - 2+ service requirements per student, 3–5 measurable goals each
 *   - 90 days of session history driving 8 distinct compliance/clinical storylines
 *   - 2 resolved restraint incidents (DESE-reported) for incident-history student
 *   - 2 students with ESY determinations
 *   - 1 student with an active transition plan (post-secondary goals)
 *   - 3 students with IEP annual reviews due within 30 days
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
  restraintIncidentsTable,
  transitionPlansTable,
} from "./schema";

import { eq, and, inArray, sql } from "drizzle-orm";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ──────────────────────────────────────────────────────────────────
// Constants & helpers
// ──────────────────────────────────────────────────────────────────
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randf(min: number, max: number) { return min + Math.random() * (max - min); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

const SAMPLE_BOUNDS = {
  requiredMinutes: [60, 360] as const,
  startMinuteOfDay: [8 * 60, 14 * 60 + 30] as const,
  // Short-window scenarios (14-day): 2–5 sessions per requirement
  sessionsPerRequirement: [2, 5] as const,
  // Long-window narrative scenarios (90-day): 12–20 sessions per requirement
  // so trend graphs render clearly and "full session history" is realistic.
  sessionsPerRequirementNarrative: [12, 20] as const,
  compensatoryOwedFraction: {
    urgent: [0.30, 0.60] as const,
    compensatory_risk: [0.15, 0.45] as const,
    crisis: [0.55, 0.80] as const,
  },
  compensatoryDeliveredFraction: [0.05, 0.40] as const,
  // Minimum minutes owed for crisis students to guarantee >$3 K financial
  // exposure (at lowest billing rate of $55/hr, 3 300 min ≈ $3 025).
  crisisMinutesOwedFloor: 3300,
};

type Scenario =
  | "healthy"
  | "shortfall"
  | "urgent"
  | "compensatory_risk"
  | "recovered"
  | "sliding"
  | "crisis"
  | "transition"
  | "behavior_plan"
  | "incident_history"
  | "annual_review_due"
  | "esy_eligible";

const COMPLETION_RATE_RANGES: Record<Scenario, readonly [number, number]> = {
  healthy:           [0.78, 0.98],
  shortfall:         [0.45, 0.78],
  urgent:            [0.15, 0.45],
  compensatory_risk: [0.30, 0.60],
  recovered:         [0.88, 0.98], // recent portion; early portion overridden in session gen
  sliding:           [0.30, 0.50], // recent portion; early portion overridden in session gen
  crisis:            [0.20, 0.32], // 28% overall target
  transition:        [0.78, 0.95],
  behavior_plan:     [0.80, 0.95],
  incident_history:  [0.65, 0.85],
  annual_review_due: [0.72, 0.90],
  esy_eligible:      [0.70, 0.88],
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
function collectWeekdays(today: string, daysBack: number): string[] {
  const dates: string[] = [];
  for (let i = daysBack; i >= 1; i--) {
    const ds = addDays(today, -i);
    if (isWeekday(ds)) dates.push(ds);
  }
  return dates;
}

// ──────────────────────────────────────────────────────────────────
// Static data
// ──────────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  "Aiden", "Maya", "Jaden", "Sofia", "Marcus", "Priya",
  "Liam", "Zoe", "Ethan", "Harper", "Noah", "Camila",
  "Lucas", "Aria", "Oliver", "Amara", "Elijah", "Luna",
  "James", "Chloe", "Benjamin", "Riley", "Mason", "Nora",
  "Jayden", "Layla", "Sebastian", "Violet", "Mateo", "Penelope",
  "Logan", "Avery", "Jackson", "Ellie", "Amir", "Stella",
  "Isaiah", "Hannah", "Kai", "Gabrielle", "Dominic", "Naomi",
  "Wyatt", "Aaliyah", "Jordan", "Savannah", "Caleb", "Elena",
  "Nathan", "Brooklyn",
];
const LAST_NAMES = [
  "Anderson", "Bernier", "Cabral", "Hernandez", "Ibrahim",
  "Keane", "Morales", "Nguyen", "Patel", "Walsh",
  "Rivera", "Chen", "Johnson", "Williams", "Thompson",
  "Okonkwo", "Santos", "Reyes", "Kim", "Okafor",
];

const DISABILITY_MAP: Record<string, string[]> = {
  SLD: ["Specific Learning Disability"],
  ASD: ["Autism Spectrum Disorder"],
  OHI: ["Other Health Impairment"],
  SLI: ["Speech-Language Impairment"],
  ED:  ["Emotional Disturbance"],
  ID:  ["Intellectual Disability"],
  MD:  ["Multiple Disabilities"],
};
const DISABILITY_POOL: string[] = [
  ...Array(14).fill("Specific Learning Disability"),
  ...Array(8).fill("Speech-Language Impairment"),
  ...Array(5).fill("Autism Spectrum Disorder"),
  ...Array(5).fill("Other Health Impairment"),
  ...Array(3).fill("Emotional Disturbance"),
  ...Array(3).fill("Intellectual Disability"),
  ...Array(2).fill("Multiple Disabilities"),
];
const GRADES_ELEM  = ["K", "1", "2", "3", "4", "5"];
const GRADES_MIDDLE = ["6", "7", "8"];
const GRADES_HIGH  = ["9", "10", "11", "12"];
const GRADES_ALL   = [...GRADES_ELEM, ...GRADES_MIDDLE, ...GRADES_HIGH];

const SCHOOL_NAMES = [
  "Greenfield Elementary",
  "Riverside Middle School",
  "Lincoln Elementary",
  "Westview Middle School",
  "Central High School",
];

interface SampleStaffSeed {
  firstName: string; lastName: string; role: string;
  title: string; qualifications: string;
}
const SAMPLE_STAFF: SampleStaffSeed[] = [
  { firstName: "Katherine", lastName: "Reilly",   role: "bcba",         title: "Board Certified Behavior Analyst",    qualifications: "BCBA, M.Ed." },
  { firstName: "Rachel",    lastName: "Ferreira",  role: "provider",     title: "Speech-Language Pathologist",         qualifications: "CCC-SLP, M.S." },
  { firstName: "Jennifer",  lastName: "Walsh",     role: "provider",     title: "Occupational Therapist",              qualifications: "OTR/L, M.S." },
  { firstName: "David",     lastName: "Ostrowski", role: "provider",     title: "Physical Therapist",                  qualifications: "DPT, CSCS" },
  { firstName: "Lisa",      lastName: "Kowalski",  role: "provider",     title: "School Adjustment Counselor",         qualifications: "LICSW, M.S.W." },
  { firstName: "Andrew",    lastName: "Costa",     role: "case_manager", title: "SPED Case Manager",                   qualifications: "M.Ed. Special Education" },
  { firstName: "Maria",     lastName: "Delgado",   role: "provider",     title: "Special Education Paraprofessional",  qualifications: "B.A., 504 Training" },
  { firstName: "Thomas",    lastName: "Burke",     role: "admin",        title: "Director of Special Education",       qualifications: "Ed.D., SPED Administration" },
];

const SERVICE_TYPE_DEFAULTS = [
  { name: "Speech-Language Therapy", category: "speech",     color: "#06b6d4", defaultIntervalType: "monthly", cptCode: "92507", defaultBillingRate: "68.00" },
  { name: "Occupational Therapy",    category: "ot",         color: "#8b5cf6", defaultIntervalType: "monthly", cptCode: "97530", defaultBillingRate: "65.00" },
  { name: "Counseling",              category: "counseling", color: "#10b981", defaultIntervalType: "monthly", cptCode: "90837", defaultBillingRate: "55.00" },
  { name: "ABA Therapy",             category: "aba",        color: "#6366f1", defaultIntervalType: "monthly", cptCode: "97153", defaultBillingRate: "72.00" },
  { name: "Physical Therapy",        category: "pt",         color: "#f59e0b", defaultIntervalType: "monthly", cptCode: "97110", defaultBillingRate: "62.00" },
];

interface StudentSpec {
  id: number;
  scenario: Scenario;
  serviceTypeIds: number[];
  caseManagerId: number;
  schoolIndex: number;
}

// ──────────────────────────────────────────────────────────────────
// Goal content bank (varied across goal areas)
// ──────────────────────────────────────────────────────────────────
const GOAL_BANK: Record<string, Array<{ annual: string; baseline: string; criterion: string }>> = {
  "Communication": [
    { annual: "Student will initiate a topic-relevant comment during structured group discussions with 80% accuracy across 3 consecutive sessions.", baseline: "Student currently initiates comments 1–2 times per session with 30% relevance.", criterion: "80% accuracy across 3 consecutive sessions" },
    { annual: "Student will use AAC device to request preferred items in 4 of 5 opportunities without prompting.", baseline: "Student requires maximum prompting (hand-over-hand) to activate AAC device.", criterion: "4/5 opportunities independently" },
    { annual: "Student will produce multi-word utterances (3+ words) during structured play with 75% intelligibility.", baseline: "Student produces primarily single words; 40% intelligibility to unfamiliar listeners.", criterion: "75% intelligibility, 3+ word utterances across 4 probes" },
  ],
  "Social Skills": [
    { annual: "Student will initiate peer interaction during unstructured lunch/recess 3 times per week across 4 consecutive weeks.", baseline: "Student engages only when directly approached; peer initiations average <1/week.", criterion: "3 peer-initiated interactions per week across 4 consecutive weeks" },
    { annual: "Student will identify and label 5 basic emotions in self and peers using visual supports with 90% accuracy.", baseline: "Student labels 2 emotions (happy, sad) with 60% accuracy; requires adult support.", criterion: "90% accuracy across 2 consecutive probes" },
  ],
  "Self-Regulation": [
    { annual: "Student will independently use a self-monitoring checklist to transition between activities within 3 minutes, 80% of opportunities.", baseline: "Student requires 1:1 adult support to transition; average time 8–12 minutes.", criterion: "≤3 minutes independently, 80% of transitions" },
    { annual: "Student will use a calm-down strategy from the co-regulation menu in 4 of 5 observed escalation precursors without adult prompt.", baseline: "Student has not yet demonstrated independent use of any calm-down strategy.", criterion: "4/5 opportunities without adult prompt" },
    { annual: "Student will complete a 15-minute independent work block with <2 off-task behaviors per interval recording.", baseline: "Student averages 6–8 off-task behaviors per 15-minute block; requires frequent redirects.", criterion: "<2 off-task behaviors per 15-min block across 3 consecutive sessions" },
  ],
  "Academics": [
    { annual: "Student will decode multisyllabic words using syllable division strategies with 75% accuracy on grade-level passages.", baseline: "Student decodes CVC/CVCE patterns at 60%; multisyllabic accuracy is 25%.", criterion: "75% accuracy on grade-level decodable text, 3 consecutive probes" },
    { annual: "Student will solve two-step word problems involving addition and subtraction within 1,000 with 80% accuracy.", baseline: "Student solves single-step addition problems to 100 at 70%; multi-step at 20%.", criterion: "80% accuracy across 5 consecutive sessions" },
    { annual: "Student will produce a 3-paragraph expository essay using a graphic organizer with 80% of target components present.", baseline: "Student writes 1–2 disorganized sentences; does not independently use organizers.", criterion: "80% of rubric components present across 3 essays" },
  ],
  "Behavior": [
    { annual: "Student will maintain appropriate proximity to peers (≥18 inches) during class transitions in 9 of 10 observed opportunities.", baseline: "Student invades peer space in 60% of transitions; BIP recently initiated.", criterion: "9/10 opportunities across 4 consecutive school days" },
    { annual: "Student will accept redirection from adults without verbal or physical protest in 85% of observed trials.", baseline: "Student protests redirection (verbal: 70%, physical: 30% of trials).", criterion: "85% of trials across 3 consecutive days" },
  ],
  "Transition": [
    { annual: "Student will research and identify 3 post-secondary education programs aligned with career interests using online resources with 80% task completion.", baseline: "Student has not yet engaged in post-secondary planning activities.", criterion: "80% task completion across 3 independent work sessions" },
    { annual: "Student will complete a job application form accurately with ≤2 errors per form across 3 trials.", baseline: "Student requires step-by-step adult guidance to complete application sections.", criterion: "≤2 errors per form, 3 consecutive trials" },
    { annual: "Student will demonstrate mastery of 5 self-advocacy statements describing their disability-related needs in 4 of 4 role-play scenarios.", baseline: "Student cannot articulate accommodation needs without adult scripting.", criterion: "4/4 role-play scenarios across 2 consecutive probes" },
  ],
};

const ACCOM_BANK = [
  { category: "instruction",   description: "Extended time on assignments and assessments (time and one-half)" },
  { category: "instruction",   description: "Preferential seating near teacher and away from distractions" },
  { category: "instruction",   description: "Visual schedule and advance notice of transitions" },
  { category: "instruction",   description: "Directions chunked and repeated; use of check-in questions" },
  { category: "instruction",   description: "Reduced assignment length while maintaining rigor" },
  { category: "assessment",    description: "Small-group or individual testing environment" },
  { category: "assessment",    description: "Oral responses accepted in lieu of written work" },
  { category: "environmental", description: "Access to sensory tools (fidget, weighted lap pad, noise-cancelling headphones)" },
  { category: "environmental", description: "Movement breaks every 20–30 minutes" },
  { category: "behavioral",    description: "Daily check-in/check-out with case manager" },
  { category: "behavioral",    description: "Social narrative review before high-demand periods" },
  { category: "technology",    description: "Text-to-speech software for reading tasks" },
  { category: "technology",    description: "Speech-to-text software for written expression tasks" },
];

// ──────────────────────────────────────────────────────────────────
// Public API — status
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

// ──────────────────────────────────────────────────────────────────
// Session generation helpers
// ──────────────────────────────────────────────────────────────────

function buildSessionRows(
  spec: StudentSpec,
  sr: { id: number; studentId: number; providerId: number | null; serviceTypeId: number },
  dates: string[],
  completionRate: number,
  schoolYearId: number,
  /** Override the number of sessions sampled from `dates`. Defaults to the
   *  short-window range (2–5). Pass the narrative range for 90-day windows. */
  sessionsRange: readonly [number, number] = SAMPLE_BOUNDS.sessionsPerRequirement,
): (typeof sessionLogsTable.$inferInsert)[] {
  const rows: (typeof sessionLogsTable.$inferInsert)[] = [];
  const maxSessions = Math.min(sessionsRange[1], dates.length);
  const numSessions = rand(Math.min(sessionsRange[0], maxSessions), maxSessions);
  const chosenDates = [...dates].sort(() => Math.random() - 0.5).slice(0, numSessions);
  for (const date of chosenDates) {
    const completed = Math.random() < completionRate;
    const startMin = Math.round(
      rand(SAMPLE_BOUNDS.startMinuteOfDay[0], SAMPLE_BOUNDS.startMinuteOfDay[1]) / 5,
    ) * 5;
    rows.push({
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
      schoolYearId,
      notes: completed
        ? "Sample session — student engaged and made progress on goal."
        : "Sample session — student absent.",
    });
  }
  return rows;
}

// ──────────────────────────────────────────────────────────────────
// Main seeder
// ──────────────────────────────────────────────────────────────────

export async function seedSampleDataForDistrict(districtId: number): Promise<SeedSampleResult> {
  // ── 1. Prerequisites: district, schools, school year, service types ──

  const [district] = await db.select().from(districtsTable).where(eq(districtsTable.id, districtId));
  if (!district) throw new Error(`District ${districtId} not found`);

  // Ensure 5 schools exist
  let existingSchools = await db.select().from(schoolsTable).where(eq(schoolsTable.districtId, districtId));
  const schoolsToCreate = SCHOOL_NAMES.slice(existingSchools.length);
  if (schoolsToCreate.length > 0) {
    const newSchools = await db.insert(schoolsTable).values(
      schoolsToCreate.map(name => ({ districtId, name })),
    ).returning();
    existingSchools = [...existingSchools, ...newSchools];
  }
  // Use up to 5 schools
  const schools = existingSchools.slice(0, 5);
  // Fallback: if district had fewer than 5, fill remaining with the first school
  while (schools.length < 5) schools.push(schools[0]);

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
    serviceTypes = await db.insert(serviceTypesTable).values(SERVICE_TYPE_DEFAULTS).returning();
  }
  const svcByCategory = new Map(serviceTypes.map(s => [s.category, s]));
  // Resolve palette (fall back to first available for missing categories)
  const speech    = svcByCategory.get("speech")    ?? serviceTypes[0];
  const ot        = svcByCategory.get("ot")        ?? serviceTypes[0];
  const counseling = svcByCategory.get("counseling") ?? serviceTypes[0];
  const aba       = svcByCategory.get("aba")       ?? serviceTypes[0];
  const pt        = svcByCategory.get("pt")        ?? serviceTypes[0];

  // ── 2. Sample staff (8 members covering all roles) ──

  const insertedStaff = await db.insert(staffTable).values(
    SAMPLE_STAFF.map(s => ({
      firstName: s.firstName,
      lastName: s.lastName,
      role: s.role,
      title: s.title,
      qualifications: s.qualifications,
      email: `${s.firstName.toLowerCase()}.${s.lastName.toLowerCase()}@sample.trellis.local`,
      schoolId: schools[0].id,
      status: "active",
      isSample: true,
    })),
  ).returning();

  const caseManager = insertedStaff.find(s => s.role === "case_manager") ?? insertedStaff[0];
  const bcba        = insertedStaff.find(s => s.role === "bcba") ?? insertedStaff[0];
  const slp         = insertedStaff.find(s => s.title?.includes("Speech")) ?? insertedStaff[1];
  const otStaff     = insertedStaff.find(s => s.title?.includes("Occupational")) ?? insertedStaff[2];
  const ptStaff     = insertedStaff.find(s => s.title?.includes("Physical")) ?? insertedStaff[3];
  const counselor   = insertedStaff.find(s => s.title?.includes("Counselor")) ?? insertedStaff[4];
  const providers   = insertedStaff.filter(s => s.role === "provider" || s.role === "bcba");

  // ── 3. Student roster: 50 students across 5 schools ──
  //
  // Scenario distribution:
  //   healthy            20   (schools 0–4, K–8 mix)
  //   shortfall           8   (schools 0–3)
  //   urgent              3   (schools 0–1)
  //   compensatory_risk   4   (schools 1–3)
  //   recovered           2   (schools 0–1)   was at-risk → now 95%+
  //   sliding             2   (schools 2–3)   was on-track → now declining
  //   crisis              2   (school 0)      28% compliance, >$3K exposure
  //   transition          1   (school 4)      16-year-old, post-secondary goals
  //   behavior_plan       2   (schools 0–1)   active BIP, DTT + frequency data
  //   incident_history    1   (school 2)      2 resolved restraint incidents
  //   annual_review_due   3   (schools 2–4)   IEP due within 30 days
  //   esy_eligible        2   (schools 0–2)   documented ESY determination
  // ─────────────────────────────────────────────────
  //   Total              50

  type StudentSeedRow = {
    firstName: string; lastName: string; grade: string;
    disabilityCategory: string; schoolId: number; schoolIndex: number;
    caseManagerId: number; scenario: Scenario;
    dobYear: number; dobMonth: number; dobDay: number;
  };

  function dob(gradeStr: string): { y: number; m: number; d: number } {
    const gradeNum = gradeStr === "K" ? 0 : parseInt(gradeStr, 10);
    const age = gradeNum + 5 + rand(0, 1);
    const now = new Date();
    const y = now.getFullYear() - age;
    const m = rand(1, 12);
    const d = rand(1, 28);
    return { y, m, d };
  }

  const STUDENT_DEFS: Array<{
    scenario: Scenario; schoolIdx: number;
    grades: string[]; disability?: string;
  }> = [
    // Healthy — 20
    { scenario: "healthy", schoolIdx: 0, grades: GRADES_ELEM },
    { scenario: "healthy", schoolIdx: 0, grades: GRADES_ELEM },
    { scenario: "healthy", schoolIdx: 0, grades: GRADES_ELEM },
    { scenario: "healthy", schoolIdx: 0, grades: GRADES_MIDDLE },
    { scenario: "healthy", schoolIdx: 1, grades: GRADES_MIDDLE },
    { scenario: "healthy", schoolIdx: 1, grades: GRADES_MIDDLE },
    { scenario: "healthy", schoolIdx: 1, grades: GRADES_ELEM },
    { scenario: "healthy", schoolIdx: 2, grades: GRADES_ELEM },
    { scenario: "healthy", schoolIdx: 2, grades: GRADES_ELEM },
    { scenario: "healthy", schoolIdx: 2, grades: GRADES_MIDDLE },
    { scenario: "healthy", schoolIdx: 3, grades: GRADES_MIDDLE },
    { scenario: "healthy", schoolIdx: 3, grades: GRADES_MIDDLE },
    { scenario: "healthy", schoolIdx: 3, grades: GRADES_ELEM },
    { scenario: "healthy", schoolIdx: 4, grades: GRADES_HIGH },
    { scenario: "healthy", schoolIdx: 4, grades: GRADES_HIGH },
    { scenario: "healthy", schoolIdx: 4, grades: GRADES_HIGH },
    { scenario: "healthy", schoolIdx: 0, grades: GRADES_ELEM },
    { scenario: "healthy", schoolIdx: 1, grades: GRADES_MIDDLE },
    { scenario: "healthy", schoolIdx: 2, grades: GRADES_ELEM },
    { scenario: "healthy", schoolIdx: 3, grades: GRADES_MIDDLE },
    // Shortfall — 8
    { scenario: "shortfall", schoolIdx: 0, grades: GRADES_ELEM },
    { scenario: "shortfall", schoolIdx: 0, grades: GRADES_MIDDLE },
    { scenario: "shortfall", schoolIdx: 1, grades: GRADES_ELEM },
    { scenario: "shortfall", schoolIdx: 1, grades: GRADES_MIDDLE },
    { scenario: "shortfall", schoolIdx: 2, grades: GRADES_ELEM },
    { scenario: "shortfall", schoolIdx: 2, grades: GRADES_MIDDLE },
    { scenario: "shortfall", schoolIdx: 3, grades: GRADES_ELEM },
    { scenario: "shortfall", schoolIdx: 3, grades: GRADES_MIDDLE },
    // Urgent — 3
    { scenario: "urgent", schoolIdx: 0, grades: GRADES_ELEM },
    { scenario: "urgent", schoolIdx: 0, grades: GRADES_MIDDLE },
    { scenario: "urgent", schoolIdx: 1, grades: GRADES_ELEM },
    // Compensatory Risk — 4
    { scenario: "compensatory_risk", schoolIdx: 1, grades: GRADES_MIDDLE },
    { scenario: "compensatory_risk", schoolIdx: 2, grades: GRADES_ELEM },
    { scenario: "compensatory_risk", schoolIdx: 2, grades: GRADES_MIDDLE },
    { scenario: "compensatory_risk", schoolIdx: 3, grades: GRADES_ELEM },
    // Recovered — 2
    { scenario: "recovered", schoolIdx: 0, grades: GRADES_ELEM },
    { scenario: "recovered", schoolIdx: 1, grades: GRADES_MIDDLE },
    // Sliding — 2
    { scenario: "sliding", schoolIdx: 2, grades: GRADES_MIDDLE },
    { scenario: "sliding", schoolIdx: 3, grades: GRADES_ELEM },
    // Crisis — 2
    { scenario: "crisis", schoolIdx: 0, grades: GRADES_ELEM, disability: "Emotional Disturbance" },
    { scenario: "crisis", schoolIdx: 0, grades: GRADES_MIDDLE, disability: "Autism Spectrum Disorder" },
    // Transition — 1 (16-year-old, grade 10–11)
    { scenario: "transition", schoolIdx: 4, grades: ["10", "11"], disability: "Intellectual Disability" },
    // Behavior Plan — 2
    { scenario: "behavior_plan", schoolIdx: 0, grades: GRADES_ELEM, disability: "Autism Spectrum Disorder" },
    { scenario: "behavior_plan", schoolIdx: 1, grades: GRADES_ELEM, disability: "Emotional Disturbance" },
    // Incident History — 1
    { scenario: "incident_history", schoolIdx: 2, grades: GRADES_MIDDLE, disability: "Emotional Disturbance" },
    // Annual Review Due — 3
    { scenario: "annual_review_due", schoolIdx: 2, grades: GRADES_ELEM },
    { scenario: "annual_review_due", schoolIdx: 3, grades: GRADES_MIDDLE },
    { scenario: "annual_review_due", schoolIdx: 4, grades: GRADES_HIGH },
    // ESY Eligible — 2
    { scenario: "esy_eligible", schoolIdx: 0, grades: GRADES_ELEM, disability: "Intellectual Disability" },
    { scenario: "esy_eligible", schoolIdx: 2, grades: GRADES_ELEM, disability: "Autism Spectrum Disorder" },
  ];

  const today = new Date().toISOString().split("T")[0];
  const usedNames = new Set<string>();

  const studentRows = STUDENT_DEFS.map((def, i) => {
    // Unique name
    let firstName = "", lastName = "";
    let attempts = 0;
    do {
      firstName = FIRST_NAMES[rand(0, FIRST_NAMES.length - 1)];
      lastName  = LAST_NAMES[rand(0, LAST_NAMES.length - 1)];
      attempts++;
    } while (usedNames.has(`${firstName}${lastName}`) && attempts < 50);
    usedNames.add(`${firstName}${lastName}`);

    const grade = pick(def.grades);
    const { y, m, d: dom } = dob(grade);

    return {
      firstName,
      lastName,
      grade,
      disabilityCategory: def.disability ?? pick(DISABILITY_POOL),
      schoolId: schools[def.schoolIdx].id,
      caseManagerId: caseManager.id,
      status: "active",
      primaryLanguage: i % 7 === 0 ? "Spanish" : (i % 11 === 0 ? "Portuguese" : "English"),
      isSample: true,
      enrolledAt: addDays(today, -rand(60, 365)),
      dateOfBirth: `${y}-${String(m).padStart(2, "0")}-${String(dom).padStart(2, "0")}`,
      _scenario: def.scenario,
      _schoolIdx: def.schoolIdx,
    };
  });

  // Insert students (strip meta fields)
  const insertedStudents = await db.insert(studentsTable).values(
    studentRows.map(({ _scenario, _schoolIdx, ...row }) => row),
  ).returning();

  const studentSpecs: StudentSpec[] = insertedStudents.map((s, i) => {
    const def = STUDENT_DEFS[i];
    // Service type selection per scenario
    let serviceTypeIds: number[];
    switch (def.scenario) {
      case "behavior_plan":
        serviceTypeIds = [aba.id, (i % 2 === 0 ? counseling.id : speech.id)];
        break;
      case "transition":
        serviceTypeIds = [counseling.id, speech.id];
        break;
      case "incident_history":
        serviceTypeIds = [counseling.id, aba.id];
        break;
      case "esy_eligible":
        serviceTypeIds = [speech.id, ot.id];
        break;
      default: {
        // 2–3 services, varied by student index
        const palette = [speech.id, ot.id, counseling.id, aba.id, pt.id];
        const numSvc = rand(2, 3);
        serviceTypeIds = [...palette].sort(() => Math.random() - 0.5).slice(0, numSvc);
        break;
      }
    }
    return { id: s.id, scenario: def.scenario, serviceTypeIds, caseManagerId: caseManager.id, schoolIndex: def.schoolIdx };
  });

  // ── 4. IEP documents (scenario-specific dates) ──

  const iepRows: (typeof iepDocumentsTable.$inferInsert)[] = insertedStudents.map((s, i) => {
    const def = STUDENT_DEFS[i];
    let iepStartDate: string;
    let iepEndDate: string;
    let esyEligible: boolean | undefined;
    let esyServices: string | undefined;
    let esyJustification: string | undefined;

    switch (def.scenario) {
      case "annual_review_due":
        // IEP due within 30 days
        iepStartDate = addDays(today, -(365 - rand(1, 28)));
        iepEndDate   = addDays(today, rand(5, 28));
        break;
      case "esy_eligible":
        iepStartDate = addDays(today, -rand(90, 200));
        iepEndDate   = addDays(today, rand(120, 240));
        esyEligible  = true;
        esyServices  = "Speech-Language Therapy, Occupational Therapy";
        esyJustification = "Student demonstrates significant regression during school breaks based on 3-year trend data and provider observations. ESY determination supported by team consensus per DESE guidelines.";
        break;
      case "recovered":
        iepStartDate = addDays(today, -rand(150, 200));
        iepEndDate   = addDays(today, rand(150, 200));
        break;
      case "crisis":
        iepStartDate = addDays(today, -rand(60, 120));
        iepEndDate   = addDays(today, rand(200, 300));
        break;
      default:
        iepStartDate = addDays(today, -rand(90, 200));
        iepEndDate   = addDays(today, rand(120, 240));
    }

    return {
      studentId: s.id,
      iepStartDate,
      iepEndDate,
      status: "active",
      esyEligible,
      esyServices,
      esyJustification,
    };
  });
  const insertedIeps = await db.insert(iepDocumentsTable).values(iepRows).returning();
  const iepByStudent = new Map(insertedIeps.map(d => [d.studentId, d.id]));

  // ── 5. IEP goals (3–5 measurable goals per student) ──

  const goalRows: (typeof iepGoalsTable.$inferInsert)[] = [];
  const goalAreas = ["Communication", "Social Skills", "Self-Regulation", "Academics", "Behavior", "Transition"];

  for (const s of insertedStudents) {
    const idx = insertedStudents.indexOf(s);
    const def = STUDENT_DEFS[idx];
    const numGoals = rand(3, 5);

    // Transition student gets transition-specific goals
    const priorityAreas: string[] = def.scenario === "transition"
      ? ["Transition", "Academics", "Social Skills"]
      : def.scenario === "behavior_plan" || def.scenario === "incident_history"
        ? ["Behavior", "Self-Regulation", "Communication"]
        : [...goalAreas].sort(() => Math.random() - 0.5);

    const chosenAreas = priorityAreas.slice(0, numGoals);
    for (let g = 0; g < chosenAreas.length; g++) {
      const area = chosenAreas[g];
      const bank = GOAL_BANK[area] ?? GOAL_BANK["Academics"];
      const goal = pick(bank);
      goalRows.push({
        studentId: s.id,
        iepDocumentId: iepByStudent.get(s.id)!,
        goalArea: area,
        goalNumber: g + 1,
        annualGoal: goal.annual,
        baseline: goal.baseline,
        targetCriterion: goal.criterion,
        measurementMethod: pick(["Direct observation", "Curriculum-based measurement", "Work sample analysis", "Probe data", "Frequency count"]),
        status: "active",
      });
    }
  }

  // Mark the first goal of the first 3 "healthy" students as mastered
  // (spread across last 30 days so they show in the Recent Wins section)
  const healthyStudents = insertedStudents.filter((_, i) => STUDENT_DEFS[i].scenario === "healthy").slice(0, 3);
  let masteryDayOffset = 3;
  for (const hs of healthyStudents) {
    const hsGoals = goalRows.filter(r => r.studentId === hs.id);
    if (hsGoals.length > 0) {
      hsGoals[0].masteredAt = daysAgo(masteryDayOffset);
      hsGoals[0].status = "mastered";
      masteryDayOffset += rand(4, 8);
    }
  }

  await db.insert(iepGoalsTable).values(goalRows);

  // ── 6. Service requirements ──

  const srRows: (typeof serviceRequirementsTable.$inferInsert)[] = [];
  for (const spec of studentSpecs) {
    for (const stId of spec.serviceTypeIds) {
      // Assign provider matching service type
      let provider = providers[(spec.id + stId) % providers.length];
      if (stId === aba.id && bcba) provider = bcba;
      else if (stId === speech.id && slp) provider = slp;
      else if (stId === ot.id && otStaff) provider = otStaff;
      else if (stId === pt.id && ptStaff) provider = ptStaff;
      else if (stId === counseling.id && counselor) provider = counselor;

      // Crisis students need high required minutes to generate >$3K exposure
      const reqMin = spec.scenario === "crisis"
        ? rand(240, 360)
        : rand(SAMPLE_BOUNDS.requiredMinutes[0], SAMPLE_BOUNDS.requiredMinutes[1]);

      srRows.push({
        studentId: spec.id,
        serviceTypeId: stId,
        providerId: provider?.id ?? null,
        requiredMinutes: reqMin,
        intervalType: "monthly",
        deliveryType: "direct",
        setting: pick(["Resource Room", "General Education Classroom", "Therapy Room", "Self-Contained Classroom"]),
        active: true,
        startDate: addDays(today, -rand(30, 120)),
      });
    }
  }
  const insertedSrs = await db.insert(serviceRequirementsTable).values(srRows).returning();

  const srByStudent = new Map<number, typeof insertedSrs>();
  for (const sr of insertedSrs) {
    const list = srByStudent.get(sr.studentId) ?? [];
    list.push(sr);
    srByStudent.set(sr.studentId, list);
  }

  // ── 7. Session history (90 weekdays for narrative students, 14 for others) ──

  const dates90  = collectWeekdays(today, 90);
  const dates14  = collectWeekdays(today, 14);
  // Split for recovered / sliding scenarios
  const datesEarly = dates90.slice(0, Math.floor(dates90.length * 0.66));  // first ~60 days
  const datesRecent = dates90.slice(Math.floor(dates90.length * 0.66));    // last ~30 days

  const sessionRows: (typeof sessionLogsTable.$inferInsert)[] = [];

  for (const spec of studentSpecs) {
    const srs = srByStudent.get(spec.id) ?? [];
    for (const sr of srs) {
      const NR = SAMPLE_BOUNDS.sessionsPerRequirementNarrative;
      switch (spec.scenario) {
        case "recovered": {
          // Early: low compliance (~30%), recent: high (95%+) — both use
          // narrative density so trend lines are clearly visible on the graph.
          sessionRows.push(...buildSessionRows(spec, sr, datesEarly,  0.30, schoolYear.id, NR));
          sessionRows.push(...buildSessionRows(spec, sr, datesRecent, randf(0.92, 0.98), schoolYear.id, NR));
          break;
        }
        case "sliding": {
          // Early: high compliance (90%+), recent: declining (~40%)
          sessionRows.push(...buildSessionRows(spec, sr, datesEarly,  randf(0.88, 0.96), schoolYear.id, NR));
          sessionRows.push(...buildSessionRows(spec, sr, datesRecent, randf(0.35, 0.48), schoolYear.id, NR));
          break;
        }
        case "crisis": {
          // Low across full 90-day window (~28%), dense history for realism
          sessionRows.push(...buildSessionRows(spec, sr, dates90, randf(0.22, 0.32), schoolYear.id, NR));
          break;
        }
        case "behavior_plan":
        case "incident_history":
        case "transition":
        case "annual_review_due":
        case "esy_eligible": {
          // Full 90-day history with scenario rate, dense session log
          const [lo, hi] = COMPLETION_RATE_RANGES[spec.scenario];
          sessionRows.push(...buildSessionRows(spec, sr, dates90, randf(lo, hi), schoolYear.id, NR));
          break;
        }
        default: {
          // Standard 14-day window, standard density
          const [lo, hi] = COMPLETION_RATE_RANGES[spec.scenario];
          const rate = randf(lo, hi);
          sessionRows.push(...buildSessionRows(spec, sr, dates14, rate, schoolYear.id));
          break;
        }
      }
    }
  }

  if (sessionRows.length > 0) {
    for (let i = 0; i < sessionRows.length; i += 200) {
      await db.insert(sessionLogsTable).values(sessionRows.slice(i, i + 200));
    }
  }

  // ── 8. Schedule blocks (recurring weekly slots) ──

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

  // ── 9. Accommodations (3–4 per student) ──

  const accomRows: (typeof iepAccommodationsTable.$inferInsert)[] = [];
  for (const s of insertedStudents) {
    const numAccom = rand(3, 4);
    const chosen = [...ACCOM_BANK].sort(() => Math.random() - 0.5).slice(0, numAccom);
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

  // ── 10. Guardians + emergency contacts ──

  const GUARDIAN_FIRST = ["Maria", "John", "Patricia", "Robert", "Linda", "Michael", "Jennifer", "William"];
  const guardianRows: (typeof guardiansTable.$inferInsert)[] = [];
  const emergencyRows: (typeof emergencyContactsTable.$inferInsert)[] = [];
  for (const s of insertedStudents) {
    const guardianFirst = pick(GUARDIAN_FIRST);
    guardianRows.push({
      studentId: s.id,
      name: `${guardianFirst} ${s.lastName}`,
      relationship: pick(["Mother", "Father", "Legal Guardian"]),
      email: `parent.${s.lastName.toLowerCase()}${s.id}@sample.trellis.local`,
      phone: `(555) ${rand(200, 999)}-${rand(1000, 9999)}`,
      preferredContactMethod: pick(["email", "phone"]),
      contactPriority: 1,
    });
    // Second guardian (optional, ~60% of students)
    if (Math.random() < 0.6) {
      guardianRows.push({
        studentId: s.id,
        name: `${pick(GUARDIAN_FIRST)} ${s.lastName}`,
        relationship: pick(["Mother", "Father", "Step-Parent"]),
        email: `parent2.${s.lastName.toLowerCase()}${s.id}@sample.trellis.local`,
        phone: `(555) ${rand(200, 999)}-${rand(1000, 9999)}`,
        preferredContactMethod: "phone",
        contactPriority: 2,
      });
    }
    emergencyRows.push({
      studentId: s.id,
      firstName: pick(["Anna", "James", "Linda", "David", "Susan", "Richard"]),
      lastName: pick(LAST_NAMES),
      relationship: pick(["Aunt", "Uncle", "Grandparent", "Family Friend"]),
      phone: `(555) ${rand(200, 999)}-${rand(1000, 9999)}`,
      isAuthorizedForPickup: true,
      priority: 1,
    });
  }
  await db.insert(guardiansTable).values(guardianRows);
  await db.insert(emergencyContactsTable).values(emergencyRows);

  // ── 11. Alerts ──

  const alertRows: (typeof alertsTable.$inferInsert)[] = [];
  for (const spec of studentSpecs) {
    switch (spec.scenario) {
      case "crisis":
        alertRows.push({
          type: "compliance", severity: "high", studentId: spec.id,
          message: "Critical: Service delivery at 28% — significant compensatory obligation accruing. Financial exposure exceeds $3,000.",
          suggestedAction: "Convene emergency team meeting, develop intensive make-up plan, and notify district director.",
          resolved: false,
        });
        break;
      case "urgent":
        alertRows.push({
          type: "compliance", severity: "high", studentId: spec.id,
          message: "Service delivery below 50% — student at risk of compensatory obligation.",
          suggestedAction: "Schedule make-up sessions immediately and notify case manager.",
          resolved: false,
        });
        break;
      case "compensatory_risk":
        alertRows.push({
          type: "compliance", severity: "medium", studentId: spec.id,
          message: "Cumulative shortfall approaching compensatory threshold.",
          suggestedAction: "Calculate minutes owed and prepare a make-up plan.",
          resolved: false,
        });
        break;
      case "shortfall":
        alertRows.push({
          type: "compliance", severity: "medium", studentId: spec.id,
          message: "Service delivery below 80% this month.",
          suggestedAction: "Review scheduling and prioritize make-up sessions.",
          resolved: false,
        });
        break;
      case "sliding":
        alertRows.push({
          type: "compliance", severity: "medium", studentId: spec.id,
          message: "Compliance trending downward — was on-track in Q1, now below 50%.",
          suggestedAction: "Review provider schedule changes; confirm no service gaps.",
          resolved: false,
        });
        break;
      case "annual_review_due":
        alertRows.push({
          type: "iep", severity: "high", studentId: spec.id,
          message: "Annual IEP review due within 30 days. Team meeting must be scheduled.",
          suggestedAction: "Contact family to schedule annual IEP meeting and send prior written notice.",
          resolved: false,
        });
        break;
      case "incident_history":
        alertRows.push({
          type: "compliance", severity: "medium", studentId: spec.id,
          message: "Student has 2 documented restraint incidents this year. BIP review recommended.",
          suggestedAction: "Schedule BIP fidelity review with BCBA and update behavior support strategies.",
          resolved: false,
        });
        break;
    }
  }
  if (alertRows.length > 0) await db.insert(alertsTable).values(alertRows);

  // ── 12. Compensatory obligations (urgent + compensatory_risk + crisis) ──

  const compRows: (typeof compensatoryObligationsTable.$inferInsert)[] = [];
  for (const spec of studentSpecs) {
    if (!["urgent", "compensatory_risk", "crisis"].includes(spec.scenario)) continue;
    const srs = srByStudent.get(spec.id) ?? [];
    if (srs.length === 0) continue;

    for (const sr of srs.slice(0, 1)) {
      const owedRange = (SAMPLE_BOUNDS.compensatoryOwedFraction as Record<string, readonly [number, number]>)[spec.scenario]
        ?? SAMPLE_BOUNDS.compensatoryOwedFraction.urgent;
      const rawOwed = Math.round(sr.requiredMinutes * randf(owedRange[0], owedRange[1]));
      // Crisis students must exceed the >$3 K exposure threshold. At the
      // lowest billing rate ($55/hr) 3 300 min ≈ $3 025, so clamp upward.
      const minutesOwed = spec.scenario === "crisis"
        ? Math.max(rawOwed, SAMPLE_BOUNDS.crisisMinutesOwedFloor)
        : rawOwed;
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
        minutesDelivered: spec.scenario === "urgent" || spec.scenario === "crisis"
          ? 0
          : Math.round(minutesOwed * randf(delivLo, delivHi)),
        status: "pending",
        notes: spec.scenario === "crisis"
          ? "Critical shortfall — compensatory plan required; financial exposure exceeds $3,000."
          : spec.scenario === "urgent"
            ? "Significant shortfall — compensatory plan required."
            : "Partial gap identified during monthly compliance review.",
        source: "system",
      });
    }
  }
  if (compRows.length > 0) await db.insert(compensatoryObligationsTable).values(compRows);

  // ── 13. Restraint incidents for incident_history student ──

  const incidentStudent = insertedStudents.find((_, i) => STUDENT_DEFS[i].scenario === "incident_history");
  if (incidentStudent) {
    const primaryStaff = bcba ?? caseManager;
    const incidentRows: (typeof restraintIncidentsTable.$inferInsert)[] = [
      {
        studentId: incidentStudent.id,
        incidentDate: addDays(today, -rand(55, 70)),
        incidentTime: "10:15",
        endTime: "10:33",
        durationMinutes: 18,
        incidentType: "physical_restraint",
        location: "Special Education Classroom",
        precedingActivity: "Transition from math to reading block",
        triggerDescription: "Unexpected schedule change combined with peer conflict during transition.",
        behaviorDescription: "Student became verbally aggressive and attempted to overturn furniture; staff implemented brief physical restraint per approved CPI protocol to ensure safety.",
        deescalationAttempts: "Staff offered sensory break, used co-regulation strategies, and attempted verbal redirection for approximately 5 minutes prior to restraint.",
        alternativesAttempted: "Sensory break offered, verbal redirection attempted, peer removed from proximity.",
        justification: "Physical restraint necessary to prevent imminent harm to student and peers.",
        restraintType: "physical",
        restraintDescription: "Two-person basket hold per district-approved CPI protocol. Student was ambulatory and uninjured following de-escalation.",
        primaryStaffId: primaryStaff.id,
        principalNotifiedName: "Thomas Burke",
        principalNotifiedAt: addDays(today, -rand(55, 70)) + "T11:00:00",
        continuedOver20Min: false,
        calmingStrategiesUsed: "Sensory break, preferred item offer, quiet environment",
        studentStateAfter: "Calm, returned to classroom within 15 minutes",
        studentInjury: false,
        staffInjury: false,
        medicalAttentionRequired: false,
        parentVerbalNotification: true,
        parentVerbalNotificationAt: addDays(today, -rand(55, 70)) + "T12:30:00",
        parentNotified: true,
        parentNotifiedAt: addDays(today, -rand(55, 70)) + "T12:30:00",
        parentNotificationMethod: "Phone call",
        writtenReportSent: true,
        writtenReportSentAt: addDays(today, -rand(53, 68)) + "T08:00:00",
        writtenReportSentMethod: "Email with PDF attachment",
        parentCommentOpportunityGiven: true,
        parentComment: "Family expressed concern and requested additional BIP review meeting.",
        deseReportRequired: true,
        deseReportSentAt: addDays(today, -rand(50, 65)) + "T09:00:00",
        thirtyDayLogSentToDese: true,
        bipInPlace: true,
        physicalEscortOnly: false,
        timeToCalm: 18,
        debriefConducted: true,
        debriefDate: addDays(today, -rand(52, 67)),
        debriefNotes: "Team reviewed incident; BIP strategies reinforced. Additional sensory supports added to schedule.",
        status: "resolved",
        resolutionNote: "Incident reviewed, DESE report submitted. BIP updated with additional antecedent strategies. No further incidents in the following 2 weeks.",
        resolvedAt: addDays(today, -rand(48, 60)) + "T16:00:00",
      },
      {
        studentId: incidentStudent.id,
        incidentDate: addDays(today, -rand(20, 35)),
        incidentTime: "13:45",
        endTime: "13:59",
        durationMinutes: 14,
        incidentType: "physical_restraint",
        location: "Hallway — Transition to Lunch",
        precedingActivity: "Lunch transition; hallway crowded due to fire drill practice",
        triggerDescription: "Crowded hallway environment; student was bumped by peer, escalated to aggression.",
        behaviorDescription: "Student pushed two peers and struck a staff member; physical restraint initiated to prevent continued aggression.",
        deescalationAttempts: "Staff attempted verbal redirection and proximity; offered sensory break card. Student did not respond to initial strategies.",
        alternativesAttempted: "Verbal de-escalation, personal space given, sensory break offered.",
        justification: "Restraint necessary to protect peers and staff from physical harm.",
        restraintType: "physical",
        restraintDescription: "One-person standing restraint per CPI protocol. Duration 14 minutes; supervisor notified.",
        primaryStaffId: primaryStaff.id,
        principalNotifiedName: "Thomas Burke",
        principalNotifiedAt: addDays(today, -rand(20, 35)) + "T14:15:00",
        continuedOver20Min: false,
        calmingStrategiesUsed: "Deep breathing prompts, preferred music via headphones post-restraint",
        studentStateAfter: "Calm, agreed to debrief with counselor",
        studentInjury: false,
        staffInjury: true,
        staffInjuryDescription: "Minor bruising on forearm; no medical treatment required.",
        medicalAttentionRequired: false,
        parentVerbalNotification: true,
        parentVerbalNotificationAt: addDays(today, -rand(20, 35)) + "T15:00:00",
        parentNotified: true,
        parentNotifiedAt: addDays(today, -rand(20, 35)) + "T15:00:00",
        parentNotificationMethod: "Phone call",
        writtenReportSent: true,
        writtenReportSentAt: addDays(today, -rand(18, 33)) + "T08:00:00",
        writtenReportSentMethod: "Email with PDF attachment",
        parentCommentOpportunityGiven: true,
        deseReportRequired: true,
        deseReportSentAt: addDays(today, -rand(16, 31)) + "T09:00:00",
        thirtyDayLogSentToDese: true,
        bipInPlace: true,
        physicalEscortOnly: false,
        timeToCalm: 14,
        debriefConducted: true,
        debriefDate: addDays(today, -rand(17, 32)),
        debriefNotes: "Team reviewed; identified hallway transitions as high-risk. Added transition escort protocol to BIP.",
        status: "resolved",
        resolutionNote: "DESE report submitted. BIP amended: transition escort added, lunch seating arrangement modified to reduce crowding.",
        resolvedAt: addDays(today, -rand(14, 28)) + "T16:00:00",
      },
    ];
    await db.insert(restraintIncidentsTable).values(incidentRows);
  }

  // ── 14. Transition plan for transition student ──

  const transitionStudent = insertedStudents.find((_, i) => STUDENT_DEFS[i].scenario === "transition");
  if (transitionStudent) {
    const transIepId = iepByStudent.get(transitionStudent.id);
    await db.insert(transitionPlansTable).values({
      studentId: transitionStudent.id,
      iepDocumentId: transIepId ?? null,
      planDate: addDays(today, -rand(30, 90)),
      ageOfMajorityNotified: true,
      ageOfMajorityDate: addDays(today, -rand(60, 120)),
      graduationPathway: "Modified Diploma",
      expectedGraduationDate: addDays(today, rand(365, 730)),
      diplomaType: "Certificate of Completion",
      creditsEarned: "14",
      creditsRequired: "22",
      assessmentsUsed: "Transition Planning Inventory (TPI-2), Career Interest Survey, WorkSamples",
      studentVisionStatement: "After graduation, I want to work in a restaurant or grocery store and live in a supported apartment with help from a job coach. I enjoy cooking and want to learn more kitchen skills.",
      coordinatorId: caseManager.id,
      status: "active",
      notes: "Student is enrolled in vocational training at Central Vocational Center. Agency referral to DDS pending. Family is engaged and attended transition IEP meeting.",
    });
  }

  // ── 15. Goal progress backfill (90 days of ABA/clinical data) ──

  const { backfillGoalProgressForStudents } = await import("./backfill-goal-progress");
  await backfillGoalProgressForStudents(insertedStudents.map((s) => s.id));

  // ── 16. Mark district ──

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

// ──────────────────────────────────────────────────────────────────
// Teardown
// ──────────────────────────────────────────────────────────────────

export interface TeardownSampleResult {
  studentsRemoved: number;
  staffRemoved: number;
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

  if (studentIds.length > 0) {
    await db.transaction(async (tx) => {
      // program_data / behavior_data (cascade on data_sessions, but be explicit)
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

      // Restraint incidents (no cascade from students)
      await tx.delete(restraintIncidentsTable).where(inArray(restraintIncidentsTable.studentId, studentIds));

      // Transition plans (no cascade from students)
      await tx.delete(transitionPlansTable).where(inArray(transitionPlansTable.studentId, studentIds));

      // BIPs / FBAs
      await tx.delete(behaviorInterventionPlansTable).where(inArray(behaviorInterventionPlansTable.studentId, studentIds));
      await tx.execute(sql`
        DELETE FROM fba_observations
        WHERE fba_id IN (SELECT id FROM fbas WHERE student_id IN ${sql.raw("(" + studentIds.join(",") + ")")})
      `);
      await tx.execute(sql`
        DELETE FROM functional_analyses
        WHERE fba_id IN (SELECT id FROM fbas WHERE student_id IN ${sql.raw("(" + studentIds.join(",") + ")")})
      `);
      await tx.delete(fbasTable).where(inArray(fbasTable.studentId, studentIds));

      // Sessions / schedule / compliance
      await tx.delete(sessionLogsTable).where(inArray(sessionLogsTable.studentId, studentIds));
      await tx.delete(scheduleBlocksTable).where(inArray(scheduleBlocksTable.studentId, studentIds));
      await tx.delete(compensatoryObligationsTable).where(inArray(compensatoryObligationsTable.studentId, studentIds));
      await tx.delete(alertsTable).where(inArray(alertsTable.studentId, studentIds));
      await tx.delete(serviceRequirementsTable).where(inArray(serviceRequirementsTable.studentId, studentIds));
      await tx.delete(iepAccommodationsTable).where(inArray(iepAccommodationsTable.studentId, studentIds));
      // Goals before targets
      await tx.delete(iepGoalsTable).where(inArray(iepGoalsTable.studentId, studentIds));
      await tx.delete(programTargetsTable).where(inArray(programTargetsTable.studentId, studentIds));
      await tx.delete(behaviorTargetsTable).where(inArray(behaviorTargetsTable.studentId, studentIds));
      await tx.delete(iepDocumentsTable).where(inArray(iepDocumentsTable.studentId, studentIds));
      // Parent messages + medical alerts
      await tx.delete(parentMessagesTable).where(inArray(parentMessagesTable.studentId, studentIds));
      await tx.delete(medicalAlertsTable).where(inArray(medicalAlertsTable.studentId, studentIds));
      await tx.delete(guardiansTable).where(inArray(guardiansTable.studentId, studentIds));
      await tx.delete(emergencyContactsTable).where(inArray(emergencyContactsTable.studentId, studentIds));
      // Detach case-manager refs before deleting students
      await tx.update(studentsTable)
        .set({ caseManagerId: null })
        .where(inArray(studentsTable.id, studentIds));
      await tx.delete(studentsTable).where(inArray(studentsTable.id, studentIds));
    });
  }

  if (staffIds.length > 0) {
    await db.update(sessionLogsTable)
      .set({ staffId: null })
      .where(inArray(sessionLogsTable.staffId, staffIds));

    const realStudentBlocks = await db.select({ staffId: scheduleBlocksTable.staffId })
      .from(scheduleBlocksTable)
      .where(inArray(scheduleBlocksTable.staffId, staffIds));
    const stillReferencedStaffIds = [...new Set(realStudentBlocks.map(b => b.staffId))];
    const safelyDeletableStaffIds = staffIds.filter(id => !stillReferencedStaffIds.includes(id));
    _safelyDeletableStaffIdsCount = safelyDeletableStaffIds.length;
    _stillReferencedStaffIdsCount = stillReferencedStaffIds.length;

    if (safelyDeletableStaffIds.length > 0) {
      await db.update(serviceRequirementsTable)
        .set({ providerId: null })
        .where(inArray(serviceRequirementsTable.providerId, safelyDeletableStaffIds));
      await db.update(studentsTable)
        .set({ caseManagerId: null })
        .where(inArray(studentsTable.caseManagerId, safelyDeletableStaffIds));
      await db.delete(staffTable).where(inArray(staffTable.id, safelyDeletableStaffIds));
    }

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
