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
 *   - 180 days of session history driving 8 distinct compliance/clinical storylines
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
  progressReportsTable,
  teamMeetingsTable,
  evaluationsTable,
  complianceEventsTable,
  communicationEventsTable,
  sessionGoalDataTable,
} from "./schema";
import type { GoalProgressEntry } from "./schema";

import { eq, and, inArray, sql } from "drizzle-orm";

/**
 * Insert a row array in chunks to stay below PostgreSQL's 65 535 bind-param
 * limit. With 2 000-student demos, several tables (iep_goals, students,
 * service_requirements, accommodations, …) blow past the limit when sent as
 * a single VALUES list. Default chunk of 400 keeps every table comfortably
 * under the cap (400 × ~30 cols = 12 000 params).
 */
async function chunkedInsert<T extends Record<string, unknown>>(
  table: any,
  rows: T[],
  opts: { chunk?: number; returning?: boolean } = {},
): Promise<any[]> {
  const chunk = opts.chunk ?? 400;
  const out: any[] = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    if (slice.length === 0) continue;
    if (opts.returning) {
      const r = await (db.insert(table).values(slice) as any).returning();
      out.push(...r);
    } else {
      await db.insert(table).values(slice);
    }
  }
  return out;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ──────────────────────────────────────────────────────────────────
