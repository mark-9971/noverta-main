import { db } from "@workspace/db";
import {
  sessionLogsTable,
  serviceRequirementsTable,
  studentsTable,
  schoolsTable,
} from "@workspace/db";
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";

/**
 * Provider logging rate: timely-logged sessions divided by expected sessions
 * over a trailing window. Mirrors the M2 "Service Logging Adoption" metric in
 * routes/reports/pilotHealth.ts so the health-score badge, the persisted
 * snapshot, and the per-school breakdown all use the same definition.
 *
 *   numerator   = session_logs in window whose createdAt is within 48h of the
 *                 session date (i.e. logged on time)
 *   denominator = expected sessions, derived from active service_requirements
 *                 and their interval_type, scaled to the window length
 *
 * Returned rate is clamped to [0, 1]. Returns rate=null when no sessions are
 * expected for the scope/window — callers should treat that as "no signal yet"
 * (we fall back to a perfect score so brand-new districts/schools are not
 * penalised before any mandates exist).
 *
 * Tenant scoping: when both `districtId` and `schoolId` are supplied, the
 * filter is the INTERSECTION (the school must belong to the district). This
 * prevents a caller scoped to district A from passing a school in district B
 * and pulling that district's data.
 */

export interface ProviderLoggingRateScope {
  districtId?: number | null;
  schoolId?: number | null;
}

export interface ProviderLoggingRateInput extends ProviderLoggingRateScope {
  /** Inclusive ISO date (YYYY-MM-DD). Defaults to today. */
  endDate?: string;
  /** Window length in days. Defaults to 30. */
  lookbackDays?: number;
}

export interface ProviderLoggingRateResult {
  rate: number | null;
  expectedSessions: number;
  timelyLogs: number;
  totalLogged: number;
  startDate: string;
  endDate: string;
  lookbackDays: number;
}

function expectedSessionsInWindow(intervalType: string, days: number): number {
  if (intervalType === "weekly") return days / 7;
  if (intervalType === "monthly") return days / 30.44;
  if (intervalType === "quarterly") return days / 91.3;
  return days / 7;
}

function isoDate(d: Date): string {
  return d.toISOString().substring(0, 10);
}

function buildStudentScope(
  districtId: number | null | undefined,
  schoolId: number | null | undefined,
): SQL | null {
  // Both supplied: intersection — student must be in a school that belongs
  // to the requested district AND match the requested school id.
  if (districtId && schoolId) {
    return sql`IN (SELECT s.id FROM ${studentsTable} s JOIN ${schoolsTable} sc ON sc.id = s.school_id WHERE sc.district_id = ${districtId} AND sc.id = ${schoolId})`;
  }
  if (schoolId) {
    return sql`IN (SELECT id FROM ${studentsTable} WHERE school_id = ${schoolId})`;
  }
  if (districtId) {
    return sql`IN (SELECT id FROM ${studentsTable} WHERE school_id IN (SELECT id FROM ${schoolsTable} WHERE district_id = ${districtId}))`;
  }
  return null;
}

export async function computeProviderLoggingRate(
  input: ProviderLoggingRateInput,
): Promise<ProviderLoggingRateResult> {
  const lookbackDays = input.lookbackDays ?? 30;
  const endDate = input.endDate ?? isoDate(new Date());
  const startDate = isoDate(
    new Date(new Date(endDate + "T00:00:00Z").getTime() - lookbackDays * 86400_000),
  );

  const studentScope = buildStudentScope(input.districtId ?? null, input.schoolId ?? null);

  const reqConds: SQL[] = [eq(serviceRequirementsTable.active, true)];
  if (studentScope) {
    reqConds.push(sql`${serviceRequirementsTable.studentId} ${studentScope}`);
  }
  const reqs = await db
    .select({ intervalType: serviceRequirementsTable.intervalType })
    .from(serviceRequirementsTable)
    .where(and(...reqConds));
  const expectedSessions = Math.round(
    reqs.reduce((sum, r) => sum + expectedSessionsInWindow(r.intervalType, lookbackDays), 0),
  );

  const sessConds: SQL[] = [
    gte(sessionLogsTable.sessionDate, startDate),
    lte(sessionLogsTable.sessionDate, endDate),
  ];
  if (studentScope) {
    sessConds.push(sql`${sessionLogsTable.studentId} ${studentScope}`);
  }
  const sessRows = await db
    .select({
      sd: sessionLogsTable.sessionDate,
      ca: sessionLogsTable.createdAt,
    })
    .from(sessionLogsTable)
    .where(and(...sessConds));

  const totalLogged = sessRows.length;
  const timelyLogs = sessRows.filter(
    r => (r.ca.getTime() - new Date(r.sd + "T12:00:00").getTime()) / 3_600_000 <= 48,
  ).length;

  const rate = expectedSessions > 0
    ? Math.max(0, Math.min(1, timelyLogs / expectedSessions))
    : null;

  return { rate, expectedSessions, timelyLogs, totalLogged, startDate, endDate, lookbackDays };
}
