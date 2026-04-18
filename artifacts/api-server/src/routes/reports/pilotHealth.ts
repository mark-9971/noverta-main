import { Router, type IRouter, type Request } from "express";
import { db } from "@workspace/db";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";
import {
  studentsTable, sessionLogsTable, iepDocumentsTable,
  alertsTable, staffTable, restraintIncidentsTable,
  serviceRequirementsTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, count, isNull } from "drizzle-orm";
import { requireRoles } from "../../middlewares/auth";

const router: IRouter = Router();

function trendDir(
  current: number,
  prev: number | null,
  lowerIsBetter = false,
): "up" | "down" | "flat" | null {
  if (prev === null) return null;
  const d = current - prev;
  if (Math.abs(d) < 1) return "flat";
  if (lowerIsBetter) return d < 0 ? "up" : "down";
  return d > 0 ? "up" : "down";
}

function expectedSessionsInWindow(intervalType: string, daysDiff: number): number {
  if (intervalType === "weekly") return daysDiff / 7;
  if (intervalType === "monthly") return daysDiff / 30.44;
  if (intervalType === "quarterly") return daysDiff / 91.3;
  return daysDiff / 7;
}

router.get("/reports/pilot-health", requireRoles("admin"), async (req: Request, res): Promise<void> => {
  try {
    const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const d30 = new Date(now.getTime() - 30 * 86400_000).toISOString().split("T")[0];
    const d60 = new Date(now.getTime() - 60 * 86400_000).toISOString().split("T")[0];
    const d90 = new Date(now.getTime() - 90 * 86400_000);
    const d180 = new Date(now.getTime() - 180 * 86400_000);

    // When districtId is null the caller is a super-admin; all-district reads are intentional.
    const districtStudentSubquery = districtId !== null
      ? sql`IN (SELECT s.id FROM students s JOIN schools sc ON s.school_id = sc.id WHERE sc.district_id = ${districtId})`
      : sql`IS NOT NULL`;
    const districtSchoolSubquery = districtId !== null
      ? sql`IN (SELECT id FROM schools WHERE district_id = ${districtId})`
      : sql`IS NOT NULL`;

    // ── M1: IEP Roster Coverage (proxy mode) ─────────────────────────────
    // Active students with an active IEP doc / all active students.
    // The official district IEP count is external and not stored in Trellis;
    // active students serve as a proxy. Exposed as "proxyMode: true" in detail.
    const studConds: ReturnType<typeof eq>[] = [eq(studentsTable.status, "active") as ReturnType<typeof eq>];
    if (districtId !== null) studConds.push(sql`${studentsTable.schoolId} ${districtSchoolSubquery}` as ReturnType<typeof eq>);
    const [totStud] = await db.select({ n: count() }).from(studentsTable).where(and(...studConds));

    const iepConds: ReturnType<typeof eq>[] = [
      eq(studentsTable.status, "active") as ReturnType<typeof eq>,
      sql`${studentsTable.id} IN (SELECT student_id FROM iep_documents WHERE active = true)` as ReturnType<typeof eq>,
    ];
    if (districtId !== null) iepConds.push(sql`${studentsTable.schoolId} ${districtSchoolSubquery}` as ReturnType<typeof eq>);
    const [withIep] = await db.select({ n: count() }).from(studentsTable).where(and(...iepConds));

    const totalStudents = totStud?.n ?? 0;
    const studentsWithIep = withIep?.n ?? 0;
    const m1Val = totalStudents > 0 ? Math.round((studentsWithIep / totalStudents) * 100) : 100;

    // ── M2: Service Logging Adoption ──────────────────────────────────────
    // "At least 80% of scheduled service sessions logged within 48 hours."
    // Denominator: expected sessions from active service requirements in the period.
    // Numerator: session_log rows created within 48h of their session date.
    async function loggingAdoption(from: string, to: string) {
      const daysDiff = (new Date(to).getTime() - new Date(from).getTime()) / 86400_000;

      // Expected sessions from mandates
      const reqConds: ReturnType<typeof eq>[] = [eq(serviceRequirementsTable.active, true) as ReturnType<typeof eq>];
      if (districtId !== null) reqConds.push(sql`${serviceRequirementsTable.studentId} ${districtStudentSubquery}` as ReturnType<typeof eq>);
      const reqs = await db.select({ intervalType: serviceRequirementsTable.intervalType })
        .from(serviceRequirementsTable).where(and(...reqConds));
      const expectedSessions = Math.round(reqs.reduce((sum, r) => sum + expectedSessionsInWindow(r.intervalType, daysDiff), 0));

      // Timely logs in the window
      const sessConds: ReturnType<typeof eq>[] = [
        gte(sessionLogsTable.sessionDate, from) as ReturnType<typeof eq>,
        lte(sessionLogsTable.sessionDate, to) as ReturnType<typeof eq>,
      ];
      if (districtId !== null) sessConds.push(sql`${sessionLogsTable.studentId} ${districtStudentSubquery}` as ReturnType<typeof eq>);
      const rows = await db.select({ sd: sessionLogsTable.sessionDate, ca: sessionLogsTable.createdAt })
        .from(sessionLogsTable).where(and(...sessConds));

      const timelyLogs = rows.filter(r => (r.ca.getTime() - new Date(r.sd + "T12:00:00").getTime()) / 3_600_000 <= 48).length;

      return {
        pct: expectedSessions > 0 ? Math.round((timelyLogs / expectedSessions) * 100) : 0,
        timelyLogs,
        totalLogged: rows.length,
        expectedSessions,
      };
    }
    const m2cur = await loggingAdoption(d30, today);
    const m2prv = await loggingAdoption(d60, d30);

    // ── M3: Incident Reporting Timeliness ─────────────────────────────────
    // % of restraint / seclusion incidents logged within 24h of the incident date.
    async function incidentTimeliness(from: string, to: string) {
      const incConds: ReturnType<typeof eq>[] = [
        gte(restraintIncidentsTable.incidentDate, from) as ReturnType<typeof eq>,
        lte(restraintIncidentsTable.incidentDate, to) as ReturnType<typeof eq>,
      ];
      if (districtId !== null) incConds.push(sql`${restraintIncidentsTable.studentId} ${districtStudentSubquery}` as ReturnType<typeof eq>);
      const rows = await db.select({ id: restraintIncidentsTable.incidentDate, ca: restraintIncidentsTable.createdAt })
        .from(restraintIncidentsTable).where(and(...incConds));
      const n = rows.length;
      const ok = rows.filter(r => (r.ca.getTime() - new Date(r.id + "T00:00:00").getTime()) / 3_600_000 <= 24).length;
      return { pct: n > 0 ? Math.round((ok / n) * 100) : 100, n, ok };
    }
    const m3cur = await incidentTimeliness(d30, today);
    const m3prv = await incidentTimeliness(d60, d30);

    // ── M4: Annual Review Visibility ──────────────────────────────────────
    // "Zero IEPs expire without a 30-day advance alert being visible and acknowledged."
    // An overdue IEP is "acknowledged" if a RESOLVED alert exists for that student
    // created in the 30-day window leading up to the IEP's expiration date.
    async function overdueUnalerted(cutoffDate: string): Promise<{ unacknowledged: number; total: number }> {
      const iepConds: ReturnType<typeof eq>[] = [
        eq(iepDocumentsTable.active, true) as ReturnType<typeof eq>,
        sql`${iepDocumentsTable.iepEndDate} < ${cutoffDate}` as ReturnType<typeof eq>,
      ];
      if (districtId !== null) iepConds.push(sql`${iepDocumentsTable.studentId} ${districtStudentSubquery}` as ReturnType<typeof eq>);

      const overdueRows = await db.select({
        studentId: iepDocumentsTable.studentId,
        iepEndDate: iepDocumentsTable.iepEndDate,
      }).from(iepDocumentsTable).where(and(...iepConds));

      const earliest = new Map<number, string>();
      for (const r of overdueRows) {
        const cur = earliest.get(r.studentId);
        if (!cur || r.iepEndDate < cur) earliest.set(r.studentId, r.iepEndDate);
      }
      if (earliest.size === 0) return { unacknowledged: 0, total: 0 };

      // A resolved alert created in [endDate-30d, endDate] = acknowledged advance notice
      const alertedSet = new Set<number>();
      for (const [studentId, endDate] of earliest) {
        const windowStart = new Date(new Date(endDate + "T00:00:00").getTime() - 30 * 86400_000).toISOString();
        const windowEnd = new Date(endDate + "T23:59:59").toISOString();
        const hit = await db.select({ id: alertsTable.id }).from(alertsTable)
          .where(and(
            eq(alertsTable.studentId, studentId),
            eq(alertsTable.resolved, true),
            sql`${alertsTable.createdAt} >= ${windowStart}`,
            sql`${alertsTable.createdAt} <= ${windowEnd}`,
          ))
          .limit(1);
        if (hit.length > 0) alertedSet.add(studentId);
      }
      return { unacknowledged: earliest.size - alertedSet.size, total: earliest.size };
    }
    const m4cur = await overdueUnalerted(today);
    const m4prv = await overdueUnalerted(d30);

    // ── M5: Staff Engagement ──────────────────────────────────────────────
    // "Every case manager and coordinator logs in at least 3 times per week,
    // averaged over the 90-day pilot." Session log submissions used as proxy.
    const PILOT_WEEKS = 13;
    const MIN_AVG = 3;

    const staffConds: ReturnType<typeof eq>[] = [
      eq(staffTable.status, "active") as ReturnType<typeof eq>,
      sql`${staffTable.role} IN ('case_manager', 'coordinator')` as ReturnType<typeof eq>,
      isNull(staffTable.deletedAt) as ReturnType<typeof eq>,
    ];
    if (districtId !== null) staffConds.push(sql`${staffTable.schoolId} ${districtSchoolSubquery}` as ReturnType<typeof eq>);
    const staffRows = await db.select({ id: staffTable.id }).from(staffTable).where(and(...staffConds));
    const totalStaff = staffRows.length;

    let m5engaged = 0;
    let m5prvEngaged = 0;

    if (totalStaff > 0) {
      const ids = staffRows.map(s => s.id);
      async function engagedCount(fromDate: Date, toDate: Date): Promise<number> {
        const from = fromDate.toISOString().split("T")[0];
        const to = toDate.toISOString().split("T")[0];
        const rows = await db.select({ staffId: sessionLogsTable.staffId, n: count() })
          .from(sessionLogsTable)
          .where(and(
            gte(sessionLogsTable.sessionDate, from) as ReturnType<typeof eq>,
            lte(sessionLogsTable.sessionDate, to) as ReturnType<typeof eq>,
            sql`${sessionLogsTable.staffId} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})` as ReturnType<typeof eq>,
          ))
          .groupBy(sessionLogsTable.staffId);
        const byStaff = new Map(rows.map(r => [r.staffId, r.n]));
        return ids.filter(id => (byStaff.get(id) ?? 0) / PILOT_WEEKS >= MIN_AVG).length;
      }
      m5engaged = await engagedCount(d90, now);
      m5prvEngaged = await engagedCount(d180, d90);
    }

    const m5cur = totalStaff > 0 ? Math.round((m5engaged / totalStaff) * 100) : 0;
    const m5prv = totalStaff > 0 ? Math.round((m5prvEngaged / totalStaff) * 100) : null;

    res.json({
      generatedAt: now.toISOString(),
      metrics: {
        iepRosterCoverage: {
          label: "IEP Roster Coverage",
          description: "Active students with an IEP entered in Trellis vs all active students. (Proxy mode: official district IEP count is external and not stored in Trellis.)",
          value: m1Val,
          previousValue: null,
          trend: null,
          unit: "percent",
          target: 100,
          detail: { studentsWithIep, totalStudents, proxyMode: true },
          onTrack: m1Val >= 98,
        },
        serviceLoggingAdoption: {
          label: "Service Logging Adoption",
          description: "Sessions logged within 48 hours of the session date vs expected sessions from active service mandates (last 30 days vs prior 30 days).",
          value: m2cur.pct,
          previousValue: m2prv.expectedSessions > 0 ? m2prv.pct : null,
          trend: trendDir(m2cur.pct, m2prv.expectedSessions > 0 ? m2prv.pct : null),
          unit: "percent",
          target: 80,
          detail: { timelyLogs: m2cur.timelyLogs, totalLogged: m2cur.totalLogged, expectedSessions: m2cur.expectedSessions, previousTimelyLogs: m2prv.timelyLogs, previousExpectedSessions: m2prv.expectedSessions },
          onTrack: m2cur.pct >= 80,
        },
        incidentReportingTimeliness: {
          label: "Incident Reporting Timeliness",
          description: "Physical restraint / seclusion incidents logged within 24 hours of the incident date (last 30 days vs prior 30 days).",
          value: m3cur.pct,
          previousValue: m3prv.n > 0 ? m3prv.pct : null,
          trend: trendDir(m3cur.pct, m3prv.n > 0 ? m3prv.pct : null),
          unit: "percent",
          target: 100,
          detail: { timelyIncidents: m3cur.ok, totalIncidents: m3cur.n, previousTimelyIncidents: m3prv.ok, previousTotalIncidents: m3prv.n },
          onTrack: m3cur.n === 0 || m3cur.pct >= 100,
        },
        annualReviewVisibility: {
          label: "Annual Review Visibility",
          description: "Overdue IEPs where no resolved (acknowledged) alert was created in the 30-day advance window before expiration, indicating the case manager was not notified and confirmed in time.",
          value: m4cur.unacknowledged,
          previousValue: m4prv.total > 0 ? m4prv.unacknowledged : null,
          trend: trendDir(m4cur.unacknowledged, m4prv.total > 0 ? m4prv.unacknowledged : null, true),
          unit: "count",
          target: 0,
          detail: { overdueIeps: m4cur.total, unacknowledgedOverdue: m4cur.unacknowledged, previousOverdueIeps: m4prv.total, previousUnacknowledged: m4prv.unacknowledged },
          onTrack: m4cur.unacknowledged === 0,
        },
        staffEngagement: {
          label: "Staff Engagement",
          description: `Case managers & coordinators averaging ≥${MIN_AVG} session log submissions per week over the 90-day pilot window (proxy for logins; no login_events table).`,
          value: m5cur,
          previousValue: m5prv,
          trend: trendDir(m5cur, m5prv),
          unit: "percent",
          target: 80,
          detail: { engagedStaff: m5engaged, totalActiveStaff: totalStaff, minWeeklyAvg: MIN_AVG, pilotWeeks: PILOT_WEEKS, previousEngagedStaff: m5prvEngaged },
          onTrack: m5cur >= 80,
        },
      },
    });
  } catch (err) {
    console.error("GET /reports/pilot-health error:", err);
    res.status(500).json({ error: "Failed to generate pilot health report" });
  }
});

export default router;