// Constants & helpers
// ──────────────────────────────────────────────────────────────────
//
// Seeded RNG (mulberry32). All `rand`/`randf`/`pick`/`srand`/`sshuffle`
// calls below route through this state so two runs against the same
// district id produce byte-identical rosters, sessions, etc. — a hard
// requirement for reproducible 30-district pilot demos. `setSeed()` is
// invoked at the top of `seedSampleDataForDistrict()`.
let _seedState = 0x9e3779b9 >>> 0;
function setSeed(seedSrc: number) {
  // Mix the input through a small avalanche so adjacent district ids
  // (6, 7, 8, …) produce visibly different streams instead of nearby ones.
  let x = (seedSrc | 0) || 0x9e3779b9;
  x = (x ^ 0xdeadbeef) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  _seedState = x || 0x9e3779b9;
}
function srand(): number {
  // mulberry32
  _seedState = (_seedState + 0x6d2b79f5) >>> 0;
  let t = _seedState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rand(min: number, max: number) { return Math.floor(srand() * (max - min + 1)) + min; }
function randf(min: number, max: number) { return min + srand() * (max - min); }
function pick<T>(arr: ReadonlyArray<T>): T { return arr[Math.floor(srand() * arr.length)]; }
function sshuffle<T>(arr: ReadonlyArray<T>): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(srand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const SAMPLE_BOUNDS = {
  requiredMinutes: [60, 360] as const,
  startMinuteOfDay: [8 * 60, 14 * 60 + 30] as const,
  // Short-window scenarios (14-day): 2–5 sessions per requirement
  sessionsPerRequirement: [2, 5] as const,
  // Long-window narrative scenarios (180-day): 24–40 sessions per requirement
  // so trend graphs render clearly and "full session history" is realistic
  // across the extended ~6-month pilot demo window.
  sessionsPerRequirementNarrative: [24, 40] as const,
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

/**
 * District size profile. Controls how many students and staff a sample
 * district receives so pilot demos can show realistic range — a small
 * single-school district shouldn't look the same as a large urban one.
 *
 *   - "small":  ~20 students,  3 staff   (caseload ~20:1)
 *   - "medium": ~60 students, 10 staff   (caseload ~20:1) — DEFAULT
 *   - "large":  ~120 students, 18 staff  (caseload ~20:1)
 *   - "random": picks small / medium / large at random
 *
 * All profiles keep the case-manager-to-student ratio within MA SPED
 * guidance (~15–22 students per case manager) and preserve the canonical
 * narrative scenarios (crisis, transition, BIP, incident history, etc.)
 * so dashboards always have meaningful storylines to show.
 */
export type SizeProfile = "small" | "medium" | "large" | "random";

const SIZE_PROFILES = {
  small:  { students: 20,  staff: 3  },
  medium: { students: 60,  staff: 10 },
  large:  { students: 120, staff: 18 },
} as const;

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

/**
 * Pool of named staff members the seeder draws from. Each profile picks a
 * subset so that role coverage scales with district size while keeping
 * MA SPED-realistic caseloads (~15–22 students per case manager).
 *
 * Order matters: items earlier in each role's group are preferred when a
 * profile only needs one (so the medium profile keeps the same primary
 * BCBA / SLP / OT names that earlier seeds produced).
 */
const SAMPLE_STAFF_POOL: SampleStaffSeed[] = [
  // Case managers (added in order as profile size grows)
  { firstName: "Andrew",    lastName: "Costa",     role: "case_manager", title: "SPED Case Manager",                   qualifications: "M.Ed. Special Education" },
  { firstName: "Nicole",    lastName: "Hartmann",  role: "case_manager", title: "SPED Case Manager",                   qualifications: "M.Ed. Special Education" },
  { firstName: "Brian",     lastName: "O'Connell", role: "case_manager", title: "SPED Case Manager",                   qualifications: "M.Ed. Special Education" },
  { firstName: "Sandra",    lastName: "Vasquez",   role: "case_manager", title: "SPED Case Manager",                   qualifications: "M.Ed. Special Education" },
  { firstName: "Daniel",    lastName: "Park",      role: "case_manager", title: "SPED Case Manager",                   qualifications: "M.Ed. Special Education" },
  { firstName: "Allison",   lastName: "Greene",    role: "case_manager", title: "SPED Case Manager",                   qualifications: "M.Ed. Special Education" },
  // BCBAs
  { firstName: "Katherine", lastName: "Reilly",    role: "bcba",         title: "Board Certified Behavior Analyst",    qualifications: "BCBA, M.Ed." },
  { firstName: "Marcus",    lastName: "Whitfield", role: "bcba",         title: "Board Certified Behavior Analyst",    qualifications: "BCBA, M.S." },
  // Speech-language pathologists
  { firstName: "Rachel",    lastName: "Ferreira",  role: "provider",     title: "Speech-Language Pathologist",         qualifications: "CCC-SLP, M.S." },
  { firstName: "Hannah",    lastName: "Bishop",    role: "provider",     title: "Speech-Language Pathologist",         qualifications: "CCC-SLP, M.S." },
  // Occupational therapists
  { firstName: "Jennifer",  lastName: "Walsh",     role: "provider",     title: "Occupational Therapist",              qualifications: "OTR/L, M.S." },
  { firstName: "Olivia",    lastName: "Sanderson", role: "provider",     title: "Occupational Therapist",              qualifications: "OTR/L, M.S." },
  // Physical therapists
  { firstName: "David",     lastName: "Ostrowski", role: "provider",     title: "Physical Therapist",                  qualifications: "DPT, CSCS" },
  // Counselors
  { firstName: "Lisa",      lastName: "Kowalski",  role: "provider",     title: "School Adjustment Counselor",         qualifications: "LICSW, M.S.W." },
  { firstName: "Gregory",   lastName: "Talbot",    role: "provider",     title: "School Adjustment Counselor",         qualifications: "LICSW, M.S.W." },
  // Paraprofessionals
  { firstName: "Maria",     lastName: "Delgado",   role: "provider",     title: "Special Education Paraprofessional",  qualifications: "B.A., 504 Training" },
  { firstName: "Joseph",    lastName: "Mendes",    role: "provider",     title: "Special Education Paraprofessional",  qualifications: "B.A., 504 Training" },
  // Admin
  { firstName: "Thomas",    lastName: "Burke",     role: "admin",        title: "Director of Special Education",       qualifications: "Ed.D., SPED Administration" },
];

/**
 * Per-profile staff composition. Counts are tuned so the case-manager-to-
 * student ratio stays within MA SPED guidance (~15–22:1) while every
 * specialty role required by the seeded scenarios is covered:
 *   - small  (20/3):  1 CM, 1 BCBA, 1 SLP — CM doubles for OT/PT/counseling
 *                     fall-throughs (the seeder already has `?? insertedStaff[0]`
 *                     fallbacks for those service types)
 *   - medium (60/10): 3 CMs (~20 students each) + full specialty coverage
 *   - large  (120/18): 6 CMs (~20 each) + duplicated specialists for realism
 */
const STAFF_BY_PROFILE: Record<Exclude<SizeProfile, "random">, Array<{ role: string; titleIncludes?: string; count: number }>> = {
  small: [
    { role: "case_manager", count: 1 },
    { role: "bcba",         count: 1 },
    { role: "provider", titleIncludes: "Speech",       count: 1 },
  ],
  medium: [
    { role: "case_manager", count: 3 },
    { role: "bcba",         count: 1 },
    { role: "provider", titleIncludes: "Speech",       count: 1 },
    { role: "provider", titleIncludes: "Occupational", count: 1 },
    { role: "provider", titleIncludes: "Physical",     count: 1 },
    { role: "provider", titleIncludes: "Counselor",    count: 1 },
    { role: "provider", titleIncludes: "Paraprofessional", count: 1 },
    { role: "admin",        count: 1 },
  ],
  large: [
    { role: "case_manager", count: 6 },
    { role: "bcba",         count: 2 },
    { role: "provider", titleIncludes: "Speech",       count: 2 },
    { role: "provider", titleIncludes: "Occupational", count: 2 },
    { role: "provider", titleIncludes: "Physical",     count: 1 },
    { role: "provider", titleIncludes: "Counselor",    count: 2 },
    { role: "provider", titleIncludes: "Paraprofessional", count: 2 },
    { role: "admin",        count: 1 },
  ],
};

/**
 * MA-SPED student-to-staff ratios used to scale staff counts when the roster
 * exceeds the per-profile baseline (e.g. the 2,000-student stress seed).
 * Keys match `STAFF_BY_PROFILE` slots: either the role alone, or
 * `${role}:${titleIncludes}` for provider sub-specialties.
 */
const STAFF_RATIOS: Record<string, number> = {
  "case_manager":              22,   // MA SPED guideline: 15–22 students per CM
  "bcba":                      80,
  "provider:Speech":           75,
  "provider:Occupational":     80,
  "provider:Physical":        250,
  "provider:Counselor":       150,
  "provider:Paraprofessional": 60,
  "admin":                    250,
};

function buildStaffSeeds(
  profile: Exclude<SizeProfile, "random">,
  targetStudents?: number,
  shape?: SeedShape,
): SampleStaffSeed[] {
  const out: SampleStaffSeed[] = [];
  // Distribute the user-supplied "providerCount" across the four specialty
  // slots (Speech / Occupational / Physical / Counselor) when present.
  // Splits as evenly as possible: extras land in the earlier slots.
  const providerSlotKeys = ["provider:Speech", "provider:Occupational", "provider:Physical", "provider:Counselor"];
  let providerSplit: Map<string, number> | null = null;
  if (shape?.staffOverrides.provider != null) {
    providerSplit = new Map();
    const total = Math.max(0, Math.floor(shape.staffOverrides.provider));
    const base = Math.floor(total / providerSlotKeys.length);
    let rem = total - base * providerSlotKeys.length;
    for (const k of providerSlotKeys) {
      providerSplit.set(k, base + (rem > 0 ? 1 : 0));
      if (rem > 0) rem--;
    }
  }
  for (const slot of STAFF_BY_PROFILE[profile]) {
    const ratioKey = slot.titleIncludes ? `${slot.role}:${slot.titleIncludes}` : slot.role;
    const ratio = STAFF_RATIOS[ratioKey];
    // Per-knob overrides take precedence over the auto-scaled ratio.
    let scaledCount: number;
    const ovr = shape?.staffOverrides;
    if (ovr?.caseManager != null && slot.role === "case_manager") {
      scaledCount = Math.max(0, Math.floor(ovr.caseManager));
    } else if (ovr?.bcba != null && slot.role === "bcba") {
      scaledCount = Math.max(0, Math.floor(ovr.bcba));
    } else if (ovr?.paraprofessional != null && ratioKey === "provider:Paraprofessional") {
      scaledCount = Math.max(0, Math.floor(ovr.paraprofessional));
    } else if (providerSplit && providerSplit.has(ratioKey)) {
      scaledCount = providerSplit.get(ratioKey)!;
    } else if (targetStudents && ratio) {
      // staffingStrain skews the ratio: high strain → more students per
      // staff (ceil(students / (ratio × multiplier))), low strain →
      // fewer students per staff. Defaults to 1× when shape absent.
      const mult = shape?.staffRatioMultiplier ?? 1;
      const effRatio = Math.max(1, ratio * mult);
      scaledCount = Math.max(slot.count, Math.ceil(targetStudents / effRatio));
    } else {
      scaledCount = slot.count;
    }

    const candidates = SAMPLE_STAFF_POOL.filter(p =>
      p.role === slot.role
      && (slot.titleIncludes ? p.title.includes(slot.titleIncludes) : true)
      && !out.includes(p)
    );

    // Take the named candidates first so the canonical roster (small/medium
    // profiles) keeps the same primary names; synthesize the remainder when
    // the scaled-up count exceeds the static pool.
    let added = 0;
    for (const c of candidates) {
      if (added >= scaledCount) break;
      out.push(c);
      added++;
    }
    if (added < scaledCount) {
      const templateTitle = candidates[0]?.title ?? slot.titleIncludes ?? slot.role;
      const templateQuals = candidates[0]?.qualifications ?? "";
      // Per-slot tag guarantees emails are globally unique across slots even
      // when two slots happen to scale to the same count (e.g. case_manager
      // and bcba both hit ceil(N/22) for some N). `staff.email` has no DB
      // unique constraint today, so collisions silently break ambiguity in
      // downstream lookups.
      const slotTag = (slot.titleIncludes ?? slot.role)
        .replace(/[^A-Za-z]/g, "")
        .slice(0, 4)
        .toLowerCase();
      let synthIdx = 0;
      while (added < scaledCount) {
        const fn = FIRST_NAMES[(synthIdx * 17 + scaledCount * 7) % FIRST_NAMES.length];
        const ln = LAST_NAMES[(synthIdx * 11 + scaledCount * 13) % LAST_NAMES.length];
        out.push({
          firstName: fn,
          // `${ln}-${slotTag}${n}` is unique per (slot, ordinal) → unique email.
          lastName: `${ln}-${slotTag}${synthIdx + 1}`,
          role: slot.role,
          title: templateTitle,
          qualifications: templateQuals,
        });
        added++;
        synthIdx++;
      }
    }
  }
  return out;
}

// 11 default service types covering the requested catalog: 5 direct
// services + 3 academic/APE interventions + 3 consult variants. Consult
// variants reuse the same CPT code as their direct parent (consult time
// is bundled under the same procedure code by Medicaid in MA) but at a
// lower hourly rate to reflect indirect service delivery.
const SERVICE_TYPE_DEFAULTS = [
  // Direct services
  { name: "Speech-Language Therapy", category: "speech",     color: "#06b6d4", defaultIntervalType: "monthly", cptCode: "92507", defaultBillingRate: "68.00" },
  { name: "Occupational Therapy",    category: "ot",         color: "#8b5cf6", defaultIntervalType: "monthly", cptCode: "97530", defaultBillingRate: "65.00" },
  { name: "Counseling",              category: "counseling", color: "#10b981", defaultIntervalType: "monthly", cptCode: "90837", defaultBillingRate: "55.00" },
  { name: "ABA Therapy",             category: "aba",        color: "#6366f1", defaultIntervalType: "monthly", cptCode: "97153", defaultBillingRate: "72.00" },
  { name: "Physical Therapy",        category: "pt",         color: "#f59e0b", defaultIntervalType: "monthly", cptCode: "97110", defaultBillingRate: "62.00" },
  // Academic interventions + APE
  { name: "Specialized Reading",     category: "reading",    color: "#ef4444", defaultIntervalType: "monthly", cptCode: null,    defaultBillingRate: "52.00" },
  { name: "Math Intervention",       category: "math",       color: "#f97316", defaultIntervalType: "monthly", cptCode: null,    defaultBillingRate: "52.00" },
  { name: "Adaptive Physical Education", category: "ape",    color: "#84cc16", defaultIntervalType: "monthly", cptCode: null,    defaultBillingRate: "58.00" },
  // Consult variants (indirect service: provider consults with classroom
  // teacher / paraprofessional rather than delivering 1:1)
  { name: "Speech Consult",          category: "speech_consult",     color: "#0891b2", defaultIntervalType: "monthly", cptCode: "92507", defaultBillingRate: "55.00" },
  { name: "OT Consult",              category: "ot_consult",         color: "#7c3aed", defaultIntervalType: "monthly", cptCode: "97530", defaultBillingRate: "52.00" },
  { name: "Counseling Consult",      category: "counseling_consult", color: "#059669", defaultIntervalType: "monthly", cptCode: "90837", defaultBillingRate: "44.00" },
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
  sizeProfile: Exclude<SizeProfile, "random">;
}

/** Three-level slider used by the v1 custom-seed inputs. */
export type Intensity = "low" | "medium" | "high";

/** Demo narrative the seeded data should emphasize. */
export type DemoEmphasis =
  | "compliance"
  | "comp_ed"
  | "caseload"
  | "behavior"
  | "executive";

export interface SeedSampleOptions {
  /** District size profile. Defaults to "medium". See `SizeProfile` for details. */
  sizeProfile?: SizeProfile;
  /**
   * Optional override for total student count. Bypasses the per-profile cap
   * (small=20 / medium=60 / large=120) and the default 50-100 random range.
   * Special-scenario counts still come from the chosen sizeProfile; the
   * remainder is filled with healthy students. Useful for stress / load
   * scenarios where dashboards need to render against a much larger roster
   * (e.g. district-wide demos with ~2000 students). Staff count is NOT
   * auto-scaled — it follows the chosen `sizeProfile` (use "large" when
   * paired with a big `targetStudents` to get the fullest staff roster the
   * SAMPLE_STAFF_POOL allows).
   */
  targetStudents?: number;

  // ── v1 custom-seed inputs (admin "Custom sample data" form) ──
  // All fields are optional; omitting one keeps the existing default. Each
  // knob has a measurable effect on the seeded roster so the form can be
  // used to tailor a demo to a specific story (compliance crisis, comp-ed
  // exposure, behavior-heavy district, etc.).

  /** Display name when the seeder has to auto-provision the district stub. */
  districtName?: string;
  /** Number of schools to use (1–12). Defaults to 5. */
  schoolCount?: number;
  /** Override case-manager count. Without this, count auto-scales from roster size. */
  caseManagerCount?: number;
  /** Override total non-para provider count (split across SLP/OT/PT/Counselor). */
  providerCount?: number;
  /** Override paraprofessional count. */
  paraCount?: number;
  /** Override BCBA count. */
  bcbaCount?: number;
  /** Average IEP goals per student (1–25). Defaults to 15–20 random — matches
   *  realistic MA SPED IEPs which carry one goal per service area plus
   *  multiple objectives per area. */
  avgGoalsPerStudent?: number;
  /** Average required service minutes per week (30–300). Defaults to ~15–90/wk. */
  avgRequiredMinutesPerWeek?: number;
  /** How many months of session history to backfill (1–12). Defaults to ~8. */
  backfillMonths?: number;
  /** Compliance health: low → more shortfalls; high → mostly on-track. */
  complianceHealth?: Intensity;
  /** Staffing strain: low → light caseloads; high → over-stretched providers. */
  staffingStrain?: Intensity;
  /** Documentation quality: low → high logging lag; high → mostly on-time. */
  documentationQuality?: Intensity;
  /** Compensatory exposure: scales crisis + compensatory_risk scenarios. */
  compensatoryExposure?: Intensity;
  /** Behavior intensity: scales behavior_plan + incident_history scenarios. */
  behaviorIntensity?: Intensity;
  /** Demo story focus — boosts the headline scenarios for that narrative. */
  demoEmphasis?: DemoEmphasis;
}

/**
 * Resolved knob bundle that the seeder body actually reads. Built once at the
 * top of `seedSampleDataForDistrict()` so every downstream insertion can
 * branch on the *same* config without re-deriving it.
 */
interface SeedShape {
  schoolCount: number;
  goalsRange: readonly [number, number];
  reqMinutesMonthlyRange: readonly [number, number];
  backfillDays: number;
  completionMultiplier: number;
  onTimeLogProb: number;
  staffRatioMultiplier: number;
  scenarioWeights: Partial<Record<Exclude<Scenario, "healthy">, number>>;
  staffOverrides: { caseManager?: number; bcba?: number; provider?: number; paraprofessional?: number };
}

// Intensity-tier multipliers as RANGES rather than fixed magic numbers.
// Each call to resolveSeedShape samples a single value from the appropriate
// band so successive seed runs don't pin to the same target. Bands overlap
// modestly between adjacent tiers (e.g. low.completion can graze medium)
// so a "low compliance" seed isn't always identifiably worse than a
// "medium" one — that's intentional realism, not a bug.
const INTENSITY_TO_COMPLETION_RANGE: Record<Intensity, readonly [number, number]> = {
  low:    [0.55, 0.78],
  medium: [0.85, 1.10],
  high:   [1.10, 1.30],
};
const INTENSITY_TO_ONTIME_RANGE: Record<Intensity, readonly [number, number]> = {
  low:    [0.35, 0.55],
  medium: [0.65, 0.85],
  high:   [0.88, 0.97],
};
const INTENSITY_TO_STAFFRATIO_RANGE: Record<Intensity, readonly [number, number]> = {
  low:    [0.55, 0.85],
  medium: [0.90, 1.15],
  high:   [1.30, 1.70],
};
const INTENSITY_TO_SCALE_RANGE: Record<Intensity, readonly [number, number]> = {
  low:    [0.30, 0.55],
  medium: [0.85, 1.20],
  high:   [1.55, 2.05],
};

function resolveSeedShape(opts: SeedSampleOptions): SeedShape {
  const schoolCount = Math.max(1, Math.min(12, opts.schoolCount ?? 5));

  // Goals/student: center on the requested mean, ±2. Default band 15–20
  // mirrors real MA SPED IEPs (one annual goal per service area + multiple
  // objectives per area). Hard cap 25 keeps insert volume bounded for the
  // 2,000-student demo (≤50k iep_goals rows).
  const g = opts.avgGoalsPerStudent != null
    ? Math.max(1, Math.min(25, Math.round(opts.avgGoalsPerStudent)))
    : null;
  const goalsRange: readonly [number, number] = g != null
    ? [Math.max(1, g - 2), Math.min(25, g + 2)]
    : [15, 20];

  // Weekly minutes → monthly minutes (×4.345). Range = ±40% around the mean.
  let reqMinutesMonthlyRange: readonly [number, number] = SAMPLE_BOUNDS.requiredMinutes;
  if (opts.avgRequiredMinutesPerWeek != null) {
    const w = Math.max(30, Math.min(300, opts.avgRequiredMinutesPerWeek));
    const monthly = Math.round(w * 4.345);
    reqMinutesMonthlyRange = [
      Math.max(30, Math.round(monthly * 0.6)),
      Math.min(600, Math.round(monthly * 1.4)),
    ];
  }

  // backfillDays: requested-months × 30 with ±15-day jitter so successive
  // seed runs don't always land on the exact same window length. Floor at
  // 180 to honor the validator's ≥6-month-history requirement; ceiling at
  // 365 to stay inside one school-year envelope.
  const baseBackfill = Math.round((opts.backfillMonths ?? 8) * 30);
  const backfillDays = Math.max(180, Math.min(365, baseBackfill + Math.round(randf(-15, 15))));

  const completionMultiplier = randf(...INTENSITY_TO_COMPLETION_RANGE[opts.complianceHealth ?? "medium"]);
  const onTimeLogProb        = randf(...INTENSITY_TO_ONTIME_RANGE[opts.documentationQuality ?? "medium"]);
  const staffRatioMultiplier = randf(...INTENSITY_TO_STAFFRATIO_RANGE[opts.staffingStrain ?? "medium"]);

  const compMul = randf(...INTENSITY_TO_SCALE_RANGE[opts.compensatoryExposure ?? "medium"]);
  const behMul  = randf(...INTENSITY_TO_SCALE_RANGE[opts.behaviorIntensity ?? "medium"]);
  const scenarioWeights: Partial<Record<Exclude<Scenario, "healthy">, number>> = {
    crisis: compMul,
    compensatory_risk: compMul,
    urgent: 1.0,
    shortfall: 1.0,
    behavior_plan: behMul,
    incident_history: behMul,
  };
  const emphasisBoost = 1.4;
  switch (opts.demoEmphasis) {
    case "compliance":
      scenarioWeights.shortfall = (scenarioWeights.shortfall ?? 1) * emphasisBoost;
      scenarioWeights.urgent    = (scenarioWeights.urgent ?? 1) * emphasisBoost;
      scenarioWeights.annual_review_due = (scenarioWeights.annual_review_due ?? 1) * emphasisBoost;
      break;
    case "comp_ed":
      scenarioWeights.crisis            = (scenarioWeights.crisis ?? 1) * emphasisBoost;
      scenarioWeights.compensatory_risk = (scenarioWeights.compensatory_risk ?? 1) * emphasisBoost;
      break;
    case "behavior":
      scenarioWeights.behavior_plan    = (scenarioWeights.behavior_plan ?? 1) * emphasisBoost;
      scenarioWeights.incident_history = (scenarioWeights.incident_history ?? 1) * emphasisBoost;
      break;
    case "caseload":
      // Caseload story = "we're drowning in students under-served." Push
      // shortfall + urgent so dashboards light up red, and add a behavior_plan
      // bump so case managers visibly carry complex kids on top of the volume.
      scenarioWeights.shortfall     = (scenarioWeights.shortfall ?? 1) * emphasisBoost;
      scenarioWeights.urgent        = (scenarioWeights.urgent ?? 1) * emphasisBoost;
      scenarioWeights.behavior_plan = (scenarioWeights.behavior_plan ?? 1) * emphasisBoost;
      break;
    case "executive":
      // Executive overview = balanced "win + risk + maintenance" snapshot.
      // Lift recovered (the green-checkmark story) and annual_review_due
      // (the calendar-driven workload metric) so leadership reports show
      // both progress and upcoming load instead of pure crisis.
      scenarioWeights.recovered          = (scenarioWeights.recovered ?? 1) * emphasisBoost;
      scenarioWeights.annual_review_due  = (scenarioWeights.annual_review_due ?? 1) * emphasisBoost;
      break;
  }

  return {
    schoolCount,
    goalsRange,
    reqMinutesMonthlyRange,
    backfillDays,
    completionMultiplier,
    onTimeLogProb,
    staffRatioMultiplier,
    scenarioWeights,
    staffOverrides: {
      caseManager: opts.caseManagerCount,
      bcba: opts.bcbaCount,
      provider: opts.providerCount,
      paraprofessional: opts.paraCount,
    },
  };
}

/**
 * Per-profile breakdown of "narrative" students (the canonical scenarios
 * that drive dashboard storylines). Healthy students fill the remainder
 * up to the profile's total student count.
 *
 * Small profiles only get one of each scenario so storylines remain
 * recognizable without overflowing the small roster. Large profiles
 * scale specials modestly so dashboards still show a meaningful mix
 * even with 90+ healthy students.
 */
const SCENARIO_COUNTS_BY_PROFILE: Record<Exclude<SizeProfile, "random">, Partial<Record<Exclude<Scenario, "healthy">, number>>> = {
  small: {
    shortfall: 2,
    urgent: 1,
    compensatory_risk: 1,
    recovered: 1,
    sliding: 1,
    crisis: 1,
    transition: 1,
    behavior_plan: 1,
    incident_history: 1,
    annual_review_due: 1,
    esy_eligible: 1,
  },
  medium: {
    shortfall: 8,
    urgent: 3,
    compensatory_risk: 4,
    recovered: 2,
    sliding: 2,
    crisis: 2,
    transition: 1,
    behavior_plan: 2,
    incident_history: 1,
    annual_review_due: 3,
    esy_eligible: 2,
  },
  large: {
    shortfall: 12,
    urgent: 4,
    compensatory_risk: 6,
    recovered: 3,
    sliding: 3,
    crisis: 3,
    transition: 2,
    behavior_plan: 3,
    incident_history: 2,
    annual_review_due: 4,
    esy_eligible: 3,
  },
};

function resolveSizeProfile(profile: SizeProfile | undefined): Exclude<SizeProfile, "random"> {
  if (!profile || profile === "random") {
    if (profile === "random") {
      return pick(["small", "medium", "large"] as const);
    }
    return "medium";
  }
  return profile;
}

/**
 * For the *default* (no explicit profile) path the user wants each district
 * to ship with a randomized 50–100 student roster — large enough to feel
 * like a real district but bounded so demos stay snappy. The seeded RNG
 * makes the choice reproducible per district id.
 */
const DEFAULT_RANDOM_ROSTER_RANGE: readonly [number, number] = [50, 100];

type StudentDef = { scenario: Scenario; schoolIdx: number; grades: string[]; disability?: string };

/**
 * Build the per-student definition list for the chosen profile. Layout:
 *   1. All canonical scenarios (counts per `SCENARIO_COUNTS_BY_PROFILE`)
 *   2. Healthy students fill the remainder up to profile.students
 *
 * Schools and grade bands cycle so students are spread across all 5
 * sample schools (or as many as exist) and across K–12.
 */
function buildStudentDefs(
  profile: Exclude<SizeProfile, "random">,
  schoolCount: number,
  overrideTarget?: number,
  scenarioWeights?: Partial<Record<Exclude<Scenario, "healthy">, number>>,
): StudentDef[] {
  const target = overrideTarget ?? SIZE_PROFILES[profile].students;
  const defs: StudentDef[] = [];
  const counts = SCENARIO_COUNTS_BY_PROFILE[profile];

  // Special-scenario presets: choose grades / disabilities that match the
  // narrative (transition student must be high-school age, behavior_plan
  // students get ASD/ED disabilities, etc.).
  const SPECIAL_PRESETS: Record<Exclude<Scenario, "healthy">, { grades: string[]; disability?: string }> = {
    shortfall:         { grades: GRADES_ALL },
    urgent:            { grades: GRADES_ALL },
    compensatory_risk: { grades: GRADES_ALL },
    recovered:         { grades: [...GRADES_ELEM, ...GRADES_MIDDLE] },
    sliding:           { grades: [...GRADES_ELEM, ...GRADES_MIDDLE] },
    crisis:            { grades: [...GRADES_ELEM, ...GRADES_MIDDLE], disability: "Emotional Disturbance" },
    transition:        { grades: ["10", "11"], disability: "Intellectual Disability" },
    behavior_plan:     { grades: GRADES_ELEM, disability: "Autism Spectrum Disorder" },
    incident_history:  { grades: GRADES_MIDDLE, disability: "Emotional Disturbance" },
    annual_review_due: { grades: GRADES_ALL },
    esy_eligible:      { grades: GRADES_ELEM, disability: "Autism Spectrum Disorder" },
  };

  let schoolCursor = 0;
  const nextSchool = () => {
    const idx = schoolCursor % Math.max(schoolCount, 1);
    schoolCursor++;
    return idx;
  };

  // Add specials in stable order so the first matching student per scenario
  // is deterministic (downstream code uses `.find(... === scenario)` for
  // restraint incidents and transition plans).
  const SCENARIO_ORDER: Array<Exclude<Scenario, "healthy">> = [
    "shortfall", "urgent", "compensatory_risk", "recovered", "sliding",
    "crisis", "transition", "behavior_plan", "incident_history",
    "annual_review_due", "esy_eligible",
  ];
  for (const scenario of SCENARIO_ORDER) {
    const baseN = counts[scenario] ?? 0;
    const weight = scenarioWeights?.[scenario] ?? 1;
    // Always emit at least 1 of each scenario when the base profile included
    // it (so dashboards keep coverage even at low intensity); cap to keep
    // healthy fill from going negative for tiny rosters.
    const scaledN = baseN === 0 ? 0 : Math.max(1, Math.round(baseN * weight));
    const n = Math.min(scaledN, Math.max(0, target - defs.length));
    const preset = SPECIAL_PRESETS[scenario];
    for (let i = 0; i < n; i++) {
      defs.push({
        scenario,
        schoolIdx: nextSchool(),
        grades: preset.grades,
        disability: preset.disability,
      });
    }
  }

  // Fill the remainder with healthy students spread across grade bands.
  const healthyGradePools = [GRADES_ELEM, GRADES_MIDDLE, GRADES_HIGH];
  let i = 0;
  while (defs.length < target) {
    defs.push({
      scenario: "healthy",
      schoolIdx: nextSchool(),
      grades: healthyGradePools[i % healthyGradePools.length],
    });
    i++;
  }

  return defs;
}

export interface SampleDataStatus {
  hasSampleData: boolean;
  sampleStudents: number;
  sampleStaff: number;
}

export async function getSampleDataStatus(districtId: number): Promise<SampleDataStatus> {
  // Resilient to a missing district row: the signed-in user may be scoped to
  // a district id (e.g. from auth metadata) that has not yet been provisioned.
  // In that case there are obviously no sample rows, so we report a clean
  // empty status rather than throwing or relying on the district row existing.
  const [district] = await db.select({ has: districtsTable.hasSampleData })
    .from(districtsTable).where(eq(districtsTable.id, districtId));
  if (!district) {
    return { hasSampleData: false, sampleStudents: 0, sampleStaff: 0 };
  }
  const schools = await db.select({ id: schoolsTable.id })
    .from(schoolsTable).where(eq(schoolsTable.districtId, districtId));
  const schoolIds = schools.map(s => s.id);

  if (schoolIds.length === 0) {
    return { hasSampleData: !!district.has, sampleStudents: 0, sampleStaff: 0 };
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

/**
 * Cadence-based session emitter — Path B.
 *
 * Replaces the previous "pick N random dates from a fixed window" approach
 * with a per-week cadence derived from the service requirement itself
 * (monthly minutes ÷ ~4.345 weeks ÷ session duration). This is what a real
 * provider's caseload looks like: a fixed weekly schedule with the
 * occasional miss, not a random spray.
 *
 * `rateAt(weekIdx, totalWeeks)` lets callers shape completion over time
 * (sliding scenarios start high and decline; recovered scenarios start
 * low and recover; crisis stays low; etc.).
 */
function buildCadenceSessionRows(
  spec: StudentSpec,
  sr: { id: number; studentId: number; providerId: number | null; serviceTypeId: number; requiredMinutes: number; startDate?: string | null },
  startDate: string,
  endDate: string,
  schoolYearId: number,
  rateAt: (weekIdx: number, totalWeeks: number) => number,
  opts: { completionMultiplier?: number; onTimeLogProb?: number } = {},
): (typeof sessionLogsTable.$inferInsert)[] {
  const completionMultiplier = opts.completionMultiplier ?? 1;
  const onTimeLogProb = opts.onTimeLogProb ?? 0.75;
  const rows: (typeof sessionLogsTable.$inferInsert)[] = [];
  const sessionMin = 30;
  // Monthly minutes ÷ 4.345 weeks ÷ 30-min sessions, clamped 1..5/week.
  const sessionsPerWeek = Math.max(1, Math.min(5, Math.round(sr.requiredMinutes / 4.345 / sessionMin)));

  // Walk week-by-week. Each iteration picks `sessionsPerWeek` weekdays
  // from Monday→Friday of that ISO week and emits a session per pick.
  const startTs = new Date(startDate + "T00:00:00Z");
  const endTs = new Date(endDate + "T00:00:00Z");
  if (startTs >= endTs) return rows;

  // Snap startTs back to its Monday so weekly buckets line up.
  const startDow = startTs.getUTCDay();
  const monOffset = startDow === 0 ? -6 : 1 - startDow;
  const cursor = new Date(startTs);
  cursor.setUTCDate(cursor.getUTCDate() + monOffset);

  // Pre-compute total weeks for trend shaping.
  const totalWeeks = Math.max(1, Math.ceil((endTs.getTime() - cursor.getTime()) / (7 * 86400_000)));
  let weekIdx = 0;

  while (cursor <= endTs) {
    const weekDays: string[] = [];
    for (let d = 0; d < 5; d++) {
      const day = new Date(cursor);
      day.setUTCDate(day.getUTCDate() + d);
      const ds = day.toISOString().split("T")[0];
      // Skip days before sr.startDate or after today.
      if (ds < startDate || ds > endDate) continue;
      weekDays.push(ds);
    }
    if (weekDays.length > 0) {
      const picks = sshuffle(weekDays).slice(0, Math.min(sessionsPerWeek, weekDays.length));
      const baseRate = rateAt(weekIdx, totalWeeks);
      const rate = Math.max(0, Math.min(1, baseRate * completionMultiplier));
      for (const date of picks) {
        const completed = srand() < rate;
        // ~6% of completed sessions are makeup sessions covering an
        // earlier missed mandate — adds the variability the dashboard
        // expects (and matches how providers actually log catch-ups).
        const isMakeup = completed && srand() < 0.06;
        const startMin = Math.round(
          rand(SAMPLE_BOUNDS.startMinuteOfDay[0], SAMPLE_BOUNDS.startMinuteOfDay[1]) / 5,
        ) * 5;
        // Logging-timeliness variance: most providers log within a day
        // (~75%), but a realistic minority lag 1–10 days. Setting
        // created_at explicitly lets the "late documentation" dashboards
        // show a real distribution. Future "scheduled" rows skip this.
        const lagDays = srand() < onTimeLogProb ? 0 : Math.floor(srand() * 10) + 1;
        const createdAt = new Date(`${date}T${minToTime(startMin + sessionMin)}:00Z`);
        createdAt.setUTCDate(createdAt.getUTCDate() + lagDays);
        rows.push({
          studentId: spec.id,
          staffId: sr.providerId,
          serviceTypeId: sr.serviceTypeId,
          serviceRequirementId: sr.id,
          sessionDate: date,
          startTime: minToTime(startMin),
          endTime: minToTime(startMin + sessionMin),
          durationMinutes: sessionMin,
          status: isMakeup ? "makeup" : completed ? "completed" : "missed",
          location: "Resource Room",
          schoolYearId,
          notes: isMakeup
            ? "Sample session — makeup for previously missed mandate."
            : completed
              ? "Sample session — student engaged and made progress on goal."
              : "Sample session — student absent.",
          createdAt,
        });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 7);
    weekIdx++;
  }
  return rows;
}

// ──────────────────────────────────────────────────────────────────
// Main seeder
// ──────────────────────────────────────────────────────────────────

export async function seedSampleDataForDistrict(
  districtId: number,
  options: SeedSampleOptions = {},
): Promise<SeedSampleResult> {
  // Deterministic seeding: every random choice below routes through a
  // mulberry32 stream keyed on districtId, so two reseeds of the same
  // district produce identical rows. Different districts get visibly
  // different rosters (names, scenario assignments, completion patterns).
  setSeed(districtId);

  // Rollback wrapper: if any insert below throws after we've written
  // rows, we ALWAYS tear down the partial seed via
  // `teardownSampleData(districtId)` so the caller can safely retry.
  // teardownSampleData is scoped to rows tagged `is_sample = true`
  // within this district's schools, so it cannot touch operator data
  // even when this call is seeding into an existing tenant. The
  // `districtCreatedHereForRollback` flag (set just after the district
  // lookup) gates *only* the post-rollback cleanup of the empty
  // district stub itself — we should not delete a pre-existing
  // district row, but we should clean up one we just created. The
  // original error is rethrown unchanged so callers see the root cause.
  let districtCreatedHereForRollback = false;
  try {

  const shape = resolveSeedShape(options);
  const sizeProfile = resolveSizeProfile(options.sizeProfile);
  // When the caller does not specify a profile, randomize the roster size
  // in the 50–100 range so each of the ~30 pilot districts looks unique
  // out of the box. Explicit small/medium/large keep their fixed counts.
  const rosterOverride = options.targetStudents !== undefined
    ? options.targetStudents
    : options.sizeProfile === undefined
      ? rand(DEFAULT_RANDOM_ROSTER_RANGE[0], DEFAULT_RANDOM_ROSTER_RANGE[1])
      : undefined;
  // ── 1. Prerequisites: district, schools, school year, service types ──

  // Auto-provision a minimal district stub if the caller's enforced district
  // id has no row yet (e.g. the signed-in admin's auth metadata references a
  // district that was never persisted). The seeder is the natural place to
  // bootstrap this — without it the entire "Add sample data" flow would fail
  // with a raw "District N not found" before any rows could be created.
  // Idempotent via ON CONFLICT, and we bump the serial sequence so that a
  // future plain INSERT into districts (which relies on the default nextval)
  // doesn't collide on this id.
  let [district] = await db.select().from(districtsTable).where(eq(districtsTable.id, districtId));
  // Track whether this call is the one that created the district stub. On a
  // mid-seed failure we tear down the partial seed only when we created the
  // district here — never if the caller is re-seeding into an existing
  // tenant (could clobber a real district with operator data).
  const districtCreatedHere = !district;
  districtCreatedHereForRollback = districtCreatedHere;
  // Realistic config baseline applied on auto-provision (and to existing
  // *default-named* stubs that have never been configured). This matches
  // what a freshly onboarded MA district looks like: 85% compliance
  // threshold, role-keyed caseload caps, MA timezone, all nudge / digest /
  // renewal emails enabled, and a $60/hr default billing rate.
  const REALISTIC_DISTRICT_CONFIG = {
    complianceMinuteThreshold: 85,
    caseloadThresholds: {
      provider: 35,
      bcba: 25,
      case_manager: 20,
      sped_teacher: 18,
    } as Record<string, number>,
    timeZone: "America/New_York",
    alertDigestMode: false,
    spikeAlertEnabled: true,
    spikeAlertThreshold: 3,
    weeklyRiskEmailEnabled: true,
    pilotScorecardEmailEnabled: true,
    iepRenewalEmailEnabled: true,
    defaultHourlyRate: "60.00",
  };
  if (!district) {
    // Honor caller-supplied districtName when auto-provisioning so demo
    // setups can label the district up front (e.g. "MetroWest Collaborative")
    // instead of the generic "District 17".
    const provisionedName = (options.districtName?.trim()) || `District ${districtId}`;
    await db.insert(districtsTable)
      .values({
        id: districtId,
        name: provisionedName,
        tier: "essentials",
        isDemo: false,
        isPilot: false,
        isSandbox: false,
        hasSampleData: false,
        ...REALISTIC_DISTRICT_CONFIG,
      })
      .onConflictDoNothing();
    await db.execute(sql`
      SELECT setval(
        pg_get_serial_sequence('districts', 'id'),
        GREATEST((SELECT COALESCE(MAX(id), 1) FROM districts), ${districtId})
      )
    `);
    [district] = await db.select().from(districtsTable).where(eq(districtsTable.id, districtId));
    if (!district) throw new Error(`District ${districtId} could not be auto-provisioned`);
  } else if (options.districtName?.trim() && district.name?.startsWith("District ")) {
    // Existing auto-provisioned stub ("District 17"): allow rename when the
    // caller supplied a real label. We deliberately do NOT overwrite a
    // human-set district name to avoid clobbering production data.
    const newName = options.districtName.trim();
    await db.update(districtsTable).set({ name: newName }).where(eq(districtsTable.id, districtId));
    district = { ...district, name: newName };
  }

  // Backfill the realistic config on existing stubs that still carry the
  // empty defaults (no caseload thresholds set yet). Skipped entirely once
  // an operator has configured the district — we only fill, never overwrite.
  if (district && district.caseloadThresholds == null) {
    await db.update(districtsTable)
      .set(REALISTIC_DISTRICT_CONFIG)
      .where(eq(districtsTable.id, districtId));
  }

  // Ensure enough schools exist to satisfy shape.schoolCount. SCHOOL_NAMES
  // covers the first 5; beyond that we generate "School 6", "School 7", …
  // so requesting schoolCount=12 produces 12 *distinct* schools rather than
  // silently reusing the first one.
  let existingSchools = await db.select().from(schoolsTable).where(eq(schoolsTable.districtId, districtId));
  const desiredSchoolCount = Math.max(shape.schoolCount, existingSchools.length);
  if (existingSchools.length < desiredSchoolCount) {
    const namesNeeded: string[] = [];
    for (let i = existingSchools.length; i < desiredSchoolCount; i++) {
      namesNeeded.push(SCHOOL_NAMES[i] ?? `School ${i + 1}`);
    }
    const newSchools = await db.insert(schoolsTable).values(
      namesNeeded.map(name => ({ districtId, name })),
    ).returning();
    existingSchools = [...existingSchools, ...newSchools];
  }
  const schools = existingSchools.slice(0, shape.schoolCount);

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
  // Also ensure a *prior* (inactive) school year row exists so historical
  // reports — year-over-year compliance comparisons, archived progress
  // reports, the "previous year" filter on the goal-mastery page — render
  // with real labels instead of an empty dropdown. Idempotent: skipped when
  // a row with the prior label already exists.
  {
    const activeStart = parseInt(schoolYear.startDate.slice(0, 4), 10);
    const priorLabel = `${activeStart - 1}-${activeStart}`;
    const existingPrior = await db.select({ id: schoolYearsTable.id })
      .from(schoolYearsTable)
      .where(and(eq(schoolYearsTable.districtId, districtId), eq(schoolYearsTable.label, priorLabel)));
    if (existingPrior.length === 0) {
      await db.insert(schoolYearsTable).values({
        districtId,
        label: priorLabel,
        startDate: `${activeStart - 1}-08-15`,
        endDate: `${activeStart}-06-15`,
        isActive: false,
      });
    }
  }

  let serviceTypes = await db.select().from(serviceTypesTable);
  if (serviceTypes.length === 0) {
    serviceTypes = await db.insert(serviceTypesTable).values(SERVICE_TYPE_DEFAULTS).returning();
  } else {
    // Backfill any catalog entries the table is missing by name. The
    // catalog is global (not district-scoped), so an older seed run may
    // have inserted only the original 5 rows. We add what's missing
    // without disturbing any operator-edited rates / codes on existing
    // ones — match strictly by name.
    const existingNames = new Set(serviceTypes.map(s => s.name));
    const missing = SERVICE_TYPE_DEFAULTS.filter(d => !existingNames.has(d.name));
    if (missing.length > 0) {
      const inserted = await db.insert(serviceTypesTable).values(missing).returning();
      serviceTypes = [...serviceTypes, ...inserted];
    }
  }
  const svcByCategory = new Map(serviceTypes.map(s => [s.category, s]));
  // Resolve palette (fall back to first available for missing categories)
  const speech    = svcByCategory.get("speech")    ?? serviceTypes[0];
  const ot        = svcByCategory.get("ot")        ?? serviceTypes[0];
  const counseling = svcByCategory.get("counseling") ?? serviceTypes[0];
  const aba       = svcByCategory.get("aba")       ?? serviceTypes[0];
  const pt        = svcByCategory.get("pt")        ?? serviceTypes[0];

  // ── 2. Sample staff (8 members covering all roles) ──

  const staffSeeds = buildStaffSeeds(sizeProfile, rosterOverride, shape);
  const insertedStaff = await db.insert(staffTable).values(
    staffSeeds.map(s => ({
      firstName: s.firstName,
      lastName: s.lastName,
      role: s.role,
      title: s.title,
      qualifications: s.qualifications,
      email: `${s.firstName.toLowerCase()}.${s.lastName.toLowerCase().replace(/'/g, "")}@sample.trellis.local`,
      schoolId: schools[0].id,
      status: "active",
      isSample: true,
    })),
  ).returning();

  // Primary references (used for transition coordinator, evaluation lead,
  // restraint debrief, etc.). Falls back to insertedStaff[0] for tiny
  // profiles that don't include every specialty role.
  const caseManagers = insertedStaff.filter(s => s.role === "case_manager");
  const caseManager = caseManagers[0] ?? insertedStaff[0];
  const bcba        = insertedStaff.find(s => s.role === "bcba") ?? insertedStaff[0];
  const slp         = insertedStaff.find(s => s.title?.includes("Speech")) ?? insertedStaff[0];
  const otStaff     = insertedStaff.find(s => s.title?.includes("Occupational")) ?? insertedStaff[0];
  const ptStaff     = insertedStaff.find(s => s.title?.includes("Physical")) ?? insertedStaff[0];
  const counselor   = insertedStaff.find(s => s.title?.includes("Counselor")) ?? insertedStaff[0];
  const providers   = insertedStaff.filter(s => s.role === "provider" || s.role === "bcba");
  // Discipline-specific provider pools so a single specialist isn't overloaded
  // when many students share the same service. Falls back to the singleton
  // specialist if no others match the title pattern.
  const bcbaPool      = insertedStaff.filter(s => s.role === "bcba");
  const slpPool       = insertedStaff.filter(s => s.title?.includes("Speech"));
  const otPool        = insertedStaff.filter(s => s.title?.includes("Occupational"));
  const ptPool        = insertedStaff.filter(s => s.title?.includes("Physical"));
  const counselorPool = insertedStaff.filter(s => s.title?.includes("Counselor"));
  const pickFrom = <T,>(pool: T[], fallback: T, key: number): T =>
    pool.length > 0 ? pool[Math.abs(key) % pool.length]! : fallback;

  // Round-robin case manager assignment so caseloads stay realistic when
  // multiple case managers exist (medium = 3 CMs split ~20 students each;
  // large = 6 CMs split ~20 students each). Falls back to the lone case
  // manager when only one is present (small profile).
  const cmPool = caseManagers.length > 0 ? caseManagers : [caseManager];
  const caseManagerForStudent = (i: number) => cmPool[i % cmPool.length].id;

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

  // Roster size and scenario mix come from the chosen size profile so a
  // small district doesn't look identical to a large one. See
  // `SCENARIO_COUNTS_BY_PROFILE` for the per-profile scenario distribution.
  const STUDENT_DEFS = buildStudentDefs(sizeProfile, schools.length, rosterOverride, shape.scenarioWeights);

  const today = new Date().toISOString().split("T")[0];
  const usedNames = new Set<string>();

  const studentRows = STUDENT_DEFS.map((def, i) => {
    // Unique name. With FIRST_NAMES x LAST_NAMES = 50 x 20 = 1 000 unique
    // combinations, large rosters (e.g. 2 000-student stress demos) will
    // exhaust the pool and fall back to a numeric suffix on the last name
    // to keep names distinct (and parent-pickup-line readable) without
    // adding a schema-level uniqueness constraint.
    let firstName = "", lastName = "";
    let attempts = 0;
    do {
      firstName = FIRST_NAMES[rand(0, FIRST_NAMES.length - 1)];
      lastName  = LAST_NAMES[rand(0, LAST_NAMES.length - 1)];
      if (usedNames.has(`${firstName}${lastName}`) && attempts >= 25) {
        lastName = `${lastName}-${i + 1}`;
        break;
      }
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
      districtId,
      caseManagerId: caseManagerForStudent(i),
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
  const insertedStudents = await chunkedInsert(
    studentsTable,
    studentRows.map(({ _scenario, _schoolIdx, ...row }) => row),
    { returning: true },
  );

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
        serviceTypeIds = sshuffle(palette).slice(0, numSvc);
        break;
      }
    }
    return { id: s.id, scenario: def.scenario, serviceTypeIds, caseManagerId: caseManager.id, schoolIndex: def.schoolIdx, enrolledAt: s.enrolledAt ?? undefined };
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
  const insertedIeps = await chunkedInsert(iepDocumentsTable, iepRows, { returning: true });
  const iepByStudent = new Map(insertedIeps.map(d => [d.studentId, d.id]));

  // ── 5. IEP goals (15–20 measurable goals per student by default) ──
  //
  // Real MA SPED IEPs typically carry one annual goal per service area plus
  // 2–4 measurable objectives under each area, landing 15–20 goal rows per
  // student. The previous seed produced 3–5, which made the per-student
  // "Goals" tab read like a one-page summary rather than a real IEP.
  //
  // The loop cycles through the priority areas as many times as needed to
  // hit numGoals, so for a transition student with ["Transition","Academics",
  // "Social Skills"] and numGoals=18 we get 6 goals per area instead of
  // capping at 3. Areas repeat in round-robin order; each iteration draws a
  // fresh entry from the goal bank for that area.

  const goalRows: (typeof iepGoalsTable.$inferInsert)[] = [];
  const goalAreas = ["Communication", "Social Skills", "Self-Regulation", "Academics", "Behavior", "Transition"];

  for (const s of insertedStudents) {
    const idx = insertedStudents.indexOf(s);
    const def = STUDENT_DEFS[idx];
    const numGoals = rand(shape.goalsRange[0], shape.goalsRange[1]);

    // Transition student gets transition-specific goals
    const priorityAreas: string[] = def.scenario === "transition"
      ? ["Transition", "Academics", "Social Skills"]
      : def.scenario === "behavior_plan" || def.scenario === "incident_history"
        ? ["Behavior", "Self-Regulation", "Communication"]
        : sshuffle(goalAreas);

    for (let g = 0; g < numGoals; g++) {
      // Cycle through the priority areas so we can produce 15–20 goals even
      // when the priority list is only 3 items long.
      const area = priorityAreas[g % priorityAreas.length];
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

  const insertedGoals = await chunkedInsert(iepGoalsTable, goalRows, { returning: true });
  // Index goals by student so the session→goal linkage step (right after
  // sessions land) can pick a real iep_goal id without re-querying.
  const goalsByStudentEarly = new Map<number, typeof insertedGoals>();
  for (const g of insertedGoals) {
    const list = goalsByStudentEarly.get(g.studentId) ?? [];
    list.push(g);
    goalsByStudentEarly.set(g.studentId, list);
  }

  // ── 6. Service requirements ──

  const srRows: (typeof serviceRequirementsTable.$inferInsert)[] = [];
  for (const spec of studentSpecs) {
    for (const stId of spec.serviceTypeIds) {
      // Assign provider matching service type, spreading load across pool members
      // so a single specialist isn't overloaded when many students share the
      // same service.
      let provider = providers[(spec.id + stId) % providers.length];
      if (stId === aba.id) provider = pickFrom(bcbaPool, bcba, spec.id);
      else if (stId === speech.id) provider = pickFrom(slpPool, slp, spec.id);
      else if (stId === ot.id) provider = pickFrom(otPool, otStaff, spec.id);
      else if (stId === pt.id) provider = pickFrom(ptPool, ptStaff, spec.id);
      else if (stId === counseling.id) provider = pickFrom(counselorPool, counselor, spec.id);

      // Crisis students need high required minutes to generate >$3K exposure
      const reqMin = spec.scenario === "crisis"
        ? rand(240, 360)
        : rand(shape.reqMinutesMonthlyRange[0], shape.reqMinutesMonthlyRange[1]);

      // Backdate startDate to span the full session history window so historical
      // compliance reports can render. Validator requires ≥6 months of past
      // activity per student, so we *force* startDate to be at least 180 days
      // before today regardless of how recently the student was enrolled —
      // demo simplification: assume seeded students received this service at
      // a prior placement. We start from the earliest of (enrolledAt,
      // backfillDays-ago, 180-days-ago) so the cadence emitter has a full
      // 6+ month window to walk through.
      const sessionWindowStart = addDays(today, -shape.backfillDays);
      const sixMonthsAgo = addDays(today, -180);
      const enrolledAt = (spec as { enrolledAt?: string }).enrolledAt;
      const candidates = [sessionWindowStart, sixMonthsAgo];
      if (enrolledAt) candidates.push(enrolledAt);
      const startDate = candidates.sort()[0];
      srRows.push({
        studentId: spec.id,
        serviceTypeId: stId,
        providerId: provider?.id ?? null,
        requiredMinutes: reqMin,
        intervalType: "monthly",
        deliveryType: "direct",
        setting: pick(["Resource Room", "General Education Classroom", "Therapy Room", "Self-Contained Classroom"]),
        active: true,
        startDate,
      });
    }
  }
  // ── Provider capacity envelope check ──
  // Per validator: each provider's mandated minutes must fit within a 5-day
  // × 6.5-hour delivery week. Convert to monthly minutes (4.345 weeks/month)
  // and assert no provider is overbooked relative to the SR rows we're
  // about to write. We fail loudly *before* the insert so the catch block
  // can roll back cleanly without leaving partial state. Capacity assumes
  // 100% utilization (no admin / planning time) — intentionally generous;
  // operators can override scheduling later, but the envelope must hold.
  const PROVIDER_WEEKLY_MIN_CAPACITY = 5 * 6.5 * 60;            // 1950 min/wk
  const PROVIDER_MONTHLY_MIN_CAPACITY = PROVIDER_WEEKLY_MIN_CAPACITY * 4.345; // ≈8473
  const loadByProvider = new Map<number, number>();
  for (const r of srRows) {
    if (r.providerId == null) continue;
    loadByProvider.set(r.providerId, (loadByProvider.get(r.providerId) ?? 0) + r.requiredMinutes);
  }
  const overloaded: Array<{ providerId: number; loadMin: number; capMin: number }> = [];
  for (const [providerId, loadMin] of loadByProvider) {
    if (loadMin > PROVIDER_MONTHLY_MIN_CAPACITY) {
      overloaded.push({ providerId, loadMin, capMin: Math.round(PROVIDER_MONTHLY_MIN_CAPACITY) });
    }
  }
  if (overloaded.length > 0) {
    throw new Error(
      `Seed capacity violation for district ${districtId}: ${overloaded.length} provider(s) over the ` +
      `5d × 6.5h envelope (${Math.round(PROVIDER_MONTHLY_MIN_CAPACITY)} min/mo). ` +
      `Overloaded: ${overloaded.map(o => `provider#${o.providerId}=${o.loadMin}min`).join(", ")}. ` +
      `Increase staffShape.providers or reduce reqMinutesMonthlyRange.`,
    );
  }

  const insertedSrs = await chunkedInsert(serviceRequirementsTable, srRows, { returning: true });

  const srByStudent = new Map<number, typeof insertedSrs>();
  for (const sr of insertedSrs) {
    const list = srByStudent.get(sr.studentId) ?? [];
    list.push(sr);
    srByStudent.set(sr.studentId, list);
  }

  // ── 7. Session history (cadence-based, full sr.startDate→today window) ──
  //
  // Each service requirement emits a deterministic weekly cadence
  // (sessions/week derived from requiredMinutes) spanning its own
  // startDate up to today. Completion rate is shaped per scenario via
  // a small `rateAt(week, totalWeeks)` closure so trend lines remain
  // visually distinct (sliding declines, recovered improves, crisis stays
  // low, etc.) without going back to random scatter.

  const sessionRows: (typeof sessionLogsTable.$inferInsert)[] = [];

  const cadenceOpts = {
    completionMultiplier: shape.completionMultiplier,
    onTimeLogProb: shape.onTimeLogProb,
  };
  for (const spec of studentSpecs) {
    const srs = srByStudent.get(spec.id) ?? [];
    for (const sr of srs) {
      const srStart = sr.startDate ?? addDays(today, -180);
      switch (spec.scenario) {
        case "recovered": {
          // Linear ramp from a low early-period rate to a high recent rate.
          // Both ends sampled per student so the "recovered" cohort spans
          // the full plausible turnaround band rather than a fixed 30→95.
          const lo = randf(0.20, 0.42);
          const hi = randf(0.88, 0.98);
          sessionRows.push(...buildCadenceSessionRows(spec, sr, srStart, today, schoolYear.id,
            (w, tw) => lo + ((hi - lo) * (w / Math.max(1, tw - 1))), cadenceOpts));
          break;
        }
        case "sliding": {
          // Inverse: starts high then declines steadily across the window.
          const hi = randf(0.85, 0.97);
          const lo = randf(0.28, 0.52);
          sessionRows.push(...buildCadenceSessionRows(spec, sr, srStart, today, schoolYear.id,
            (w, tw) => hi - ((hi - lo) * (w / Math.max(1, tw - 1))), cadenceOpts));
          break;
        }
        case "crisis": {
          // Sustained low delivery across the full window. Wider band so
          // not every "crisis" student lands at exactly ~28%.
          const r = randf(0.15, 0.38);
          sessionRows.push(...buildCadenceSessionRows(spec, sr, srStart, today, schoolYear.id, () => r, cadenceOpts));
          break;
        }
        case "behavior_plan":
        case "incident_history":
        case "transition":
        case "annual_review_due":
        case "esy_eligible": {
          const [lo, hi] = COMPLETION_RATE_RANGES[spec.scenario];
          const r = randf(lo, hi);
          sessionRows.push(...buildCadenceSessionRows(spec, sr, srStart, today, schoolYear.id, () => r, cadenceOpts));
          break;
        }
        default: {
          // Cadence-based fallback for any unhandled scenario
          const [lo, hi] = COMPLETION_RATE_RANGES[spec.scenario];
          const r = randf(lo, hi);
          sessionRows.push(...buildCadenceSessionRows(spec, sr, srStart, today, schoolYear.id, () => r, cadenceOpts));
          break;
        }
      }
    }
  }

  // Insert sessions in batches and capture the inserted ids so each
  // completed row can be linked to a real iep_goal via session_goal_data.
  // The dashboard's "goal data captured" rate reads this table directly.
  const insertedSessionIds: Array<{ id: number; studentId: number; status: string | null }> = [];
  if (sessionRows.length > 0) {
    for (let i = 0; i < sessionRows.length; i += 200) {
      const ret = await db.insert(sessionLogsTable)
        .values(sessionRows.slice(i, i + 200))
        .returning({ id: sessionLogsTable.id, studentId: sessionLogsTable.studentId, status: sessionLogsTable.status });
      insertedSessionIds.push(...ret);
    }
  }

  // ── 7.5. Goal data per session (session_goal_data) ──
  // Every session — completed, missed, makeup, or scheduled — links to one
  // of the student's active iep_goals so the calendar / progress views can
  // display "what was this session for?" alongside missed sessions and
  // future scheduled blocks. The dashboard's "goals with recent data"
  // metric still filters on completed status downstream.
  const sgdRows: (typeof sessionGoalDataTable.$inferInsert)[] = [];
  for (const row of insertedSessionIds) {
    const goals = goalsByStudentEarly.get(row.studentId);
    if (!goals || goals.length === 0) continue;
    const goal = goals[Math.floor(srand() * goals.length)];
    sgdRows.push({
      sessionLogId: row.id,
      iepGoalId: goal.id,
      notes: "Sample data — progress observed on goal during session.",
    });
  }
  if (sgdRows.length > 0) {
    for (let i = 0; i < sgdRows.length; i += 500) {
      await db.insert(sessionGoalDataTable).values(sgdRows.slice(i, i + 500));
    }
  }

  // ── 8. Schedule blocks (recurring weekly slots) ──

  const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const blockRows: (typeof scheduleBlocksTable.$inferInsert)[] = [];
  // Track each provider's busy slots per day-of-week so we don't collide
  // when distributing multiple weekly blocks per service requirement.
  const providerBusy = new Map<string, Array<[number, number]>>();
  const overlaps = (slots: Array<[number, number]>, s: number, e: number) =>
    slots.some(([a, b]) => s < b && e > a);

  for (const sr of insertedSrs) {
    if (!sr.providerId) continue;
    // Required weekly minutes derived from the monthly mandate, then split
    // into 30-minute blocks (capped 1..5/wk) so the recurring schedule
    // actually delivers the IEP-mandated service time.
    const weeklyMinutes = Math.max(30, Math.round(sr.requiredMinutes / 4.345));
    const numBlocks = Math.max(1, Math.min(5, Math.ceil(weeklyMinutes / 30)));
    const dayPicks = sshuffle(DAYS).slice(0, numBlocks);

    for (const day of dayPicks) {
      const key = `${sr.providerId}|${day}`;
      const busy = providerBusy.get(key) ?? [];
      // Try a few times to find a non-overlapping start slot for this provider.
      let startMin = 0;
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = Math.round(
          rand(SAMPLE_BOUNDS.startMinuteOfDay[0], SAMPLE_BOUNDS.startMinuteOfDay[1]) / 5,
        ) * 5;
        if (!overlaps(busy, candidate, candidate + 30)) {
          startMin = candidate;
          break;
        }
        startMin = candidate;
      }
      busy.push([startMin, startMin + 30]);
      providerBusy.set(key, busy);

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
  }
  // Idempotency guard: clear any pre-existing recurring blocks for *every*
  // staff member currently assigned to this district — not just the staff
  // freshly inserted in this run. Re-seeds accumulate staff (the seeder
  // does not delete prior staff), so scoping the wipe to only newly-
  // inserted IDs would leave behind stale availability and service blocks
  // belonging to staff from earlier seed runs, producing duplicate
  // (staff_id, day_of_week, start_time, end_time) rows. Fresh-seed runs
  // are no-ops because newly-inserted staff have no blocks yet.
  // Strictly scope to sample-tagged staff in this district. The seeder
  // must never touch operator-authored schedule blocks belonging to real
  // (non-sample) staff in a tenant where sample data has been added on
  // top — joining on `s.is_sample = true` prevents a re-seed from wiping
  // production schedules.
  const districtStaff = await db.execute(sql`
    SELECT s.id AS staff_id
    FROM staff s
    JOIN schools sc ON sc.id = s.school_id
    WHERE sc.district_id = ${districtId} AND s.is_sample = true
  `);
  const wipeStaffIds = Array.from(new Set([
    ...blockRows.map(b => b.staffId).filter((v): v is number => typeof v === "number"),
    ...providers.map(p => p.id),
    ...districtStaff.rows.map((r: { staff_id: number }) => r.staff_id),
  ]));
  if (wipeStaffIds.length > 0) {
    await db.delete(scheduleBlocksTable).where(inArray(scheduleBlocksTable.staffId, wipeStaffIds));
  }
  if (blockRows.length > 0) {
    await chunkedInsert(scheduleBlocksTable, blockRows);
  }

  // ── 8a. Provider availability skeleton ──
  // One `blockType='availability'` row per (provider × weekday) covering
  // that provider's workday. The service blocks above layer on top of
  // these so the calendar UI shows a baseline "I'm here Mon–Fri"
  // presence under the actual delivery slots. Workday start/end are
  // sampled per provider (start 7:00–9:30, length 6–7.5 hrs) so the
  // calendar shows realistic variation rather than every provider
  // pinned to the same 8:00–15:00. Bounded to stay inside the school
  // day envelope.
  const availabilityRows: (typeof scheduleBlocksTable.$inferInsert)[] = [];
  const fmtHHMM = (h: number, m: number) =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  for (const provider of providers) {
    const startH = 7 + Math.floor(srand() * 3);   // 7, 8, or 9
    const startM = srand() < 0.5 ? 0 : 30;
    const dayLengthHrs = 6 + (srand() < 0.5 ? 0 : 0.5) + Math.floor(srand() * 2); // 6, 6.5, 7, or 7.5
    const totalStartMin = startH * 60 + startM;
    const totalEndMin = Math.min(16 * 60, totalStartMin + Math.round(dayLengthHrs * 60));
    const startTime = fmtHHMM(Math.floor(totalStartMin / 60), totalStartMin % 60);
    const endTime = fmtHHMM(Math.floor(totalEndMin / 60), totalEndMin % 60);
    for (const day of DAYS) {
      availabilityRows.push({
        staffId: provider.id,
        studentId: null,
        serviceTypeId: null,
        dayOfWeek: day,
        startTime,
        endTime,
        location: "School",
        blockType: "availability",
        isRecurring: true,
        isAutoGenerated: true,
        schoolYearId: schoolYear.id,
      });
    }
  }
  if (availabilityRows.length > 0) {
    await chunkedInsert(scheduleBlocksTable, availabilityRows);
  }

  // ── 8.5. Future scheduled sessions (next 14 weekdays) ──
  // Mirrors recurring schedule_blocks forward so the calendar UI shows
  // upcoming work, not just historical completion data. status='scheduled'
  // is excluded from compliance % so it can't distort the dashboard.
  const futureWeekdays: string[] = [];
  for (let i = 1; i <= 21; i++) {
    const ds = addDays(today, i);
    if (isWeekday(ds)) futureWeekdays.push(ds);
  }
  const dayIdx: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };
  const futureSessionRows: (typeof sessionLogsTable.$inferInsert)[] = [];
  for (const block of blockRows) {
    const sr = insertedSrs.find(r => r.studentId === block.studentId && r.serviceTypeId === block.serviceTypeId);
    if (!sr) continue;
    const targetDow = dayIdx[block.dayOfWeek];
    if (targetDow === undefined) continue;
    const matchingDates = futureWeekdays.filter(d => new Date(d + "T00:00:00").getDay() === targetDow);
    for (const sessionDate of matchingDates.slice(0, 2)) {
      const startTime = block.startTime;
      const endTime = block.endTime;
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      futureSessionRows.push({
        studentId: block.studentId!,
        serviceRequirementId: sr.id,
        serviceTypeId: block.serviceTypeId!,
        staffId: block.staffId,
        sessionDate,
        startTime,
        endTime,
        durationMinutes: (eh * 60 + em) - (sh * 60 + sm),
        location: block.location ?? "Resource Room",
        status: "scheduled",
        schoolYearId: schoolYear.id,
      });
    }
  }
  if (futureSessionRows.length > 0) {
    // Capture inserted ids so each scheduled session also gets a goal link
    // (validator: every session must link to ≥ 1 IEP goal via session_goal_data).
    const futureSgdRows: (typeof sessionGoalDataTable.$inferInsert)[] = [];
    for (let i = 0; i < futureSessionRows.length; i += 200) {
      const ret = await db.insert(sessionLogsTable)
        .values(futureSessionRows.slice(i, i + 200))
        .returning({ id: sessionLogsTable.id, studentId: sessionLogsTable.studentId });
      for (const row of ret) {
        const goals = goalsByStudentEarly.get(row.studentId);
        if (!goals || goals.length === 0) continue;
        const goal = goals[Math.floor(srand() * goals.length)];
        futureSgdRows.push({
          sessionLogId: row.id,
          iepGoalId: goal.id,
          notes: "Sample data — scheduled session for upcoming goal work.",
        });
      }
    }
    if (futureSgdRows.length > 0) {
      for (let i = 0; i < futureSgdRows.length; i += 500) {
        await db.insert(sessionGoalDataTable).values(futureSgdRows.slice(i, i + 500));
      }
    }
  }

  // ── 9. Accommodations (3–4 per student) ──

  const accomRows: (typeof iepAccommodationsTable.$inferInsert)[] = [];
  for (const s of insertedStudents) {
    const numAccom = rand(3, 4);
    const chosen = sshuffle(ACCOM_BANK).slice(0, numAccom);
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
  await chunkedInsert(iepAccommodationsTable, accomRows);

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
    if (srand() < 0.6) {
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
  await chunkedInsert(guardiansTable, guardianRows);
  await chunkedInsert(emergencyContactsTable, emergencyRows);

  // ── 10.5. Medical alerts (100% coverage — every student has at least one) ──
  // Pilot requirement: providers should never see a "no medical info on file"
  // student. Most students get a single mild allergy/no-known-allergies note;
  // ~25% get a clinically meaningful alert.
  const MILD_ALLERGIES = ["No known allergies", "Seasonal pollen — mild", "Dairy — mild lactose intolerance", "Tree nuts — avoid in shared snacks"];
  const SERIOUS_CONDITIONS: Array<{ alertType: "allergy" | "medication" | "condition" | "seizure" | "other"; description: string; severity: "moderate" | "severe" | "life_threatening"; epi?: boolean; treatmentNotes?: string }> = [
    { alertType: "allergy", description: "Peanut allergy", severity: "life_threatening", epi: true, treatmentNotes: "EpiPen on file in nurse's office. Avoid all peanut/tree-nut exposure." },
    { alertType: "allergy", description: "Bee sting allergy", severity: "severe", epi: true, treatmentNotes: "EpiPen on file. Notify nurse if outside time exceeds 15 minutes." },
    { alertType: "medication", description: "ADHD medication — Concerta 36mg, daily 8:00 AM", severity: "moderate", treatmentNotes: "Administered by school nurse. Parent will refill weekly." },
    { alertType: "condition", description: "Type 1 Diabetes", severity: "severe", treatmentNotes: "Glucose monitoring 4x/day. Insulin pump in use. Diabetes care plan on file." },
    { alertType: "condition", description: "Asthma — exercise-induced", severity: "moderate", treatmentNotes: "Inhaler in nurse's office and backpack. Pre-medicate before PE." },
    { alertType: "seizure", description: "Absence seizures — controlled with medication", severity: "moderate", treatmentNotes: "Seizure action plan on file. Notify nurse immediately if seizure lasts >2 minutes." },
  ];
  const medicalRows: (typeof medicalAlertsTable.$inferInsert)[] = [];
  for (const s of insertedStudents) {
    if (srand() < 0.25) {
      const sc = pick(SERIOUS_CONDITIONS);
      medicalRows.push({
        studentId: s.id,
        alertType: sc.alertType,
        description: sc.description,
        severity: sc.severity,
        treatmentNotes: sc.treatmentNotes ?? null,
        epiPenOnFile: sc.epi ?? false,
        notifyAllStaff: sc.severity === "life_threatening",
      });
    } else {
      medicalRows.push({
        studentId: s.id,
        alertType: "allergy",
        description: pick(MILD_ALLERGIES),
        severity: "mild",
        epiPenOnFile: false,
        notifyAllStaff: false,
      });
    }
  }
  await chunkedInsert(medicalAlertsTable, medicalRows);

  // ── 11. Alerts (state-driven from observed delivery) ──
  //
  // Mirrors the severity rules in
  // `artifacts/api-server/src/lib/complianceEngine.ts::runComplianceChecks()`
  // but operates on the rows we just inserted (we already hold them in
  // memory, so a second pass through `complianceEngine` over the network
  // would be wasted work). The categories below match what the engine
  // would emit on a fresh pass:
  //   - behind_on_minutes  (severity from delivered/required ratio)
  //   - missed_sessions    (high, when ≥3 missed for one SR)
  //   - projected_shortfall (high, when projection < 90%)
  // Plus the two non-minute alerts that aren't derived from session data:
  //   - iep / annual_review_due
  //   - compliance / incident_history
  //
  // Severity bands match the engine and the dashboard's `riskStatus`:
  //   pct < 50%       → critical (out_of_compliance)
  //   pct 50–70%      → high     (at_risk)
  //   pct 70–85%      → medium   (slightly_behind)
  //   pct ≥ 85%       → no alert (on_track)
  const alertRows: (typeof alertsTable.$inferInsert)[] = [];

  // Aggregate completed minutes and missed counts by (studentId, srId).
  type Agg = { delivered: number; missed: number };
  const aggByStudentSr = new Map<string, Agg>();
  for (const row of sessionRows) {
    if (row.studentId == null || row.serviceRequirementId == null) continue;
    const key = `${row.studentId}|${row.serviceRequirementId}`;
    const agg = aggByStudentSr.get(key) ?? { delivered: 0, missed: 0 };
    if (row.status === "completed") {
      agg.delivered += row.durationMinutes ?? 0;
    } else if (row.status === "missed") {
      agg.missed += 1;
    }
    aggByStudentSr.set(key, agg);
  }

  // Walk every SR and synthesize alerts for the worst-case SR per student so
  // we don't fire 3 stacked alerts on one student with 3 services.
  type WorstSr = {
    studentId: number;
    srId: number;
    pct: number;
    delivered: number;
    required: number;
    missed: number;
    serviceTypeId: number;
  };
  const worstByStudent = new Map<number, WorstSr>();
  for (const sr of insertedSrs) {
    if (sr.requiredMinutes <= 0) continue;
    const agg = aggByStudentSr.get(`${sr.studentId}|${sr.id}`) ?? { delivered: 0, missed: 0 };
    const pct = agg.delivered / sr.requiredMinutes;
    const current = worstByStudent.get(sr.studentId);
    if (!current || pct < current.pct) {
      worstByStudent.set(sr.studentId, {
        studentId: sr.studentId,
        srId: sr.id,
        pct,
        delivered: agg.delivered,
        required: sr.requiredMinutes,
        missed: agg.missed,
        serviceTypeId: sr.serviceTypeId,
      });
    }
  }

  const serviceTypeNameById = new Map(serviceTypes.map(t => [t.id, t.name]));
  const studentNameById = new Map(insertedStudents.map(s => [s.id, `${s.firstName} ${s.lastName}`]));

  for (const w of worstByStudent.values()) {
    const studentName = studentNameById.get(w.studentId) ?? "Student";
    const serviceName = serviceTypeNameById.get(w.serviceTypeId) ?? "service";
    const pctRounded = Math.round(w.pct * 100);

    if (w.pct < 0.5) {
      alertRows.push({
        type: "behind_on_minutes",
        severity: "critical",
        studentId: w.studentId,
        serviceRequirementId: w.srId,
        message: `${studentName} is out of compliance for ${serviceName}. Delivered ${w.delivered} of ${w.required} required minutes (${pctRounded}% complete).`,
        suggestedAction: "Schedule makeup sessions immediately to address the deficit.",
        resolved: false,
      });
    } else if (w.pct < 0.7) {
      alertRows.push({
        type: "behind_on_minutes",
        severity: "high",
        studentId: w.studentId,
        serviceRequirementId: w.srId,
        message: `${studentName} is at risk for ${serviceName}. Delivered ${w.delivered} of ${w.required} minutes (${pctRounded}% complete).`,
        suggestedAction: "Review schedule and add additional sessions to close the gap.",
        resolved: false,
      });
    } else if (w.pct < 0.85) {
      alertRows.push({
        type: "behind_on_minutes",
        severity: "medium",
        studentId: w.studentId,
        serviceRequirementId: w.srId,
        message: `${studentName} is slightly behind on ${serviceName}. ${Math.max(0, w.required - w.delivered)} minutes remaining.`,
        suggestedAction: "Monitor and ensure upcoming sessions are not missed.",
        resolved: false,
      });
    }

    // Independent missed_sessions alert when ≥3 misses on the worst SR.
    if (w.missed >= 3) {
      alertRows.push({
        type: "missed_sessions",
        severity: "high",
        studentId: w.studentId,
        serviceRequirementId: w.srId,
        message: `${studentName} has ${w.missed} missed sessions for ${serviceName} this interval.`,
        suggestedAction: "Investigate root cause of missed sessions and address staffing or scheduling issues.",
        resolved: false,
      });
    }
  }

  // Non-minute alerts derived from scenario state (IEP-due, incident
  // history). These aren't surfaced by the compliance engine — they come
  // from IEP and restraint state, not session delivery — so they remain
  // scenario-driven.
  for (const spec of studentSpecs) {
    if (spec.scenario === "annual_review_due") {
      alertRows.push({
        type: "iep", severity: "high", studentId: spec.id,
        message: "Annual IEP review due within 30 days. Team meeting must be scheduled.",
        suggestedAction: "Contact family to schedule annual IEP meeting and send prior written notice.",
        resolved: false,
      });
    } else if (spec.scenario === "incident_history") {
      alertRows.push({
        type: "compliance", severity: "medium", studentId: spec.id,
        message: "Student has 2 documented restraint incidents this year. BIP review recommended.",
        suggestedAction: "Schedule BIP fidelity review with BCBA and update behavior support strategies.",
        resolved: false,
      });
    }
  }

  if (alertRows.length > 0) await chunkedInsert(alertsTable, alertRows);

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
  if (compRows.length > 0) await chunkedInsert(compensatoryObligationsTable, compRows);

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

  // ── 14.5. Team meetings, evaluations, compliance events, parent communications ──
  // Adds the cross-functional surface that case managers and admins expect to
  // see in a real district: scheduled annual reviews, in-flight evaluations,
  // upcoming compliance deadlines, and a parent-communication audit trail.

  const teamMeetingRows: (typeof teamMeetingsTable.$inferInsert)[] = [];
  const complianceEventRows: (typeof complianceEventsTable.$inferInsert)[] = [];
  const evaluationRows: (typeof evaluationsTable.$inferInsert)[] = [];
  const communicationRows: (typeof communicationEventsTable.$inferInsert)[] = [];

  for (const s of insertedStudents) {
    const idx = insertedStudents.indexOf(s);
    const def = STUDENT_DEFS[idx];
    const iepDocId = iepByStudent.get(s.id);
    const iep = insertedIeps.find(d => d.studentId === s.id);

    // ── Annual IEP review compliance event (every student) ──
    const annualReviewDate = def.scenario === "annual_review_due"
      ? addDays(today, rand(7, 28))
      : iep?.iepEndDate ?? addDays(today, rand(60, 280));
    complianceEventRows.push({
      studentId: s.id,
      schoolYearId: schoolYear.id,
      eventType: "annual_review",
      title: "Annual IEP Review",
      dueDate: annualReviewDate,
      status: def.scenario === "annual_review_due" ? "due_soon" : "upcoming",
    });

    // ── Past annual review (completed) — every student with an IEP gets a
    // historical team meeting, so the IEP↔meeting record requirement holds. ──
    if (iep) {
      const completedDate = addDays(iep.iepStartDate, -rand(0, 14));
      complianceEventRows.push({
        studentId: s.id,
        schoolYearId: schoolYear.id,
        eventType: "annual_review",
        title: "Annual IEP Review (Completed)",
        dueDate: iep.iepStartDate,
        completedDate,
        status: "completed",
        resolvedAt: completedDate,
        resolvedBy: caseManager?.id ?? null,
      });

      // Past annual IEP team meeting
      teamMeetingRows.push({
        studentId: s.id,
        iepDocumentId: iepDocId ?? null,
        schoolId: s.schoolId,
        meetingType: "annual_review",
        scheduledDate: completedDate,
        scheduledTime: "09:00",
        endTime: "10:30",
        duration: 90,
        location: "Conference Room A",
        meetingFormat: "in_person",
        status: "completed",
        attendees: [
          { name: `${caseManager?.firstName} ${caseManager?.lastName}`, role: "Case Manager", present: true },
          { name: "Parent/Guardian", role: "Parent", present: true },
          { name: "Special Education Teacher", role: "Teacher", present: true },
        ],
        outcome: "IEP reviewed and updated. Goals carried forward with revised baselines. Family in agreement.",
        minutesFinalized: true,
        consentStatus: "obtained",
        noticeSentDate: addDays(completedDate, -10),
        schoolYearId: schoolYear.id,
      });
    }

    // ── Upcoming annual review meeting for annual_review_due scenario ──
    if (def.scenario === "annual_review_due") {
      teamMeetingRows.push({
        studentId: s.id,
        iepDocumentId: iepDocId ?? null,
        schoolId: s.schoolId,
        meetingType: "annual_review",
        scheduledDate: annualReviewDate,
        scheduledTime: "10:00",
        endTime: "11:30",
        duration: 90,
        location: "Conference Room A",
        meetingFormat: "in_person",
        status: "scheduled",
        agendaItems: [
          "Review progress on current IEP goals",
          "Discuss present levels of performance",
          "Develop new annual goals",
          "Determine service needs",
          "Review accommodations",
        ],
        consentStatus: "pending",
        noticeSentDate: addDays(today, -rand(3, 10)),
        schoolYearId: schoolYear.id,
      });
    }

    // ── Quarterly progress report compliance event ──
    complianceEventRows.push({
      studentId: s.id,
      schoolYearId: schoolYear.id,
      eventType: "progress_report",
      title: "Quarterly Progress Report Due",
      dueDate: addDays(today, rand(10, 45)),
      status: "upcoming",
    });

    // ── 3-year reevaluation (federally mandated, ~every 3rd student is due) ──
    if (idx % 3 === 0) {
      complianceEventRows.push({
        studentId: s.id,
        schoolYearId: schoolYear.id,
        eventType: "reeval_3yr",
        title: "Three-Year Reevaluation",
        dueDate: addDays(today, rand(30, 270)),
        status: idx % 9 === 0 ? "due_soon" : "upcoming",
      });
    }

    // ── Mid-year team meeting (~half of students) ──
    if (srand() < 0.5) {
      complianceEventRows.push({
        studentId: s.id,
        schoolYearId: schoolYear.id,
        eventType: "team_meeting",
        title: "Mid-Year IEP Team Meeting",
        dueDate: addDays(today, rand(-30, 60)),
        status: "upcoming",
      });
    }

    // ── Initial/triennial evaluation in flight (~25% of roster) ──
    if (srand() < 0.25) {
      const evalDue = addDays(today, rand(7, 60));
      complianceEventRows.push({
        studentId: s.id,
        schoolYearId: schoolYear.id,
        eventType: "evaluation",
        title: "Special Education Evaluation",
        dueDate: evalDue,
        status: evalDue.localeCompare(addDays(today, 14)) < 0 ? "due_soon" : "upcoming",
      });
    }

    // ── Manifestation determination for behavioral / ED scenarios ──
    if (def.scenario === "behavior_plan" || def.scenario === "incident_history") {
      complianceEventRows.push({
        studentId: s.id,
        schoolYearId: schoolYear.id,
        eventType: "manifestation_determination",
        title: "Manifestation Determination Review",
        dueDate: addDays(today, rand(3, 10)),
        status: "due_soon",
      });
    }

    // ── Transition planning event for HS students (grade 9+) ──
    if (s.grade && ["9", "10", "11", "12"].includes(s.grade)) {
      complianceEventRows.push({
        studentId: s.id,
        schoolYearId: schoolYear.id,
        eventType: "transition_planning",
        title: "Transition Planning Review",
        dueDate: addDays(today, rand(14, 120)),
        status: "upcoming",
      });
    }

    // ── Parent communication: progress report shared (~80% of students) ──
    if (srand() < 0.8) {
      const sentAt = daysAgo(rand(7, 60));
      communicationRows.push({
        studentId: s.id,
        channel: "email",
        status: "delivered",
        type: "progress_report",
        subject: `Quarterly progress report for ${s.firstName} ${s.lastName}`,
        bodyText: `Dear Family,\n\nAttached is the quarterly progress report for ${s.firstName}. Please review and reach out with any questions.\n\nBest,\nThe IEP Team`,
        toEmail: `parent.${s.lastName.toLowerCase()}${s.id}@sample.trellis.local`,
        toName: `Family of ${s.firstName} ${s.lastName}`,
        fromEmail: "noreply@trellis.local",
        sentAt,
        acceptedAt: sentAt,
        deliveredAt: new Date(sentAt.getTime() + 30_000),
      });
    }

    // ── Meeting notice email for upcoming meetings (~40%) ──
    if (def.scenario === "annual_review_due" || srand() < 0.3) {
      const sentAt = daysAgo(rand(2, 14));
      communicationRows.push({
        studentId: s.id,
        channel: "email",
        status: "delivered",
        type: "meeting_notice",
        subject: `IEP team meeting notice for ${s.firstName} ${s.lastName}`,
        bodyText: `Dear Family,\n\nThis is a notice that we have scheduled a team meeting to discuss ${s.firstName}'s IEP. Please confirm your availability.\n\nBest,\nThe IEP Team`,
        toEmail: `parent.${s.lastName.toLowerCase()}${s.id}@sample.trellis.local`,
        toName: `Family of ${s.firstName} ${s.lastName}`,
        fromEmail: "noreply@trellis.local",
        sentAt,
        acceptedAt: sentAt,
        deliveredAt: new Date(sentAt.getTime() + 30_000),
      });
    }
  }

  // ── In-flight evaluations for ~15% of students (3-year reevaluation cycle) ──
  const evalCandidates = insertedStudents.filter(() => srand() < 0.15);
  for (const s of evalCandidates) {
    const startDate = addDays(today, -rand(15, 50));
    const dueDate = addDays(startDate, 60);
    const isOverdue = srand() < 0.2;
    evaluationRows.push({
      studentId: s.id,
      evaluationType: pick(["reevaluation", "initial", "reevaluation"]),
      evaluationAreas: [
        { area: "Academic", assignedTo: caseManager ? `${caseManager.firstName} ${caseManager.lastName}` : "Case Manager", status: "in_progress" },
        { area: "Speech-Language", assignedTo: slp ? `${slp.firstName} ${slp.lastName}` : "SLP", status: "in_progress" },
        { area: "Cognitive", assignedTo: caseManager ? `${caseManager.firstName} ${caseManager.lastName}` : "Case Manager", status: "pending" },
      ],
      teamMembers: [
        { name: caseManager ? `${caseManager.firstName} ${caseManager.lastName}` : "Case Manager", role: "Case Manager" },
        { name: slp ? `${slp.firstName} ${slp.lastName}` : "SLP", role: "Speech-Language Pathologist" },
      ],
      leadEvaluatorId: caseManager?.id ?? null,
      startDate,
      dueDate,
      status: isOverdue ? "overdue" : "in_progress",
    });
  }

  if (teamMeetingRows.length > 0) {
    for (let i = 0; i < teamMeetingRows.length; i += 200) {
      await db.insert(teamMeetingsTable).values(teamMeetingRows.slice(i, i + 200));
    }
  }
  if (complianceEventRows.length > 0) {
    for (let i = 0; i < complianceEventRows.length; i += 200) {
      await db.insert(complianceEventsTable).values(complianceEventRows.slice(i, i + 200));
    }
  }
  if (evaluationRows.length > 0) {
    await chunkedInsert(evaluationsTable, evaluationRows);
  }
  if (communicationRows.length > 0) {
    for (let i = 0; i < communicationRows.length; i += 200) {
      await db.insert(communicationEventsTable).values(communicationRows.slice(i, i + 200));
    }
  }

  // ── 15. Goal progress backfill (90 days of ABA/clinical data) ──

  const { backfillGoalProgressForStudents } = await import("./backfill-goal-progress");
  await backfillGoalProgressForStudents(insertedStudents.map((s) => s.id), districtId);

  // ── 15.5. Progress reports with goal_progress JSONB (mastery rate fix) ──
  // Every student gets one finalized progress report covering the most recent
  // quarter. The goal_progress JSONB array contains an entry per active iep_goal
  // — overviewStats.ts reads this array via jsonb_array_elements to compute the
  // dashboard mastery rate. Distribution per student is roughly:
  //   healthy / recovered:   65% mastered+sufficient, 25% some, 10% insufficient
  //   shortfall / sliding:   35% mastered+sufficient, 40% some, 25% insufficient
  //   crisis / urgent:       15% mastered+sufficient, 35% some, 50% insufficient
  //   default:               50% mastered+sufficient, 30% some, 20% insufficient
  const RATING_MIXES: Record<string, Array<{ rating: string; weight: number }>> = {
    strong: [
      { rating: "mastered", weight: 0.20 },
      { rating: "sufficient_progress", weight: 0.50 },
      { rating: "some_progress", weight: 0.20 },
      { rating: "insufficient_progress", weight: 0.10 },
    ],
    weak: [
      { rating: "mastered", weight: 0.05 },
      { rating: "sufficient_progress", weight: 0.30 },
      { rating: "some_progress", weight: 0.40 },
      { rating: "insufficient_progress", weight: 0.25 },
    ],
    poor: [
      { rating: "mastered", weight: 0.02 },
      { rating: "sufficient_progress", weight: 0.13 },
      { rating: "some_progress", weight: 0.35 },
      { rating: "insufficient_progress", weight: 0.50 },
    ],
    standard: [
      { rating: "mastered", weight: 0.15 },
      { rating: "sufficient_progress", weight: 0.40 },
      { rating: "some_progress", weight: 0.30 },
      { rating: "insufficient_progress", weight: 0.15 },
    ],
  };
  const SCENARIO_TO_MIX: Partial<Record<Scenario, keyof typeof RATING_MIXES>> = {
    healthy: "strong",
    recovered: "strong",
    shortfall: "weak",
    sliding: "weak",
    compensatory_risk: "weak",
    urgent: "poor",
    crisis: "poor",
    behavior_plan: "standard",
    incident_history: "standard",
    transition: "standard",
    annual_review_due: "standard",
    esy_eligible: "standard",
  };

  function pickWeighted<T extends { weight: number }>(items: T[]): T {
    const total = items.reduce((s, i) => s + i.weight, 0);
    let r = srand() * total;
    for (const item of items) {
      r -= item.weight;
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  }

  // Re-fetch goals so we have the autoincrement ids (some may have masteredAt set in step 5)
  const allGoals = await db.select().from(iepGoalsTable).where(inArray(iepGoalsTable.studentId, insertedStudents.map(s => s.id)));
  const goalsByStudent = new Map<number, typeof allGoals>();
  for (const g of allGoals) {
    const list = goalsByStudent.get(g.studentId) ?? [];
    list.push(g);
    goalsByStudent.set(g.studentId, list);
  }

  // Two reporting periods (Q-1 and current) so the dashboard shows a real
  // before/after trend and so historical mastery has a place to land.
  // Q1 covers days -180..-91; Q2 covers days -90..0.
  const codeMap: Record<string, string> = {
    mastered: "M",
    sufficient_progress: "S",
    some_progress: "P",
    insufficient_progress: "I",
    not_addressed: "N",
  };
  const quarterLabel = (refDate: string) => {
    const d = new Date(refDate);
    return `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`;
  };
  const periods = [
    { start: addDays(today, -180), end: addDays(today, -91), label: quarterLabel(addDays(today, -91)) },
    { start: addDays(today, -90),  end: today,               label: quarterLabel(today) },
  ];

  const progressReportRows: (typeof progressReportsTable.$inferInsert)[] = [];
  const goalsToMaster = new Set<number>();

  for (const s of insertedStudents) {
    const idx = insertedStudents.indexOf(s);
    const def = STUDENT_DEFS[idx];
    const mix = RATING_MIXES[SCENARIO_TO_MIX[def.scenario] ?? "standard"];
    const goals = goalsByStudent.get(s.id) ?? [];
    if (goals.length === 0) continue;

    // Track ratings the prior period assigned per goal so we never
    // regress (e.g. mastered in Q-1 then "some_progress" in Q2). Periods
    // are processed earliest-first so this carry-forward is correct.
    const priorRatingByGoal = new Map<number, string>();
    for (const period of periods) {
      const isCurrent = period.end === today;
      const goalProgress: GoalProgressEntry[] = goals
        .filter(g => g.active)
        .map(g => {
          // Already-mastered goals stay mastered. Prior-period mastery
          // also locks subsequent periods to "mastered" — mastery does
          // not regress. New mastery in the current quarter is mirrored
          // back onto iep_goals (status + masteredAt) so the goal-status
          // pipeline reflects the report.
          const wasPreviouslyMastered = priorRatingByGoal.get(g.id) === "mastered";
          const rating = g.status === "mastered" || g.masteredAt || wasPreviouslyMastered
            ? "mastered"
            : pickWeighted(mix).rating;
          priorRatingByGoal.set(g.id, rating);
          if (isCurrent && rating === "mastered" && g.status !== "mastered" && !g.masteredAt) {
            goalsToMaster.add(g.id);
          }
          return {
            iepGoalId: g.id,
            goalArea: g.goalArea,
            goalNumber: g.goalNumber,
            annualGoal: g.annualGoal,
            baseline: g.baseline,
            targetCriterion: g.targetCriterion,
            currentPerformance: rating === "mastered"
              ? "Mastery criteria met across the reporting period."
              : rating === "sufficient_progress"
                ? "Steady progress observed; on track to meet annual goal."
                : rating === "some_progress"
                  ? "Some progress observed; additional supports may be needed."
                  : "Insufficient progress; team to review program modifications.",
            progressRating: rating,
            progressCode: codeMap[rating] ?? "N",
            dataPoints: rand(8, 24),
            trendDirection: rating === "mastered" || rating === "sufficient_progress"
              ? "improving"
              : rating === "insufficient_progress" ? "declining" : "stable",
            narrative: `${s.firstName} ${rating === "mastered" ? "has met mastery criteria" : rating === "sufficient_progress" ? "is making sufficient progress" : rating === "some_progress" ? "is making some progress" : "is making insufficient progress"} on this goal during the reporting period.`,
            measurementMethod: g.measurementMethod ?? null,
            serviceArea: g.serviceArea ?? null,
          };
        });

      progressReportRows.push({
        studentId: s.id,
        reportingPeriod: period.label,
        periodStart: period.start,
        periodEnd: period.end,
        preparedBy: caseManager?.id ?? null,
        status: "finalized",
        overallSummary: `Quarterly progress summary for ${s.firstName} ${s.lastName} (${period.label}).`,
        goalProgress,
        parentNotificationDate: addDays(period.end, -rand(0, 7)),
        parentNotificationMethod: "email",
      });
    }
  }

  if (progressReportRows.length > 0) {
    for (let i = 0; i < progressReportRows.length; i += 100) {
      await db.insert(progressReportsTable).values(progressReportRows.slice(i, i + 100));
    }
  }

  // Mirror the current-quarter "mastered" ratings back onto iep_goals so
  // status pipelines (recent wins, mastery rate, completed-goals report)
  // see them. Done in one bulk UPDATE for speed.
  if (goalsToMaster.size > 0) {
    const ids = Array.from(goalsToMaster);
    await db.update(iepGoalsTable)
      .set({ status: "mastered", masteredAt: new Date(today) })
      .where(inArray(iepGoalsTable.id, ids));
  }

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
    sizeProfile,
  };

  } catch (err) {
    // Deterministic rollback: always tear down the partial seed so the
    // caller can retry from a clean slate. teardownSampleData is scoped
    // to rows tagged `is_sample = true` within this district's schools,
    // so it cannot delete operator-authored data even when this call
    // didn't create the district stub. We log (don't swallow) the
    // teardown error and rethrow the original error so the root cause
    // surfaces unchanged. The `districtCreatedHereForRollback` flag is
    // retained only for the post-rollback district-stub cleanup below —
    // we should not leave behind an empty stub we just created.
    try {
      await teardownSampleData(districtId);
    } catch (teardownErr) {
      console.error(
        `[seed-sample-data] rollback teardown failed for district ${districtId}:`,
        teardownErr,
      );
    }
    if (districtCreatedHereForRollback) {
      // Best-effort cleanup of the empty district stub we created in this
      // call — only attempted after teardown so all FK children are gone.
      try {
        await db.delete(districtsTable).where(eq(districtsTable.id, districtId));
      } catch {
        // FK constraints may still exist (schools, school_years etc. are
        // not is_sample-scoped); ignore silently — operators can clean
        // the orphaned stub manually.
      }
    }
    throw err;
  }
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
    // Robust wipe path:
    //   1. Walk the pg FK graph transitively from `students` to discover every
    //      table that holds a (possibly indirect) reference to a student row,
    //      plus the column it uses on its direct parent.
    //   2. Inside one transaction, set session_replication_role=replica so the
    //      ordering of DELETEs doesn't matter, then delete from every reachable
    //      table. This is safe because we *enumerated* the tables dynamically
    //      from pg_constraint — nothing gets silently orphaned via schema
    //      drift the way a hand-maintained list would.
    //   3. Add an explicit non-FK list for tables that store student_id but
    //      lack a real FK (currently just `communication_events`).
    //
    // Sample data only — replica role is scoped to the transaction.
    const idsList = studentIds.join(",");

    // ---- Walk the FK graph (outside the txn; pg_constraint is read-only) ----
    // table -> set of {column, parentTable, parentColumn} so we can build
    // delete predicates relative to the chain back to students.id.
    type Edge = { child: string; childCol: string; parent: string; parentCol: string };
    const allEdgesRes = await db.execute(sql`
      SELECT cl.relname  AS child,
             att.attname AS child_col,
             rcl.relname AS parent,
             ratt.attname AS parent_col
      FROM pg_constraint c
      JOIN pg_class cl   ON cl.oid  = c.conrelid
      JOIN pg_class rcl  ON rcl.oid = c.confrelid
      JOIN pg_attribute att  ON att.attrelid  = c.conrelid  AND att.attnum  = ANY(c.conkey)
      JOIN pg_attribute ratt ON ratt.attrelid = c.confrelid AND ratt.attnum = ANY(c.confkey)
      WHERE c.contype = 'f'
    `);
    const allEdges: Edge[] = (allEdgesRes.rows as any[]).map(r => ({
      child: r.child, childCol: r.child_col, parent: r.parent, parentCol: r.parent_col,
    }));

    // BFS: find every table reachable from students via FK chains.
    // For each reachable table, store the SQL predicate that scopes its rows
    // to the sample student set.
    const predicates = new Map<string, string[]>(); // tableName -> [predicate, ...]
    const queue: Array<{ table: string; rowsPredicate: string }> = [
      { table: "students", rowsPredicate: `id IN (${idsList})` },
    ];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const { table, rowsPredicate } = queue.shift()!;
      if (visited.has(`${table}|${rowsPredicate}`)) continue;
      visited.add(`${table}|${rowsPredicate}`);
      for (const e of allEdges) {
        if (e.parent !== table) continue;
        if (e.child === e.parent) continue; // self-ref handled separately
        const childPredicate = `"${e.childCol}" IN (SELECT "${e.parentCol}" FROM "${e.parent}" WHERE ${rowsPredicate})`;
        const list = predicates.get(e.child) ?? [];
        list.push(childPredicate);
        predicates.set(e.child, list);
        // Recurse: rows of child matched by this predicate become a new
        // scope to walk further from. Only enqueue if depth is reasonable.
        if (queue.length < 500) {
          queue.push({ table: e.child, rowsPredicate: childPredicate });
        }
      }
    }

    await db.transaction(async (tx) => {
      // session_replication_role=replica is scoped to this txn; constraints
      // are restored on COMMIT/ROLLBACK. Required because the FK graph has
      // cycles and multi-level chains that would otherwise need topological
      // sort. We've already enumerated every reachable table above so
      // nothing gets silently orphaned.
      await tx.execute(sql`SET LOCAL session_replication_role = 'replica'`);
      // Disable parallel-worker plans for this txn: snapshot SELECTs over
      // huge IN-lists (thousands of students) otherwise spawn parallel
      // workers that each allocate ~8 MB of shared memory on /dev/shm. In
      // constrained environments (containers with default 64 MB shm) this
      // hits "could not resize shared memory segment ... No space left on
      // device" (53100). Forcing serial execution costs a few seconds but
      // keeps the wipe deterministic and within the shared-memory budget.
      await tx.execute(sql`SET LOCAL max_parallel_workers_per_gather = 0`);

      // ---- Snapshot phase ----
      // The reachable predicates reference parent rows (e.g. SGD's predicate
      // is `session_log_id IN (SELECT id FROM session_logs WHERE ...)`). If
      // we DELETE in BFS order, the parent (`session_logs`) is wiped first
      // and the child (`session_goal_data`) predicate evaluates to an empty
      // set — leaving orphans. Fix: snapshot each reachable table's row
      // identifiers (ctid is stable within a txn) into a temp table while
      // every parent is still intact, then delete by ctid.
      const tableNames: string[] = [];
      let tmpIdx = 0;
      for (const [table, preds] of predicates.entries()) {
        if (table === "students") continue;
        const where = preds.map(p => `(${p})`).join(" OR ");
        const tmp = `_td_snap_${tmpIdx++}`;
        await tx.execute(sql.raw(
          `CREATE TEMP TABLE "${tmp}" ON COMMIT DROP AS SELECT ctid AS row_ctid FROM "${table}" WHERE ${where}`
        ));
        tableNames.push(`${table}|${tmp}`);
      }

      // Tables with student_id but no real FK (pg_constraint wouldn't see them).
      const nonFkStudentLinkedTables = ["communication_events"];
      for (const t of nonFkStudentLinkedTables) {
        await tx.execute(sql.raw(`DELETE FROM "${t}" WHERE student_id IN (${idsList})`));
      }

      // ---- Delete phase ---- (snapshots already captured; order no longer matters)
      // Note: temp table column was aliased to row_ctid so the inner SELECT
      // returns the *parent* table's ctids (not the temp table's own ctid).
      for (const entry of tableNames) {
        const [table, tmp] = entry.split("|");
        await tx.execute(sql.raw(
          `DELETE FROM "${table}" WHERE ctid IN (SELECT row_ctid FROM "${tmp}")`
        ));
      }

      // Self-ref on students (case_manager_id) and final delete.
      await tx.execute(sql.raw(`UPDATE students SET case_manager_id = NULL WHERE id IN (${idsList})`));
      await tx.execute(sql.raw(`DELETE FROM students WHERE id IN (${idsList})`));
    });
  }

  if (staffIds.length > 0) {
    // Nullify every FK that points at these sample staff rows but lives
    // on a row that did NOT come from this seed cycle (e.g. left over from
    // a prior failed teardown, or from real data in the same district).
    // We discover them dynamically from pg_constraint so schema drift
    // doesn't silently re-introduce dangling references.
    const staffFksRes = await db.execute(sql`
      SELECT cl.relname AS child, att.attname AS child_col
      FROM pg_constraint c
      JOIN pg_class cl  ON cl.oid  = c.conrelid
      JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = ANY(c.conkey)
      WHERE c.contype = 'f'
        AND c.confrelid = 'staff'::regclass
    `);
    const staffFks = (staffFksRes.rows as any[]).map(r => ({ table: r.child, column: r.child_col }));
    const staffIdList = staffIds.join(",");

    for (const { table, column } of staffFks) {
      // Nullify in a single statement per FK. Safe because these are sample
      // staff slated for deletion or graduation — nothing in the system
      // should be relying on a hard pointer to them after this point.
      try {
        await db.execute(sql.raw(
          `UPDATE "${table}" SET "${column}" = NULL WHERE "${column}" IN (${staffIdList})`
        ));
      } catch {
        // Some FKs are NOT NULL (e.g. join tables). Skip — those rows will
        // either have been wiped via the student-graph walk or will block
        // the staff delete and force the row into the "graduated" branch.
      }
    }

    // Anything still referencing these staff (e.g. NOT NULL FKs we couldn't
    // null out) → graduate that staff (mark isSample=false) instead of
    // deleting. Otherwise → delete cleanly.
    const stillReferencedRes = await db.execute(sql.raw(`
      SELECT DISTINCT staff_id_ref FROM (
        SELECT staff_id AS staff_id_ref FROM schedule_blocks WHERE staff_id IN (${staffIdList})
        UNION ALL
        SELECT staff_id FROM staff_assignments WHERE staff_id IN (${staffIdList})
        UNION ALL
        SELECT teacher_id FROM classes WHERE teacher_id IN (${staffIdList})
      ) t WHERE staff_id_ref IS NOT NULL
    `));
    const stillReferencedStaffIds = (stillReferencedRes.rows as any[])
      .map(r => Number(r.staff_id_ref))
      .filter(n => Number.isFinite(n));
    const safelyDeletableStaffIds = staffIds.filter(id => !stillReferencedStaffIds.includes(id));
    _safelyDeletableStaffIdsCount = safelyDeletableStaffIds.length;
    _stillReferencedStaffIdsCount = stillReferencedStaffIds.length;

    if (safelyDeletableStaffIds.length > 0) {
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
