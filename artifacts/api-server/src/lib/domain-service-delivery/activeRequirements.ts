/**
 * Service Requirement v1 — getActiveRequirements helper.
 *
 * Centralizes "what was the student's active service requirement on date X
 * (or across date range Y)?" in one tested, periodized helper. Walks the
 * `supersedes_id` chain so a range that crosses a supersede returns one
 * interval per requirement, each clipped to its effective dates.
 *
 * Contract details: docs/architecture/active-requirements.md.
 *
 * Pure read; no writes; no side effects, except idempotent inserts into
 * `migration_report_service_requirements` with reason
 * `overlapping_chain_uncoupled` when two rows for the same
 * (student_id, service_type_id) overlap in time without a supersede link.
 */
import { db } from "@workspace/db";
import {
  serviceRequirementsTable,
  migrationReportServiceRequirementsTable,
  type ServiceRequirement,
} from "@workspace/db";
import { and, eq, asc } from "drizzle-orm";

export type RequirementIntervalSource = "active" | "superseded";

export interface RequirementInterval {
  requirementId: number;
  serviceTypeId: number;
  startDate: string;
  endDate: string;
  source: RequirementIntervalSource;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface GetActiveRequirementsOpts {
  serviceTypeId?: number;
}

/**
 * Single-date convenience. Returns the requirement that is in effect for
 * the student / service-type on the given date, or null. If multiple
 * requirements are in effect on that date (legacy uncoupled overlap),
 * returns the most recently-started row to give callers a deterministic
 * answer.
 */
export async function getActiveRequirementOnDate(
  studentId: number,
  serviceTypeId: number,
  date: string,
): Promise<ServiceRequirement | null> {
  const intervals = await getActiveRequirements(
    studentId,
    { startDate: date, endDate: date },
    { serviceTypeId },
  );
  if (intervals.length === 0) return null;
  // Prefer 'active' over 'superseded' on a transition day; then latest-started.
  const sorted = [...intervals].sort((a, b) => {
    if (a.source !== b.source) return a.source === "active" ? -1 : 1;
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? 1 : -1;
    return b.requirementId - a.requirementId;
  });
  const winner = sorted[0];
  const [row] = await db
    .select()
    .from(serviceRequirementsTable)
    .where(eq(serviceRequirementsTable.id, winner.requirementId))
    .limit(1);
  return row ?? null;
}

/**
 * Return every requirement interval that overlaps `range` for the given
 * student. Each chain (R1 → R2 → R3 …) is clipped at the successor's
 * `startDate - 1 day` so consecutive intervals never overlap and never
 * produce a fabricated gap. Inactive end-dated rows (no successor) are
 * returned with `source: 'superseded'` and the gap after them is NOT
 * back-filled.
 *
 * Output is sorted by `startDate` ascending, ties broken by
 * `requirementId` ascending so output is deterministic.
 */
export async function getActiveRequirements(
  studentId: number,
  range: DateRange,
  opts: GetActiveRequirementsOpts = {},
): Promise<RequirementInterval[]> {
  if (range.startDate > range.endDate) return [];

  const conditions = [eq(serviceRequirementsTable.studentId, studentId)];
  if (opts.serviceTypeId != null) {
    conditions.push(eq(serviceRequirementsTable.serviceTypeId, opts.serviceTypeId));
  }

  const rows = await db
    .select()
    .from(serviceRequirementsTable)
    .where(and(...conditions))
    .orderBy(asc(serviceRequirementsTable.startDate), asc(serviceRequirementsTable.id));

  if (rows.length === 0) return [];

  // Group by serviceTypeId so each service-type lineage is processed
  // independently. Different service types are independent lineages by
  // definition.
  const byServiceType = new Map<number, ServiceRequirement[]>();
  for (const r of rows) {
    if (!byServiceType.has(r.serviceTypeId)) byServiceType.set(r.serviceTypeId, []);
    byServiceType.get(r.serviceTypeId)!.push(r);
  }

  const out: RequirementInterval[] = [];
  for (const group of byServiceType.values()) {
    const intervals = computeIntervalsForGroup(group, range);
    out.push(...intervals);

    // Data Health: detect rows that overlap in time but are not coupled
    // through `supersedes_id`. Idempotent insert into the migration
    // report.
    await flagOverlappingUncoupled(group);
  }

  out.sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
    return a.requirementId - b.requirementId;
  });
  return out;
}

