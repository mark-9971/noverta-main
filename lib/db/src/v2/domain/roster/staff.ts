/**
 * Seed Overhaul V2 — Domain / Roster / Staff seeds.
 *
 * Extracted from `seed-sample-data.ts` (W2). The named-staff pool, the
 * per-profile composition table, the MA-SPED student-to-staff ratios, and
 * the pure `buildStaffSeeds()` builder all live here. The DB insert that
 * turns these seeds into `staff` rows still lives inside
 * `seedSampleDataForDistrict()` because it interleaves with district /
 * school setup and emits IDs that the rest of the seeder consumes — that
 * orchestration moves in W3.
 *
 * Behavior is byte-identical to the inline definitions before W2:
 *   - same SAMPLE_STAFF_POOL ordering (so canonical names land on the
 *     same primary specialists)
 *   - same per-slot scaling rule (max of profile baseline, ratio-derived,
 *     load-aware floor)
 *   - same synthesized-name / unique-email scheme for over-baseline slots
 *
 * Pure imports only (reference catalogs, RNG-free helpers, capacity
 * clamp). The function takes RNG/shape input via parameters so it stays
 * trivially unit-testable.
 */

import { loadAwareFloor } from "../../platform/capacity";
import {
  type SizeProfile,
  FIRST_NAMES,
  LAST_NAMES,
  SAMPLE_BOUNDS,
} from "../reference";

export interface SampleStaffSeed {
  firstName: string;
  lastName: string;
  role: string;
  title: string;
  qualifications: string;
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
export const SAMPLE_STAFF_POOL: SampleStaffSeed[] = [
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
export const STAFF_BY_PROFILE: Record<
  Exclude<SizeProfile, "random">,
  Array<{ role: string; titleIncludes?: string; count: number }>
> = {
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
export const STAFF_RATIOS: Record<string, number> = {
  "case_manager":              22,   // MA SPED guideline: 15–22 students per CM
  "bcba":                      80,
  "provider:Speech":           75,
  "provider:Occupational":     80,
  "provider:Physical":        250,
  "provider:Counselor":       150,
  "provider:Paraprofessional": 60,
  "admin":                    250,
};

/**
 * Subset of `SeedShape` that `buildStaffSeeds` actually reads. The full
 * `SeedShape` is defined in `../shape` and extends this — we accept the
 * narrower structural type here so the staff builder doesn't transitively
 * pull in scenario weight types it doesn't use.
 */
export interface StaffShapeInput {
  reqMinutesMonthlyRange: readonly [number, number];
  staffRatioMultiplier: number;
  staffOverrides: {
    caseManager?: number;
    bcba?: number;
    provider?: number;
    paraprofessional?: number;
  };
}

export function buildStaffSeeds(
  profile: Exclude<SizeProfile, "random">,
  targetStudents?: number,
  shape?: StaffShapeInput,
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

    // PRE-1 — per-specialty load-aware floor (math lives in
    // platform/capacity.ts as loadAwareFloor()). Returns null when
    // the specialty has no SPECIALTY_LOAD_SHARE entry (no clamp applies).
    if (targetStudents && targetStudents > 0) {
      const reqRange = shape?.reqMinutesMonthlyRange ?? SAMPLE_BOUNDS.requiredMinutes;
      const floor = loadAwareFloor(ratioKey, targetStudents, reqRange);
      if (floor != null) scaledCount = Math.max(scaledCount, floor);
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
