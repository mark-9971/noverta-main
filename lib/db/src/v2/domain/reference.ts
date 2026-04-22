/**
 * Seed Overhaul V2 — Domain / Reference catalogs.
 *
 * Extracted from `seed-sample-data.ts` (W2). Pure data and pure helpers
 * only — no DB I/O, no RNG state, no scenario logic. This module is the
 * stable substrate for the rest of the domain layer (roster, clinical,
 * shape) and for the later W3 simulator.
 *
 * Behavior is byte-identical to the inline definitions before W2.
 */

// ──────────────────────────────────────────────────────────────────
// Bounds the seeder samples within (minutes per requirement, time of
// day window, sessions-per-requirement bands, comp-ed fractions, etc.).
// ──────────────────────────────────────────────────────────────────
export const SAMPLE_BOUNDS = {
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

export const SIZE_PROFILES = {
  small:  { students: 20,  staff: 3  },
  medium: { students: 60,  staff: 10 },
  large:  { students: 120, staff: 18 },
} as const;

/**
 * For the *default* (no explicit profile) path the user wants each district
 * to ship with a randomized 50–100 student roster — large enough to feel
 * like a real district but bounded so demos stay snappy. The seeded RNG
 * makes the choice reproducible per district id.
 */
export const DEFAULT_RANDOM_ROSTER_RANGE: readonly [number, number] = [50, 100];

// ──────────────────────────────────────────────────────────────────
// Disability / grade / school catalogs
// ──────────────────────────────────────────────────────────────────

export const DISABILITY_MAP: Record<string, string[]> = {
  SLD: ["Specific Learning Disability"],
  ASD: ["Autism Spectrum Disorder"],
  OHI: ["Other Health Impairment"],
  SLI: ["Speech-Language Impairment"],
  ED:  ["Emotional Disturbance"],
  ID:  ["Intellectual Disability"],
  MD:  ["Multiple Disabilities"],
};

export const DISABILITY_POOL: string[] = [
  ...Array(14).fill("Specific Learning Disability"),
  ...Array(8).fill("Speech-Language Impairment"),
  ...Array(5).fill("Autism Spectrum Disorder"),
  ...Array(5).fill("Other Health Impairment"),
  ...Array(3).fill("Emotional Disturbance"),
  ...Array(3).fill("Intellectual Disability"),
  ...Array(2).fill("Multiple Disabilities"),
];

export const GRADES_ELEM   = ["K", "1", "2", "3", "4", "5"];
export const GRADES_MIDDLE = ["6", "7", "8"];
export const GRADES_HIGH   = ["9", "10", "11", "12"];
export const GRADES_ALL    = [...GRADES_ELEM, ...GRADES_MIDDLE, ...GRADES_HIGH];

export const SCHOOL_NAMES = [
  "Greenfield Elementary",
  "Riverside Middle School",
  "Lincoln Elementary",
  "Westview Middle School",
  "Central High School",
];

// ──────────────────────────────────────────────────────────────────
// Person-name pools (drawn into roster generation)
// ──────────────────────────────────────────────────────────────────

export const FIRST_NAMES = [
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

export const LAST_NAMES = [
  "Anderson", "Bernier", "Cabral", "Hernandez", "Ibrahim",
  "Keane", "Morales", "Nguyen", "Patel", "Walsh",
  "Rivera", "Chen", "Johnson", "Williams", "Thompson",
  "Okonkwo", "Santos", "Reyes", "Kim", "Okafor",
];

// ──────────────────────────────────────────────────────────────────
// Service catalog — 11 default service types covering the requested
// catalog: 5 direct services + 3 academic/APE interventions + 3
// consult variants. Consult variants reuse the same CPT code as their
// direct parent (consult time is bundled under the same procedure code
// by Medicaid in MA) but at a lower hourly rate to reflect indirect
// service delivery.
// ──────────────────────────────────────────────────────────────────
export const SERVICE_TYPE_DEFAULTS = [
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

// ──────────────────────────────────────────────────────────────────
// Date / time helpers (pure, no RNG)
// ──────────────────────────────────────────────────────────────────

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export function minToTime(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export function isWeekday(dateStr: string): boolean {
  const dow = new Date(dateStr + "T00:00:00").getDay();
  return dow !== 0 && dow !== 6;
}

export function collectWeekdays(today: string, daysBack: number): string[] {
  const dates: string[] = [];
  for (let i = daysBack; i >= 1; i--) {
    const ds = addDays(today, -i);
    if (isWeekday(ds)) dates.push(ds);
  }
  return dates;
}
