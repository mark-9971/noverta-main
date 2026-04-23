/**
 * Seed Overhaul V2 — Domain / Roster / Student definitions.
 *
 * Extracted from `seed-sample-data.ts` (W2). Holds the pure
 * `StudentDef` builder and the size-profile resolver.
 *
 * The actual student-row inserts (with names, DOB, school assignment,
 * case manager round-robin, etc.) still live inside
 * `seedSampleDataForDistrict()` because they interleave with case
 * manager IDs from the staff insert and the school IDs from the school
 * insert. That orchestration moves in W3 (simulator wave) once those IDs
 * become first-class data structures rather than locals.
 *
 * Behavior is byte-identical to the pre-W2 inline definitions:
 *   - same SPECIAL_PRESETS (transition = grades 10/11 + ID, crisis =
 *     ELEM/MIDDLE + ED, behavior_plan = ELEM + ASD, etc.)
 *   - same stable SCENARIO_ORDER iteration (downstream code does
 *     `.find(... === scenario)` for restraints / transition plans)
 *   - same scenario-weight clamp (≥1 when base profile non-zero)
 *   - same school cursor + healthy-grade-pool cycling
 *   - same "random" → seeded RNG pick in resolveSizeProfile
 */

import { pick } from "../../platform/rng";
import { type Scenario, SCENARIO_COUNTS_BY_PROFILE } from "../../scenarios";
import {
  type SizeProfile,
  SIZE_PROFILES,
  GRADES_ELEM,
  GRADES_MIDDLE,
  GRADES_HIGH,
  GRADES_ALL,
} from "../reference";

/**
 * Per-student authoring record. Captures the scenario, the school slot,
 * the eligible grade band, and an optional locked disability — i.e. the
 * minimum input the downstream student-row generator needs.
 */
export type StudentDef = {
  scenario: Scenario;
  schoolIdx: number;
  grades: string[];
  disability?: string;
};

/**
 * Caller-facing helper that maps the user-facing `SizeProfile` (which
 * includes "random") to a concrete profile key. The "random" branch uses
 * the seeded RNG so successive runs against the same district id pin to
 * the same chosen profile.
 */
export function resolveSizeProfile(
  profile: SizeProfile | undefined,
): Exclude<SizeProfile, "random"> {
  if (!profile || profile === "random") {
    if (profile === "random") {
      // T-V2-09 — random now spans all four profiles including xl, so a
      // pilot district can intentionally land on a stress-scale roster.
      return pick(["small", "medium", "large", "xl"] as const);
    }
    // T-V2-09 — operator default is "medium" (~350 students). The
    // contract explicitly retired the implicit ~50–100 random override.
    return "medium";
  }
  return profile;
}

/**
 * Build the per-student definition list for the chosen profile. Layout:
 *   1. All canonical scenarios (counts per `SCENARIO_COUNTS_BY_PROFILE`)
 *   2. Healthy students fill the remainder up to profile.students
 *
 * Schools and grade bands cycle so students are spread across all 5
 * sample schools (or as many as exist) and across K–12.
 */
export function buildStudentDefs(
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

/**
 * Minimal student "spec" the downstream generators (goals, service
 * requirements, etc.) consume after the row has been inserted and IDs
 * are known. Kept here so it lives next to the def builder it closes
 * the loop with — even though the construction site of the value is
 * still inside `seedSampleDataForDistrict()` for now.
 */
export interface StudentSpec {
  id: number;
  scenario: Scenario;
  serviceTypeIds: number[];
  caseManagerId: number;
  schoolIndex: number;
}
