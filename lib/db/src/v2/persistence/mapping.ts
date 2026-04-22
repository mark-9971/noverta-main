/**
 * Seed Overhaul V2 — Persistence mapping (W4).
 *
 * The simulator emits events keyed by symbolic refs:
 *   - studentDefIdx   : 0-based index into the StudentDef[] passed in
 *   - serviceIdx      : 0-based slot index into that student's plan
 *   - serviceKey      : "speech" | "ot" | "counseling" | "aba" | "pt"
 *
 * Persistence needs to translate those refs into real DB ids:
 *   - studentId       : students.id
 *   - serviceRequirementId
 *                     : the SR row this service slot maps to
 *   - serviceTypeId   : service_types.id (cached from the SR)
 *   - staffId         : provider for the SR (cached from the SR)
 *
 * This module defines the mapping CONTRACT plus a builder that reads
 * the live DB state for a district. The mapping is pure data — no DB
 * handles inside — so the persistence payload builder can be tested
 * with hand-rolled fixtures.
 *
 * The mapping is NEVER a place to invent rows. If a simulated event
 * cannot be mapped (e.g. simulator emitted a service the legacy seeder
 * didn't insert), the persistence layer drops the event with an
 * `orphanedRefs` counter rather than fabricating a target row. That
 * counter surfaces in `PersistenceCounts` so callers can detect drift
 * between the simulator's plan and the seeded roster.
 */

import { and, asc, eq } from "drizzle-orm";
import type { db as Db } from "../../db";
import {
  studentsTable,
  staffTable,
  serviceRequirementsTable,
  serviceTypesTable,
  schoolsTable,
} from "../../schema";
import type { ServiceKey } from "../simulator";

export interface MappedServiceRequirement {
  serviceIdx: number;
  /**
   * NULL when the service-type name in the DB does not classify into a
   * known ServiceKey. NULL keys never match a simulator event; the
   * event becomes an orphan instead. This is intentional — silently
   * forcing an unknown service onto an arbitrary key would be
   * fabrication-by-misassociation (architect W4 R1 finding).
   */
  serviceKey: ServiceKey | null;
  serviceRequirementId: number;
  serviceTypeId: number;
  /** May be NULL on the SR row; persistence falls back to a default staff. */
  providerStaffId: number | null;
  /** Lifetime weekly minutes encoded by the SR (used as fallback for makeup duration). */
  requiredMinutes: number;
}

export interface MappedStudent {
  studentDefIdx: number;
  studentId: number;
  /** Service slots, ordered by SR.id ASC so determinism matches insert order. */
  services: MappedServiceRequirement[];
}

export interface PersistenceMapping {
  districtId: number;
  schoolYearId: number;
  /** Default staff id used as the responsible writer for synthetic rows
   *  that lack an explicit provider (e.g. handling events). MUST be a
   *  sample-tagged staff member in this district. */
  defaultStaffId: number;
  /** Indexed by studentDefIdx. */
  students: MappedStudent[];
}

/**
 * Common service-name → ServiceKey synonyms used when matching SRs from
 * the legacy seeder back to the simulator's symbolic vocabulary.
 * Values are intentionally permissive — we want a hit even if the
 * legacy seeder named the type "Speech-Language" rather than "speech".
 */
const SERVICE_KEY_SYNONYMS: ReadonlyArray<{ key: ServiceKey; needles: string[] }> = [
  { key: "speech", needles: ["speech", "slp", "language"] },
  { key: "ot", needles: ["occupational", "ot"] },
  { key: "pt", needles: ["physical therapy", "pt"] },
  { key: "counseling", needles: ["counsel", "social work", "social-emotional"] },
  { key: "aba", needles: ["aba", "behavior support", "behavioral"] },
];

export function classifyServiceTypeName(name: string | null | undefined): ServiceKey | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const { key, needles } of SERVICE_KEY_SYNONYMS) {
    if (needles.some((n) => lower.includes(n))) return key;
  }
  return null;
}

/**
 * Build a PersistenceMapping by querying the current DB state for the
 * given district. Reads only sample-tagged students/staff so operator
 * data is never targetable by the persistence layer.
 *
 * Determinism: rows are ordered by id ASC so the mapping is stable
 * across calls as long as the underlying seed run hasn't been changed.
 */
export async function buildPersistenceMapping(
  db: typeof Db,
  districtId: number,
  schoolYearId: number,
): Promise<PersistenceMapping> {
  // Sample-tagged students for this district, ordered by id ASC. The
  // legacy seeder inserts STUDENT_DEFS in order, so studentDefIdx
  // aligns with this ordering on a clean seed.
  const schoolIds = (
    await db.select({ id: schoolsTable.id }).from(schoolsTable)
      .where(eq(schoolsTable.districtId, districtId))
  ).map((r) => r.id);

  const students = schoolIds.length === 0
    ? []
    : await db.select().from(studentsTable)
        .where(and(eq(studentsTable.isSample, true)))
        .orderBy(asc(studentsTable.id));
  const districtStudents = students.filter((s) => s.schoolId !== null && schoolIds.includes(s.schoolId));

  if (districtStudents.length === 0) {
    return { districtId, schoolYearId, defaultStaffId: 0, students: [] };
  }

  const allStaff = await db.select().from(staffTable)
    .where(eq(staffTable.isSample, true))
    .orderBy(asc(staffTable.id));
  const staff = allStaff.filter((s) => s.schoolId !== null && schoolIds.includes(s.schoolId));
  if (staff.length === 0) {
    throw new Error(
      `[v2/persistence] no sample staff for district ${districtId}; run seedSampleDataForDistrict first`,
    );
  }
  const defaultStaffId = staff[0].id;

  const studentIds = districtStudents.map((s) => s.id);
  // Bulk-load SRs for all sample students; group client-side since
  // Drizzle doesn't have a cheap "in (...)" with a tuple bind here.
  const allSrs = await db.select().from(serviceRequirementsTable)
    .orderBy(asc(serviceRequirementsTable.id));
  const srsByStudent = new Map<number, typeof allSrs>();
  for (const sr of allSrs) {
    if (!studentIds.includes(sr.studentId)) continue;
    const list = srsByStudent.get(sr.studentId) ?? [];
    list.push(sr);
    srsByStudent.set(sr.studentId, list);
  }

  const serviceTypes = await db.select().from(serviceTypesTable);
  const stById = new Map(serviceTypes.map((t) => [t.id, t]));

  const mappedStudents: MappedStudent[] = districtStudents.map((s, idx) => {
    const srs = srsByStudent.get(s.id) ?? [];
    const services: MappedServiceRequirement[] = srs.map((sr, sIdx) => {
      const st = stById.get(sr.serviceTypeId);
      const key = classifyServiceTypeName(st?.name);
      return {
        serviceIdx: sIdx,
        // Unclassified service-type names produce a null key. The
        // persistence payload builder will then orphan any simulator
        // event targeting this slot rather than misroute it onto a
        // mismatched real SR (W4 architect R1: no fabrication).
        serviceKey: key,
        serviceRequirementId: sr.id,
        serviceTypeId: sr.serviceTypeId,
        providerStaffId: sr.providerId ?? null,
        requiredMinutes: sr.requiredMinutes,
      };
    });
    return { studentDefIdx: idx, studentId: s.id, services };
  });

  return {
    districtId,
    schoolYearId,
    defaultStaffId,
    students: mappedStudents,
  };
}