function computeIntervalsForGroup(
  rows: ServiceRequirement[],
  range: DateRange,
): RequirementInterval[] {
  // Successor map: predecessor.id -> successor row. A row R has a
  // successor S iff S.supersedesId === R.id AND S.replacedAt is set
  // (legacy data with replacedAt=null is treated as a hard end, NOT as
  // a supersede — see docs).
  const successorByPredId = new Map<number, ServiceRequirement>();
  for (const r of rows) {
    if (r.supersedesId != null && r.replacedAt != null) {
      const existing = successorByPredId.get(r.supersedesId);
      // Deterministic tie-break if multiple rows claim the same
      // predecessor: prefer the earliest-starting / lowest-id successor
      // so output is stable.
      if (
        !existing ||
        r.startDate < existing.startDate ||
        (r.startDate === existing.startDate && r.id < existing.id)
      ) {
        successorByPredId.set(r.supersedesId, r);
      }
    }
  }

  const result: RequirementInterval[] = [];
  for (const r of rows) {
    const successor = successorByPredId.get(r.id);

    // Effective end of this row.
    //   - If a successor exists: row ends the day before successor starts
    //     (clipped further by row.endDate if that's earlier).
    //   - Else: row.endDate, or open-ended (use range.endDate as the cap).
    let effectiveEnd: string;
    if (successor) {
      const beforeSuccessor = addDays(successor.startDate, -1);
      effectiveEnd = r.endDate && r.endDate < beforeSuccessor ? r.endDate : beforeSuccessor;
    } else {
      effectiveEnd = r.endDate ?? range.endDate;
    }

    const effectiveStart = r.startDate;
    if (effectiveEnd < effectiveStart) continue; // degenerate (e.g. successor starts before predecessor)

    // Clip to query range.
    const clippedStart = effectiveStart > range.startDate ? effectiveStart : range.startDate;
    const clippedEnd = effectiveEnd < range.endDate ? effectiveEnd : range.endDate;
    if (clippedStart > clippedEnd) continue; // out of range

    // Source: 'active' iff this is the live tail of the chain (no
    // successor AND active=true). Anything else (was superseded, OR
    // ended without a successor) is 'superseded'.
    const source: RequirementIntervalSource =
      !successor && r.active ? "active" : "superseded";

    result.push({
      requirementId: r.id,
      serviceTypeId: r.serviceTypeId,
      startDate: clippedStart,
      endDate: clippedEnd,
      source,
    });
  }
  return result;
}

/**
 * Idempotent flag for rows in the same (student, service_type) group
 * whose effective intervals overlap but are not coupled through
 * supersedes_id. The helper still returns both intervals — the caller
 * decides what to do — but a row is written so /data-health can surface
 * the conflict for an admin.
 *
 * "Effective interval" here uses the row's own startDate/endDate (NOT
 * the chain-clipped one) because we want to detect the un-coupled
 * overlap as recorded in the data, not the silent fix the helper applies
 * downstream.
 */
async function flagOverlappingUncoupled(rows: ServiceRequirement[]): Promise<void> {
  if (rows.length < 2) return;

  // Build the "is coupled" set: a pair (a,b) is coupled if either is
  // recorded as superseding the other (regardless of replacedAt — the
  // declarative link is enough to consider them coupled for the purpose
  // of overlap detection).
  const coupled = new Set<string>();
  for (const r of rows) {
    if (r.supersedesId != null) {
      coupled.add(pairKey(r.id, r.supersedesId));
    }
  }

  const flagged = new Set<number>();
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (coupled.has(pairKey(a.id, b.id))) continue;
      const aEnd = a.endDate ?? "9999-12-31";
      const bEnd = b.endDate ?? "9999-12-31";
      // Inclusive overlap.
      if (a.startDate <= bEnd && b.startDate <= aEnd) {
        flagged.add(a.id);
        flagged.add(b.id);
      }
    }
  }

  if (flagged.size === 0) return;

  for (const reqId of flagged) {
    // Idempotent: skip if a row already exists for this (requirement,
    // reason). Schema has no unique constraint on (requirement_id,
    // reason), so we check first.
    const existing = await db
      .select({ id: migrationReportServiceRequirementsTable.id })
      .from(migrationReportServiceRequirementsTable)
      .where(
        and(
          eq(migrationReportServiceRequirementsTable.requirementId, reqId),
          eq(migrationReportServiceRequirementsTable.reason, "overlapping_chain_uncoupled"),
        ),
      )
      .limit(1);
    if (existing.length > 0) continue;
    try {
      await db.insert(migrationReportServiceRequirementsTable).values({
        requirementId: reqId,
        reason: "overlapping_chain_uncoupled",
        detailsJson: { detectedBy: "getActiveRequirements" },
      });
    } catch (err) {
      // Treat duplicate-key races as benign (concurrent caller already
      // inserted the same row). Re-surface anything else as a warning so we
      // do not silently swallow real DB errors.
      const code = (err as { code?: string } | null)?.code;
      if (code === "23505") {
        continue;
      }
      console.warn(
        "[activeRequirements] failed to write migration_report row",
        { requirementId: reqId, err },
      );
    }
  }
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().substring(0, 10);
}
