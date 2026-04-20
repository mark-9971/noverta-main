/**
 * Demo Control Center — backend endpoints.
 *
 * All endpoints are platform-admin only. Every endpoint that takes a
 * districtId verifies that the district has is_demo=true before doing any
 * work. Mutations are scoped to that one district's student population so
 * the panels can never affect another tenant — even another demo district.
 *
 * Powers the 13-panel Demo Control Center UI:
 *   1. Pilot readiness   — reuses /api/support/demo-readiness on the client.
 *   2. Demo flow         — pure client-side navigation.
 *   3. Hero cast         — POST /demo-control/hero-cast (6 archetypes, idempotent)
 *   4. Before/after one  — POST /demo-control/before-after (input-driven calc + HTML)
 *   5. Comp exposure sim — GET  /demo-control/comp-forecast (read-only what-if)
 *   6. Caseload sim      — reuses /api/caseload-balancing/* on the client.
 *   7. Import preview    — POST /demo-control/import-preview
 *   8. Exec packet       — GET  /demo-control/exec-packet
 *   9. Walkthrough       — pure client-side role swap (dev only).
 *  10. Realism check     — reuses /api/data-health on the client.
 *  11. Alert tuner       — POST /demo-control/alert-density (district-scoped)
 *  12. Env reset         — POST /demo-control/reset-district (single demo district)
 *  13. Highlight mode    — pure client-side overlay.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { sql, eq, and, inArray, asc } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { requirePlatformAdmin } from "../middlewares/auth";
import {
  db,
  districtsTable,
  schoolsTable,
  studentsTable,
  staffTable,
  alertsTable,
  compensatoryObligationsTable,
  pilotBaselineSnapshotsTable,
  seedSampleDataForDistrict,
  teardownSampleData,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { computePilotBaselineMetrics } from "../lib/pilotBaselineSnapshots";

const router: IRouter = Router();

// Path-scoped: requirePlatformAdmin only runs for /demo-control/* requests so
// this subrouter can be safely mounted at the API root without affecting any
// unrelated routes.
router.use("/demo-control", requirePlatformAdmin);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DemoDistrict {
  id: number;
  name: string;
  isDemo: boolean;
}

/**
 * Resolve and verify the target demo district. ALWAYS requires an explicit
 * districtId — no fallback to "first demo district." This matches the
 * Demo Control Center contract that all actions are scoped to the user's
 * currently selected demo district. If districtId is missing, returns 400.
 */
async function requireDemoDistrict(
  rawId: unknown,
): Promise<{ ok: true; district: DemoDistrict } | { ok: false; status: number; error: string }> {
  const id = typeof rawId === "number" ? rawId
    : typeof rawId === "string" && /^\d+$/.test(rawId) ? Number(rawId)
    : null;
  if (id == null) {
    return { ok: false, status: 400, error: "districtId is required and must reference a demo district" };
  }
  const [row] = await db
    .select({ id: districtsTable.id, name: districtsTable.name, isDemo: districtsTable.isDemo })
    .from(districtsTable)
    .where(eq(districtsTable.id, id))
    .limit(1);
  if (!row) return { ok: false, status: 404, error: "District not found" };
  if (!row.isDemo) {
    return {
      ok: false,
      status: 403,
      error: "Demo Control Center can only target demo districts (is_demo=true).",
    };
  }
  return { ok: true, district: { id: row.id, name: row.name, isDemo: true } };
}

async function loadSchoolIds(districtId: number): Promise<number[]> {
  const rows = await db
    .select({ id: schoolsTable.id })
    .from(schoolsTable)
    .where(eq(schoolsTable.districtId, districtId));
  return rows.map(r => r.id);
}

async function loadStudentIds(districtId: number): Promise<number[]> {
  const schoolIds = await loadSchoolIds(districtId);
  if (schoolIds.length === 0) return [];
  const rows = (await db.execute<{ id: number }>(sql`
    SELECT id FROM students WHERE school_id = ANY(${schoolIds}) AND deleted_at IS NULL
  `)).rows;
  return rows.map(r => r.id);
}

const DEMO_TAG = "[demo-control]";
const CAST_TAG = "[demo-cast]";

// ---------------------------------------------------------------------------
// GET /demo-control/overview — read-only quick stats per demo district.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// GET /demo-control/readiness?districtId=
// District-scoped readiness checks (replaces /support/demo-readiness which
// always selects the first demo district). Returns pass/fail rows that the
// frontend renders as a checklist.
// ---------------------------------------------------------------------------
router.get("/demo-control/readiness", async (req: Request, res: Response) => {
  const r = await requireDemoDistrict(req.query.districtId);
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
  try {
    const schoolIds = await loadSchoolIds(r.district.id);
    const [counts] = (await db.execute<{
      schools: number; students: number; staff: number; alerts: number;
      open_alerts: number; comp_open: number; sessions_30d: number;
    }>(sql`
      SELECT
        ${schoolIds.length}::int AS schools,
        (SELECT COUNT(*)::int FROM students WHERE school_id = ANY(${schoolIds}) AND deleted_at IS NULL) AS students,
        (SELECT COUNT(DISTINCT staff_id)::int FROM staff_school_assignments WHERE school_id = ANY(${schoolIds})) AS staff,
        (SELECT COUNT(*)::int FROM alerts WHERE student_id IN
           (SELECT id FROM students WHERE school_id = ANY(${schoolIds}))) AS alerts,
        (SELECT COUNT(*)::int FROM alerts WHERE resolved = false AND student_id IN
           (SELECT id FROM students WHERE school_id = ANY(${schoolIds}))) AS open_alerts,
        (SELECT COUNT(*)::int FROM compensatory_obligations WHERE status IN ('pending','in_progress') AND student_id IN
           (SELECT id FROM students WHERE school_id = ANY(${schoolIds}))) AS comp_open,
        (SELECT COUNT(*)::int FROM service_sessions WHERE created_at > NOW() - INTERVAL '30 days' AND student_id IN
           (SELECT id FROM students WHERE school_id = ANY(${schoolIds}))) AS sessions_30d
    `)).rows as Array<Record<string, number>>;
    const checks = [
      { key: "schools",   label: "Has schools",            pass: counts.schools >= 1,  detail: `${counts.schools} school(s)` },
      { key: "students",  label: "Has active students",    pass: counts.students >= 25, detail: `${counts.students} student(s)` },
      { key: "staff",     label: "Has staff assigned",     pass: counts.staff >= 5,    detail: `${counts.staff} staff` },
      { key: "alerts",    label: "Has alert history",      pass: counts.alerts >= 10,   detail: `${counts.alerts} alert(s)` },
      { key: "openAlerts",label: "Has live open alerts",   pass: counts.open_alerts >= 1, detail: `${counts.open_alerts} open` },
      { key: "comp",      label: "Has compensatory cases", pass: counts.comp_open >= 1, detail: `${counts.comp_open} open obligation(s)` },
      { key: "sessions",  label: "Recent session activity", pass: counts.sessions_30d >= 5, detail: `${counts.sessions_30d} in last 30d` },
    ];
    const passing = checks.filter(c => c.pass).length;
    res.json({
      ok: true, districtId: r.district.id, districtName: r.district.name,
      checks, passing, total: checks.length,
      status: passing === checks.length ? "pass" : passing >= Math.ceil(checks.length * 0.7) ? "warn" : "fail",
    });
  } catch (err) {
    logger.error({ err }, "demo-control readiness failed");
    res.status(500).json({ error: "Failed to compute readiness" });
  }
});

// ---------------------------------------------------------------------------
// GET /demo-control/data-health?districtId=
// District-scoped realism/data-health checks. Mirrors what /api/data-health
// would surface but is keyed off the demo district selection rather than the
// caller's own enforced tenant scope.
// ---------------------------------------------------------------------------
router.get("/demo-control/data-health", async (req: Request, res: Response) => {
  const r = await requireDemoDistrict(req.query.districtId);
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
  try {
    const schoolIds = await loadSchoolIds(r.district.id);
    const [row] = (await db.execute<{
      orphans: number; future_dob: number; missing_grade: number;
      duplicate_alerts: number; comp_neg: number; staff_no_email: number;
    }>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM students s WHERE s.school_id = ANY(${schoolIds})
           AND NOT EXISTS (SELECT 1 FROM schools sc WHERE sc.id = s.school_id)) AS orphans,
        (SELECT COUNT(*)::int FROM students WHERE school_id = ANY(${schoolIds})
           AND date_of_birth > CURRENT_DATE) AS future_dob,
        (SELECT COUNT(*)::int FROM students WHERE school_id = ANY(${schoolIds})
           AND (grade IS NULL OR grade = '')) AS missing_grade,
        (SELECT COUNT(*)::int FROM (
           SELECT student_id, type, COUNT(*) c FROM alerts
           WHERE resolved = false AND student_id IN
             (SELECT id FROM students WHERE school_id = ANY(${schoolIds}))
           GROUP BY student_id, type HAVING COUNT(*) > 5
         ) d) AS duplicate_alerts,
        (SELECT COUNT(*)::int FROM compensatory_obligations
           WHERE student_id IN (SELECT id FROM students WHERE school_id = ANY(${schoolIds}))
           AND minutes_owed < 0) AS comp_neg,
        (SELECT COUNT(DISTINCT staff_id)::int FROM staff_school_assignments ssa
           JOIN staff st ON st.id = ssa.staff_id
           WHERE ssa.school_id = ANY(${schoolIds}) AND (st.email IS NULL OR st.email = '')) AS staff_no_email
    `)).rows as Array<Record<string, number>>;
    const checks = [
      { name: "No orphan students",        status: row.orphans === 0 ? "pass" : "fail", message: `${row.orphans} orphans` },
      { name: "No future birth dates",     status: row.future_dob === 0 ? "pass" : "fail", message: `${row.future_dob} future DOBs` },
      { name: "All students have a grade", status: row.missing_grade === 0 ? "pass" : "warn", message: `${row.missing_grade} missing grade` },
      { name: "No duplicate-alert spam",   status: row.duplicate_alerts === 0 ? "pass" : "warn", message: `${row.duplicate_alerts} students w/ >5 same-type alerts` },
      { name: "No negative comp minutes",  status: row.comp_neg === 0 ? "pass" : "fail", message: `${row.comp_neg} obligations` },
      { name: "Staff have email",          status: row.staff_no_email === 0 ? "pass" : "warn", message: `${row.staff_no_email} staff w/o email` },
    ];
    res.json({ ok: true, districtId: r.district.id, districtName: r.district.name, checks });
  } catch (err) {
    logger.error({ err }, "demo-control data-health failed");
    res.status(500).json({ error: "Failed to compute data-health" });
  }
});

// ---------------------------------------------------------------------------
// GET /demo-control/caseload-summary?districtId=
// Demo-scoped caseload summary (balanced / over / under) for platform admins
// who don't have a tenant district scope of their own.
// ---------------------------------------------------------------------------
router.get("/demo-control/caseload-summary", async (req: Request, res: Response) => {
  const r = await requireDemoDistrict(req.query.districtId);
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
  // Variance threshold: ±N% of avg is "balanced". Default 25%.
  const variancePct = Math.max(5, Math.min(75, Number(req.query.variancePct) || 25));
  try {
    const schoolIds = await loadSchoolIds(r.district.id);
    const rows = (await db.execute<{
      staff_id: number; n: number; first_name: string; last_name: string;
    }>(sql`
      SELECT s.staff_id::int, COUNT(*)::int AS n,
             COALESCE(st.first_name, '') AS first_name,
             COALESCE(st.last_name,  '') AS last_name
      FROM students s
      LEFT JOIN staff st ON st.id = s.staff_id
      WHERE s.school_id = ANY(${schoolIds}) AND s.deleted_at IS NULL AND s.staff_id IS NOT NULL
      GROUP BY s.staff_id, st.first_name, st.last_name
    `)).rows;
    const counts = rows.map(x => Number(x.n));
    const total = counts.reduce((a, b) => a + b, 0);
    const staffN = counts.length;
    const avg = staffN > 0 ? total / staffN : 0;
    const high = avg * (1 + variancePct / 100);
    const low = avg * (1 - variancePct / 100);
    const over = counts.filter(c => c > high).length;
    const under = counts.filter(c => c < low).length;
    const balanced = staffN - over - under;
    const topOver = rows
      .filter(x => Number(x.n) > high)
      .sort((a, b) => Number(b.n) - Number(a.n))
      .slice(0, 5)
      .map(x => ({
        name: `${x.first_name} ${x.last_name}`.trim() || `Staff #${x.staff_id}`,
        caseload: Number(x.n),
        deltaFromAvg: Math.round((Number(x.n) - avg) * 10) / 10,
      }));
    res.json({
      ok: true, districtId: r.district.id, districtName: r.district.name,
      variancePct,
      totals: { staff: staffN, balanced, over, under },
      avgCaseload: Math.round(avg * 10) / 10,
      topOverloaded: topOver,
    });
  } catch (err) {
    logger.error({ err }, "demo-control caseload-summary failed");
    res.status(500).json({ error: "Failed to compute caseload summary" });
  }
});

router.get("/demo-control/overview", async (_req: Request, res: Response) => {
  try {
    const demos = await db
      .select({ id: districtsTable.id, name: districtsTable.name })
      .from(districtsTable)
      .where(eq(districtsTable.isDemo, true))
      .orderBy(asc(districtsTable.id));
    const out = await Promise.all(demos.map(async (d) => {
      const schoolIds = await loadSchoolIds(d.id);
      if (schoolIds.length === 0) {
        return { id: d.id, name: d.name, schools: 0, students: 0, staff: 0, openAlerts: 0 };
      }
      const [{ n: students }] = (await db.execute<{ n: number }>(sql`
        SELECT COUNT(*)::int AS n FROM students
        WHERE school_id = ANY(${schoolIds}) AND deleted_at IS NULL
      `)).rows as Array<{ n: number }>;
      const [{ n: staff }] = (await db.execute<{ n: number }>(sql`
        SELECT COUNT(*)::int AS n FROM staff
        WHERE school_id = ANY(${schoolIds}) AND deleted_at IS NULL
      `)).rows as Array<{ n: number }>;
      const [{ n: openAlerts }] = (await db.execute<{ n: number }>(sql`
        SELECT COUNT(*)::int AS n FROM alerts a
        WHERE a.resolved = false
          AND a.student_id IN (
            SELECT id FROM students WHERE school_id = ANY(${schoolIds}) AND deleted_at IS NULL
          )
      `)).rows as Array<{ n: number }>;
      return { id: d.id, name: d.name, schools: schoolIds.length,
               students: Number(students || 0), staff: Number(staff || 0),
               openAlerts: Number(openAlerts || 0) };
    }));
    res.json({ demoDistricts: out });
  } catch (err) {
    logger.error({ err }, "demo-control overview failed");
    res.status(500).json({ error: "Failed to load demo overview" });
  }
});

// ---------------------------------------------------------------------------
// POST /demo-control/hero-cast
// Body: { districtId, action: "ensure"|"refresh" }
//   ensure  — idempotent: pins each archetype to a stable student and creates
//             missing tagged alerts/obligations. Re-running is a no-op.
//   refresh — re-pins archetypes to new random students (clears prior cast tags
//             only, never untagged data).
// Returns the curated cast: 6 archetypes (overloaded CM, missed minutes,
// comp owed, overdue IEP/progress, behavior-heavy, healthy success).
// ---------------------------------------------------------------------------
router.post("/demo-control/hero-cast", async (req: Request, res: Response) => {
  const { districtId, action } = (req.body ?? {}) as { districtId?: number; action?: string };
  const r = await requireDemoDistrict(districtId);
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
  try {
    const schoolIds = await loadSchoolIds(r.district.id);
    if (schoolIds.length === 0) { res.json({ cast: [], note: "Demo district has no schools yet." }); return; }
    const studentIds = await loadStudentIds(r.district.id);
    if (studentIds.length < 5) { res.status(400).json({ error: "Demo district needs at least 5 students for a hero cast." }); return; }

    if (action === "refresh") {
      // Clear only items tagged by the cast.
      await db.execute(sql`
        UPDATE alerts SET resolved = true, resolved_at = NOW(),
          resolved_note = ${`${DEMO_TAG} Cleared by hero-cast refresh`}
        WHERE resolved = false AND message LIKE ${"%" + CAST_TAG + "%"}
          AND student_id = ANY(${studentIds})
      `);
      await db.execute(sql`
        UPDATE compensatory_obligations SET status = 'completed',
          minutes_delivered = minutes_owed
        WHERE status = 'pending' AND notes LIKE ${"%" + CAST_TAG + "%"}
          AND student_id = ANY(${studentIds})
      `);
    }

    // Find overloaded case manager: staff in district with most active students.
    const overloadedRows = (await db.execute<{ id: number; first_name: string; last_name: string; n: number }>(sql`
      SELECT st.id, st.first_name, st.last_name, COUNT(s.id)::int AS n
      FROM staff st
      LEFT JOIN students s ON s.case_manager_id = st.id AND s.deleted_at IS NULL
        AND s.school_id = ANY(${schoolIds})
      WHERE st.school_id = ANY(${schoolIds})
      GROUP BY st.id, st.first_name, st.last_name
      ORDER BY n DESC LIMIT 1
    `)).rows;

    // Pick stable archetype student assignments by ordering by student id.
    // Same district + same students ⇒ same picks every run (idempotent).
    const sortedStudentIds = [...studentIds].sort((a, b) => a - b);
    const pick = (offset: number) => sortedStudentIds[offset % sortedStudentIds.length];

    const studentInfoMap = new Map<number, { first: string; last: string }>();
    {
      const ids = [pick(0), pick(1), pick(2), pick(3), pick(4)];
      const rows = (await db.execute<{ id: number; first_name: string; last_name: string }>(sql`
        SELECT id, first_name, last_name FROM students WHERE id = ANY(${ids})
      `)).rows;
      for (const row of rows) studentInfoMap.set(row.id, { first: row.first_name, last: row.last_name });
    }
    const stuName = (id: number) => {
      const s = studentInfoMap.get(id);
      return s ? `${s.first} ${s.last}` : `Student #${id}`;
    };

    const archetypes: Array<{
      key: string; label: string; studentId?: number; studentName?: string;
      staffId?: number; staffName?: string; status: string; description: string;
    }> = [];

    // 1. Overloaded case manager
    if (overloadedRows.length > 0) {
      const cm = overloadedRows[0];
      archetypes.push({
        key: "overloaded_cm", label: "Overloaded case manager",
        staffId: cm.id, staffName: `${cm.first_name} ${cm.last_name}`,
        status: "ready", description: `Currently carrying ${cm.n} active students.`,
      });
    }

    // 2. Missed minutes — student id pick(0)
    {
      const sid = pick(0);
      const existing = (await db.execute<{ id: number }>(sql`
        SELECT id FROM alerts WHERE student_id = ${sid} AND resolved = false
          AND message LIKE ${"%" + CAST_TAG + ":missed_minutes%"}
        LIMIT 1
      `)).rows;
      if (existing.length === 0) {
        await db.insert(alertsTable).values({
          type: "minutes_shortfall", severity: "high", studentId: sid, resolved: false,
          message: `${CAST_TAG}:missed_minutes Service minutes shortfall — 75 minutes behind this week`,
          suggestedAction: "Schedule a make-up session this week.",
        });
      }
      archetypes.push({ key: "missed_minutes", label: "Missed service minutes",
        studentId: sid, studentName: stuName(sid),
        status: existing.length ? "ready" : "created",
        description: "Open minutes-shortfall alert (75-min behind)." });
    }

    // 3. Compensatory minutes owed — student pick(1)
    {
      const sid = pick(1);
      const existing = (await db.execute<{ id: number }>(sql`
        SELECT id FROM compensatory_obligations
        WHERE student_id = ${sid} AND status = 'pending'
          AND notes LIKE ${"%" + CAST_TAG + ":comp_owed%"} LIMIT 1
      `)).rows;
      if (existing.length === 0) {
        const today = new Date();
        const start = new Date(today.getTime() - 30 * 86400_000).toISOString().slice(0, 10);
        const end = today.toISOString().slice(0, 10);
        await db.insert(compensatoryObligationsTable).values({
          studentId: sid, periodStart: start, periodEnd: end,
          minutesOwed: 240, minutesDelivered: 0, status: "pending",
          notes: `${CAST_TAG}:comp_owed Hero cast: 240 min compensatory exposure`,
          source: "manual",
        });
      }
      archetypes.push({ key: "comp_owed", label: "Compensatory minutes owed",
        studentId: sid, studentName: stuName(sid),
        status: existing.length ? "ready" : "created",
        description: "240 pending compensatory minutes." });
    }

    // 4. Overdue IEP / progress — student pick(2)
    {
      const sid = pick(2);
      const existing = (await db.execute<{ id: number }>(sql`
        SELECT id FROM alerts WHERE student_id = ${sid} AND resolved = false
          AND message LIKE ${"%" + CAST_TAG + ":iep_overdue%"} LIMIT 1
      `)).rows;
      if (existing.length === 0) {
        await db.insert(alertsTable).values({
          type: "iep_overdue", severity: "high", studentId: sid, resolved: false,
          message: `${CAST_TAG}:iep_overdue Annual IEP review is 14 days overdue`,
          suggestedAction: "Schedule the annual IEP meeting.",
        });
      }
      archetypes.push({ key: "iep_overdue", label: "Overdue IEP / progress",
        studentId: sid, studentName: stuName(sid),
        status: existing.length ? "ready" : "created",
        description: "Annual IEP 14 days overdue." });
    }

    // 5. Behavior-heavy — student pick(3), needs 3 alerts
    {
      const sid = pick(3);
      const existing = (await db.execute<{ n: number }>(sql`
        SELECT COUNT(*)::int AS n FROM alerts WHERE student_id = ${sid} AND resolved = false
          AND message LIKE ${"%" + CAST_TAG + ":behavior%"}
      `)).rows as Array<{ n: number }>;
      const need = Math.max(0, 3 - Number(existing[0]?.n || 0));
      for (let i = 0; i < need; i++) {
        await db.insert(alertsTable).values({
          type: "behavior_escalation", severity: "high", studentId: sid, resolved: false,
          message: `${CAST_TAG}:behavior Behavior escalation #${i + 1} this week`,
          suggestedAction: "Review BIP and check in with team.",
        });
      }
      archetypes.push({ key: "behavior_heavy", label: "Behavior-heavy student",
        studentId: sid, studentName: stuName(sid),
        status: need === 0 ? "ready" : "created",
        description: `${3 - need + need} open behavior alerts (target 3).` });
    }

    // 6. Healthy success — student pick(4); resolve any open alerts on this one.
    {
      const sid = pick(4);
      const cleared = await db.update(alertsTable)
        .set({ resolved: true, resolvedAt: new Date(),
               resolvedNote: `${CAST_TAG} Healthy-success archetype: cleared open alerts` })
        .where(and(eq(alertsTable.studentId, sid), eq(alertsTable.resolved, false)))
        .returning({ id: alertsTable.id });
      archetypes.push({ key: "healthy", label: "Healthy success story",
        studentId: sid, studentName: stuName(sid),
        status: cleared.length === 0 ? "ready" : "created",
        description: cleared.length === 0
          ? "No open alerts — clean compliance."
          : `Cleared ${cleared.length} open alerts to stage a clean record.` });
    }

    res.json({
      ok: true, districtId: r.district.id, districtName: r.district.name,
      action: action === "refresh" ? "refresh" : "ensure",
      cast: archetypes,
    });
  } catch (err) {
    logger.error({ err }, "hero-cast failed");
    res.status(500).json({ error: "Failed to set up hero cast" });
  }
});

// ---------------------------------------------------------------------------
// POST /demo-control/before-after
// Input-driven calculator. Body:
//   { districtId, weeksOnTrellis (1..52), startingCompliancePct (0..100),
//     startingOnTimeLoggingPct (0..100) }
// Returns derived "before" snapshot, current "after" snapshot from real DB,
// projection narrative, and a self-contained one-page sharable HTML.
// ---------------------------------------------------------------------------
router.post("/demo-control/before-after", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    districtId?: number; weeksOnTrellis?: number;
    startingCompliancePct?: number; startingOnTimeLoggingPct?: number;
  };
  const r = await requireDemoDistrict(body.districtId);
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
  const weeks = Math.max(1, Math.min(52, Number(body.weeksOnTrellis) || 12));
  const startCompliance = Math.max(0, Math.min(100, Number(body.startingCompliancePct ?? 60)));
  const startLogging = Math.max(0, Math.min(100, Number(body.startingOnTimeLoggingPct ?? 42)));
  try {
    const schoolIds = await loadSchoolIds(r.district.id);
    if (schoolIds.length === 0) {
      res.json({ districtId: r.district.id, before: null, after: null }); return;
    }
    const [stuRow] = (await db.execute<{ total: number; affected: number }>(sql`
      SELECT
        (SELECT COUNT(*) FROM students WHERE school_id = ANY(${schoolIds}) AND deleted_at IS NULL)::int AS total,
        (SELECT COUNT(DISTINCT student_id) FROM alerts WHERE resolved = false
           AND student_id IN (SELECT id FROM students WHERE school_id = ANY(${schoolIds})))::int AS affected
    `)).rows as Array<{ total: number; affected: number }>;
    const [alertRow] = (await db.execute<{ open: number; critical: number }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE resolved = false)::int AS open,
        COUNT(*) FILTER (WHERE resolved = false AND severity = 'high')::int AS critical
      FROM alerts WHERE student_id IN (SELECT id FROM students WHERE school_id = ANY(${schoolIds}))
    `)).rows as Array<{ open: number; critical: number }>;
    const [compRow] = (await db.execute<{ owed: number; delivered: number }>(sql`
      SELECT COALESCE(SUM(minutes_owed),0)::int AS owed,
             COALESCE(SUM(minutes_delivered),0)::int AS delivered
      FROM compensatory_obligations
      WHERE student_id IN (SELECT id FROM students WHERE school_id = ANY(${schoolIds}))
    `)).rows as Array<{ owed: number; delivered: number }>;

    const total = Number(stuRow.total || 0);
    const affected = Number(stuRow.affected || 0);
    const compliancePctNow = total > 0 ? Math.round((1 - affected / total) * 100) : 100;
    const openAlerts = Number(alertRow.open || 0);
    const criticalAlerts = Number(alertRow.critical || 0);
    const compMinutesOpen = Math.max(0, Number(compRow.owed || 0) - Number(compRow.delivered || 0));

    // Derive "before" from user-entered baseline (input-driven).
    const before = {
      compliancePct: startCompliance,
      onTimeLoggingPct: startLogging,
      // Open alerts scale with the inverse of starting compliance.
      openAlerts: Math.round(total * (1 - startCompliance / 100) * 1.5),
      criticalAlerts: Math.round(total * (1 - startCompliance / 100) * 0.4),
      compMinutesOpen: Math.round(total * 30 * (1 - startCompliance / 100) * 2),
      avgDaysToResolve: Math.max(7, Math.round(20 * (1 - startCompliance / 100))),
    };
    const after = {
      compliancePct: compliancePctNow,
      onTimeLoggingPct: Math.max(78, Math.min(98,
        100 - Math.round((openAlerts / Math.max(1, total)) * 100))),
      openAlerts, criticalAlerts, compMinutesOpen,
      avgDaysToResolve: Math.max(2, Math.round(20 * (1 - compliancePctNow / 100))),
    };
    const deltaCompliance = after.compliancePct - before.compliancePct;
    const minutesPerWeekClosed = weeks > 0
      ? Math.round((before.compMinutesOpen - after.compMinutesOpen) / weeks) : 0;
    const dollarsRecovered = Math.round((before.compMinutesOpen - after.compMinutesOpen) / 60 * 85);
    const narrative =
      `Over ${weeks} weeks on Trellis, ${r.district.name} moved from ${before.compliancePct}% compliance ` +
      `to ${after.compliancePct}% (${deltaCompliance >= 0 ? "+" : ""}${deltaCompliance} pts), closed ` +
      `${(before.compMinutesOpen - after.compMinutesOpen).toLocaleString()} minutes of compensatory exposure ` +
      `(~$${dollarsRecovered.toLocaleString()} avoided), and cut average alert resolution time from ` +
      `${before.avgDaysToResolve} days to ${after.avgDaysToResolve}.`;

    const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
    const onePagerHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Trellis impact — ${esc(r.district.name)}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:760px;margin:24px auto;padding:0 20px;color:#111}
h1{font-size:22px;margin:0 0 4px}h2{font-size:13px;color:#374151;margin-top:18px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
.banner{background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:8px 12px;border-radius:6px;font-size:12px;margin:8px 0 16px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #eee}
th{font-size:10px;text-transform:uppercase;color:#6b7280}.up{color:#047857;font-weight:600}.down{color:#b91c1c}
.foot{font-size:10px;color:#6b7280;margin-top:24px;border-top:1px solid #eee;padding-top:8px}
.kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.k{border:1px solid #ddd;border-radius:6px;padding:10px}.kl{font-size:10px;text-transform:uppercase;color:#6b7280}.kv{font-size:20px;font-weight:600;margin-top:4px}
</style></head><body>
<div class="banner">SAMPLE DATA — Generated for a Trellis demo. Numbers are not real.</div>
<h1>${esc(r.district.name)} — ${weeks} weeks on Trellis</h1>
<div class="kpi">
  <div class="k"><div class="kl">Compliance Δ</div><div class="kv up">+${deltaCompliance} pts</div></div>
  <div class="k"><div class="kl">Minutes recovered</div><div class="kv">${(before.compMinutesOpen - after.compMinutesOpen).toLocaleString()}</div></div>
  <div class="k"><div class="kl">$ avoided (heuristic)</div><div class="kv">$${dollarsRecovered.toLocaleString()}</div></div>
</div>
<h2>Key metrics</h2>
<table><thead><tr><th>Metric</th><th>Before Trellis</th><th>Today</th></tr></thead><tbody>
  <tr><td>Compliance %</td><td>${before.compliancePct}%</td><td class="up">${after.compliancePct}%</td></tr>
  <tr><td>On-time logging</td><td>${before.onTimeLoggingPct}%</td><td class="up">${after.onTimeLoggingPct}%</td></tr>
  <tr><td>Open alerts</td><td>${before.openAlerts}</td><td class="up">${after.openAlerts}</td></tr>
  <tr><td>Critical alerts</td><td>${before.criticalAlerts}</td><td class="up">${after.criticalAlerts}</td></tr>
  <tr><td>Comp minutes open</td><td>${before.compMinutesOpen.toLocaleString()}</td><td class="up">${after.compMinutesOpen.toLocaleString()}</td></tr>
  <tr><td>Avg days to resolve</td><td>${before.avgDaysToResolve}</td><td class="up">${after.avgDaysToResolve}</td></tr>
</tbody></table>
<h2>Summary</h2>
<p style="font-size:13px">${esc(narrative)}</p>
<div class="foot">Generated ${new Date().toLocaleString()} from the Demo Control Center for the ${esc(r.district.name)} demo district.</div>
</body></html>`;
    res.json({
      ok: true, districtId: r.district.id, districtName: r.district.name,
      inputs: { weeksOnTrellis: weeks, startingCompliancePct: startCompliance, startingOnTimeLoggingPct: startLogging },
      totalStudents: total, before, after,
      delta: {
        compliancePts: deltaCompliance,
        minutesClosedPerWeek: minutesPerWeekClosed,
        dollarsRecovered,
      },
      narrative,
      onePagerHtml,
      filename: `trellis-impact-${r.district.id}-${new Date().toISOString().slice(0, 10)}.html`,
    });
  } catch (err) {
    logger.error({ err }, "before-after failed");
    res.status(500).json({ error: "Failed to compute before/after" });
  }
});

// ---------------------------------------------------------------------------
// GET /demo-control/comp-forecast?districtId=&minutesPerWeek=&teamCapacity=
//                               &missedSessionRate=&staffingStrainPct=
//                               &contractorRate=
// READ-ONLY what-if trajectory model. Sliders model the four real levers
// districts pull when working down compensatory exposure:
//   - minutesPerWeek    — how much the team currently delivers
//   - teamCapacity      — what the team COULD deliver this week
//   - missedSessionRate — % of scheduled sessions still being missed (adds new
//                         exposure each week)
//   - staffingStrainPct — % discount on effective delivery (callouts, vacancies)
//   - contractorRate    — $/hr for closing the remaining gap with contractors
// Returns the projection series, weeks-to-close, top drivers, and the
// contractor cost to close in N weeks.
// ---------------------------------------------------------------------------
router.get("/demo-control/comp-forecast", async (req: Request, res: Response) => {
  const r = await requireDemoDistrict(req.query.districtId);
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
  const minutesPerWeek = Math.max(0, Math.min(20000, Number(req.query.minutesPerWeek) || 600));
  const teamCapacity = Math.max(minutesPerWeek, Math.min(40000, Number(req.query.teamCapacity) || 1500));
  const missedSessionRate = Math.max(0, Math.min(50, Number(req.query.missedSessionRate) || 8));
  const staffingStrainPct = Math.max(0, Math.min(60, Number(req.query.staffingStrainPct) || 10));
  const contractorRate = Math.max(20, Math.min(300, Number(req.query.contractorRate) || 95));
  try {
    const schoolIds = await loadSchoolIds(r.district.id);
    if (schoolIds.length === 0) {
      res.json({ districtId: r.district.id, currentMinutesOpen: 0, series: [] }); return;
    }
    const [row] = (await db.execute<{ owed: number; delivered: number; obligations: number; students: number }>(sql`
      SELECT COALESCE(SUM(minutes_owed),0)::int AS owed,
             COALESCE(SUM(minutes_delivered),0)::int AS delivered,
             COUNT(*)::int AS obligations,
             COUNT(DISTINCT student_id)::int AS students
      FROM compensatory_obligations
      WHERE status IN ('pending','in_progress')
        AND student_id IN (SELECT id FROM students WHERE school_id = ANY(${schoolIds}) AND deleted_at IS NULL)
    `)).rows as Array<{ owed: number; delivered: number; obligations: number; students: number }>;
    // Current backlog
    const open = Math.max(0, Number(row.owed || 0) - Number(row.delivered || 0));
    // Effective weekly drawdown: planned delivery, discounted by staffing strain,
    // offset by new exposure created by ongoing missed sessions.
    const effectiveDelivery = Math.round(minutesPerWeek * (1 - staffingStrainPct / 100));
    const newExposurePerWeek = Math.round(teamCapacity * (missedSessionRate / 100));
    const netDrawdown = effectiveDelivery - newExposurePerWeek;
    const series: Array<{ week: number; minutesRemaining: number }> = [];
    let remaining = open;
    for (let w = 0; w <= 12; w++) {
      series.push({ week: w, minutesRemaining: Math.max(0, Math.round(remaining)) });
      remaining = Math.max(0, remaining - netDrawdown);
    }
    const weeksToClose = netDrawdown > 0 ? Math.ceil(open / netDrawdown) : null;
    const dollarsAvoidedAtClose = Math.round(open / 60 * contractorRate);
    const contractorCostToCloseIn4Weeks = Math.round(
      Math.max(0, open - effectiveDelivery * 4) / 60 * contractorRate);
    // Top drivers: rank the inputs by how much each is hurting closure.
    const drivers = [
      { name: "Missed sessions", impact: newExposurePerWeek, hint: `${missedSessionRate}% of capacity` },
      { name: "Staffing strain", impact: Math.round(minutesPerWeek * (staffingStrainPct / 100)),
        hint: `${staffingStrainPct}% effective-delivery discount` },
      { name: "Underused capacity", impact: Math.max(0, teamCapacity - minutesPerWeek),
        hint: `${(teamCapacity - minutesPerWeek).toLocaleString()} min/wk unused` },
    ].sort((a, b) => b.impact - a.impact);
    res.json({
      ok: true, districtId: r.district.id, districtName: r.district.name,
      currentMinutesOpen: open,
      obligations: Number(row.obligations || 0),
      affectedStudents: Number(row.students || 0),
      inputs: { minutesPerWeek, teamCapacity, missedSessionRate, staffingStrainPct, contractorRate },
      effectiveDelivery, newExposurePerWeek, netDrawdown,
      capacityHeadroom: Math.max(0, teamCapacity - minutesPerWeek),
      weeksToClose,
      projectedCloseDate: weeksToClose != null
        ? new Date(Date.now() + weeksToClose * 7 * 86400_000).toISOString().slice(0, 10) : null,
      dollarsAvoidedAtClose,
      contractorCostToCloseIn4Weeks,
      topDrivers: drivers,
      series,
    });
  } catch (err) {
    logger.error({ err }, "comp-forecast failed");
    res.status(500).json({ error: "Failed to compute comp forecast" });
  }
});

// ---------------------------------------------------------------------------
// GET /demo-control/caseload-providers?districtId=
// Returns flat list of providers in the demo district + their assigned active
// students. Used by the caseload-balancing simulator (panel 6) to seed the
// drag/move scenario state. Strictly READ-ONLY — the simulator stores moves
// in client state only and never writes back. Scoped by demo-district guard.
// ---------------------------------------------------------------------------
router.get("/demo-control/caseload-providers", async (req: Request, res: Response) => {
  const r = await requireDemoDistrict(req.query.districtId);
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
  try {
    const schoolIds = await loadSchoolIds(r.district.id);
    if (schoolIds.length === 0) { res.json({ providers: [], students: [] }); return; }
    const providers = (await db.execute<{
      id: number; first_name: string; last_name: string; role: string | null;
      title: string | null; school_id: number | null;
    }>(sql`
      SELECT st.id, st.first_name, st.last_name, st.role, st.title, st.school_id
      FROM staff st
      WHERE st.school_id = ANY(${schoolIds}) AND st.deleted_at IS NULL
        AND st.status = 'active'
      ORDER BY st.last_name, st.first_name
    `)).rows;
    const students = (await db.execute<{
      id: number; first_name: string; last_name: string; grade: string | null;
      school_id: number | null; case_manager_id: number | null;
    }>(sql`
      SELECT s.id, s.first_name, s.last_name, s.grade, s.school_id,
             s.case_manager_id
      FROM students s
      WHERE s.school_id = ANY(${schoolIds}) AND s.deleted_at IS NULL
        AND s.status = 'active'
      ORDER BY s.last_name, s.first_name
    `)).rows;
    res.json({
      ok: true, districtId: r.district.id, districtName: r.district.name,
      providers: providers.map(p => ({
        id: p.id, firstName: p.first_name, lastName: p.last_name,
        role: p.role || "unknown", title: p.title, schoolId: p.school_id,
      })),
      students: students.map(s => ({
        id: s.id, firstName: s.first_name, lastName: s.last_name,
        grade: s.grade, schoolId: s.school_id,
        caseManagerId: s.case_manager_id,
      })),
    });
  } catch (err) {
    logger.error({ err }, "caseload-providers failed");
    res.status(500).json({ error: "Failed to load caseload providers" });
  }
});

// ---------------------------------------------------------------------------
// POST /demo-control/alert-density
// Body: {
//   districtId,
//   target: "low"|"medium"|"high",       // overall open-alert volume
//   severityMix?: "calm"|"mixed"|"crisis", // bias new alerts toward severity
//   ageBucketDays?: number,              // distribute creation_at over N days
// }
// Strictly district-scoped. Tunes BOTH volume and severity / backlog age.
// ---------------------------------------------------------------------------
router.post("/demo-control/alert-density", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    districtId?: number; target?: string;
    severityMix?: string; ageBucketDays?: number;
  };
  const { districtId, target } = body;
  const severityMix: "calm" | "mixed" | "crisis" =
    body.severityMix === "calm" || body.severityMix === "crisis" ? body.severityMix : "mixed";
  const ageBucketDays = Math.max(0, Math.min(60, Number(body.ageBucketDays) || 0));
  if (!["low", "medium", "high"].includes(String(target))) {
    res.status(400).json({ error: "target must be low|medium|high" }); return;
  }
  const r = await requireDemoDistrict(districtId);
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
  try {
    const studentIds = await loadStudentIds(r.district.id);
    if (studentIds.length === 0) { res.json({ ok: true }); return; }
    const targetCount = target === "low" ? 5 : target === "medium" ? 18 : 40;
    const [{ n: openAlerts }] = (await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM alerts
      WHERE resolved = false AND student_id = ANY(${studentIds})
    `)).rows as Array<{ n: number }>;
    const cur = Number(openAlerts || 0);
    let resolved = 0, inserted = 0;
    if (cur > targetCount) {
      const drop = cur - targetCount;
      // For 'crisis', resolve the LOW-severity items first (so highs stay).
      // For 'calm', resolve the HIGH-severity items first.
      const sevOrder = severityMix === "crisis"
        ? "CASE severity WHEN 'low' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC"
        : severityMix === "calm"
        ? "CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC"
        : "CASE severity WHEN 'low' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC";
      const toResolve = (await db.execute<{ id: number }>(sql`
        SELECT id FROM alerts WHERE resolved = false AND student_id = ANY(${studentIds})
        ORDER BY ${sql.raw(sevOrder)}, created_at ASC
        LIMIT ${drop}
      `)).rows;
      const ids = toResolve.map(r => r.id);
      if (ids.length > 0) {
        const out = await db.update(alertsTable).set({
          resolved: true, resolvedAt: new Date(),
          resolvedNote: `${DEMO_TAG} Alert density tuner: target=${target} mix=${severityMix}`,
        }).where(inArray(alertsTable.id, ids)).returning({ id: alertsTable.id });
        resolved = out.length;
      }
    } else if (cur < targetCount) {
      const need = targetCount - cur;
      const stuRows = (await db.execute<{ id: number }>(sql`
        SELECT id FROM students WHERE id = ANY(${studentIds})
        ORDER BY random() LIMIT ${need}
      `)).rows;
      const types = ["missed_session", "iep_overdue", "minutes_shortfall", "behavior_escalation", "evaluation_due"];
      // Severity weighting (sums roughly to 10).
      const sevPool = severityMix === "crisis"
        ? ["high","high","high","high","high","high","medium","medium","medium","low"]
        : severityMix === "calm"
        ? ["low","low","low","low","low","low","medium","medium","medium","high"]
        : ["low","low","low","medium","medium","medium","medium","high","high","high"];
      for (let i = 0; i < stuRows.length; i++) {
        const t = types[i % types.length];
        const sev = sevPool[i % sevPool.length];
        // Distribute created_at across [now - ageBucketDays, now].
        const offsetDays = ageBucketDays > 0 ? Math.random() * ageBucketDays : 0;
        const createdAt = new Date(Date.now() - offsetDays * 86400_000);
        await db.insert(alertsTable).values({
          type: t, severity: sev, studentId: stuRows[i].id, resolved: false,
          message: `${DEMO_TAG} Density tuner: ${t.replace(/_/g, " ")}`,
          suggestedAction: "Synthetic alert from Demo Control Center",
          createdAt,
        });
        inserted++;
      }
    }
    const [counts] = (await db.execute<{
      total: number; high: number; medium: number; low: number; over_7d: number;
    }>(sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE severity='high')::int AS high,
             COUNT(*) FILTER (WHERE severity='medium')::int AS medium,
             COUNT(*) FILTER (WHERE severity='low')::int AS low,
             COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days')::int AS over_7d
      FROM alerts WHERE resolved = false AND student_id = ANY(${studentIds})
    `)).rows as Array<Record<string, number>>;
    res.json({
      ok: true, target, targetCount, severityMix, ageBucketDays,
      before: cur, after: Number(counts.total || 0),
      resolved, inserted,
      mix: { high: counts.high, medium: counts.medium, low: counts.low, over7d: counts.over_7d },
    });
  } catch (err) {
    logger.error({ err }, "alert-density failed");
    res.status(500).json({ error: "Failed to tune alert density" });
  }
});

// ---------------------------------------------------------------------------
// POST /demo-control/import-preview  — read-only CSV inspector. Never persists.
// ---------------------------------------------------------------------------
router.post("/demo-control/import-preview", async (req: Request, res: Response) => {
  const { csv, kind } = (req.body ?? {}) as { csv?: string; kind?: string };
  if (typeof csv !== "string" || csv.trim().length === 0) {
    res.status(400).json({ error: "csv body is required" }); return;
  }
  const k = kind === "staff" ? "staff" : "students";

  function parseCsv(input: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = []; let cell = ""; let inQuotes = false;
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (inQuotes) {
        if (c === '"' && input[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cell += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") { row.push(cell); cell = ""; }
        else if (c === "\n") { row.push(cell); cell = ""; rows.push(row); row = []; }
        else if (c === "\r") { /* skip */ }
        else cell += c;
      }
    }
    if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(v => v.trim().length > 0));
  }

  const all = parseCsv(csv);
  if (all.length === 0) { res.status(400).json({ error: "CSV has no rows" }); return; }
  const headers = all[0].map(h => h.trim());
  const dataRows = all.slice(1, 51);

  const ALIASES: Record<string, string[]> = k === "students" ? {
    firstName: ["first_name", "first", "first name", "given name"],
    lastName: ["last_name", "last", "last name", "surname", "family name"],
    grade: ["grade", "grade_level", "gr"],
    externalId: ["student_id", "external_id", "sis_id", "id", "student#"],
    dateOfBirth: ["dob", "date_of_birth", "birth date", "birthdate"],
  } : {
    firstName: ["first_name", "first", "first name", "given name"],
    lastName: ["last_name", "last", "last name", "surname"],
    role: ["role", "position", "title"], email: ["email", "email_address", "e-mail"],
  };
  const lcHeaders = headers.map(h => h.toLowerCase());
  const mapping: Record<string, string | null> = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const idx = lcHeaders.findIndex(h => h === field.toLowerCase() || aliases.includes(h));
    mapping[field] = idx >= 0 ? headers[idx] : null;
  }
  const issues: Array<{ row: number; column: string; message: string }> = [];
  const requiredFields = ["firstName", "lastName"];
  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    if (r.length !== headers.length) {
      issues.push({ row: i + 2, column: "(row)", message: `Has ${r.length} columns, expected ${headers.length}` });
    }
    for (const f of requiredFields) {
      const colName = mapping[f];
      if (!colName) continue;
      const colIdx = headers.indexOf(colName);
      const val = (r[colIdx] ?? "").trim();
      if (!val) issues.push({ row: i + 2, column: colName, message: `Missing required ${f}` });
    }
  }
  res.json({
    kind: k, headers, mapping,
    sampleRows: dataRows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))),
    rowCount: all.length - 1, issues,
    summary: { mapped: Object.values(mapping).filter(Boolean).length,
               unmapped: Object.values(mapping).filter(v => v === null).length,
               issueCount: issues.length },
  });
});

// ---------------------------------------------------------------------------
// Shared exec packet metric assembly. Reuses computePilotBaselineMetrics
// (the same math that powers the Pilot Readout) so the packet, the pilot
// baseline, and the comparison panels never disagree about the headline
// numbers. Adds staffing strain + trend-vs-baseline on top.
// ---------------------------------------------------------------------------
async function buildExecPacketData(districtId: number, districtName: string) {
  const schoolIds = await loadSchoolIds(districtId);
  if (schoolIds.length === 0) {
    return { schoolIds, empty: true as const, districtName };
  }
  const metrics = await computePilotBaselineMetrics(districtId);
  const [baselineRow] = await db
    .select()
    .from(pilotBaselineSnapshotsTable)
    .where(eq(pilotBaselineSnapshotsTable.districtId, districtId))
    .limit(1);
  const [stuRow] = (await db.execute<{ total: number; affected: number; high_risk: number }>(sql`
    SELECT
      (SELECT COUNT(*) FROM students WHERE school_id = ANY(${schoolIds}) AND deleted_at IS NULL)::int AS total,
      (SELECT COUNT(DISTINCT student_id) FROM alerts WHERE resolved = false
         AND student_id IN (SELECT id FROM students WHERE school_id = ANY(${schoolIds})))::int AS affected,
      (SELECT COUNT(DISTINCT student_id) FROM alerts WHERE resolved = false AND severity = 'high'
         AND student_id IN (SELECT id FROM students WHERE school_id = ANY(${schoolIds})))::int AS high_risk
  `)).rows as Array<{ total: number; affected: number; high_risk: number }>;
  const topRisk = (await db.execute<{ id: number; first_name: string; last_name: string; n: number }>(sql`
    SELECT s.id, s.first_name, s.last_name, COUNT(a.id)::int AS n FROM students s
    JOIN alerts a ON a.student_id = s.id AND a.resolved = false
    WHERE s.school_id = ANY(${schoolIds}) AND s.deleted_at IS NULL
    GROUP BY s.id, s.first_name, s.last_name ORDER BY n DESC LIMIT 5
  `)).rows;
  // Staffing strain: ratio of active students per active staff member with a
  // caseload, plus the count of staff carrying >25 students (overloaded).
  const [staffRow] = (await db.execute<{
    staff_total: number; staff_with_load: number; overloaded: number; max_caseload: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM staff WHERE school_id = ANY(${schoolIds}) AND deleted_at IS NULL) AS staff_total,
      COUNT(*)::int AS staff_with_load,
      COUNT(*) FILTER (WHERE n > 25)::int AS overloaded,
      COALESCE(MAX(n), 0)::int AS max_caseload
    FROM (
      SELECT case_manager_id AS sid, COUNT(*) AS n FROM students
      WHERE school_id = ANY(${schoolIds}) AND deleted_at IS NULL AND case_manager_id IS NOT NULL
      GROUP BY case_manager_id
    ) cl
  `)).rows as Array<Record<string, number>>;
  const total = Number(stuRow.total || 0);
  const affected = Number(stuRow.affected || 0);
  const staffWithLoad = Number(staffRow?.staff_with_load || 0);
  const avgCaseload = staffWithLoad > 0 ? Math.round((total / staffWithLoad) * 10) / 10 : 0;
  // Trend vs baseline: +/- delta on key metrics; baseline acts as the
  // "prior period" anchor for districts in pilot mode.
  const trend = baselineRow ? {
    capturedAt: baselineRow.capturedAt,
    compliancePts: (metrics.compliancePercent ?? 0) - (baselineRow.compliancePercent ?? 0),
    exposureDollars: metrics.exposureDollars - baselineRow.exposureDollars,
    compEdMinutes: metrics.compEdMinutesOutstanding - baselineRow.compEdMinutesOutstanding,
    overdueEvaluations: metrics.overdueEvaluations - baselineRow.overdueEvaluations,
    expiringIeps: metrics.expiringIepsNext60 - baselineRow.expiringIepsNext60,
  } : null;
  return {
    empty: false as const,
    schoolIds, districtName,
    total, affected, highRisk: Number(stuRow.high_risk || 0),
    topRisk,
    metrics, trend,
    staffing: {
      staffTotal: Number(staffRow?.staff_total || 0),
      staffWithLoad,
      overloaded: Number(staffRow?.overloaded || 0),
      maxCaseload: Number(staffRow?.max_caseload || 0),
      avgCaseload,
    },
  };
}

function fmtSign(n: number, suffix = ""): string {
  const v = Math.round(n);
  if (v === 0) return `±0${suffix}`;
  return `${v > 0 ? "+" : ""}${v.toLocaleString()}${suffix}`;
}

router.get("/demo-control/exec-packet", async (req: Request, res: Response) => {
  const r = await requireDemoDistrict(req.query.districtId);
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
  try {
    const data = await buildExecPacketData(r.district.id, r.district.name);
    if (data.empty) {
      res.json({ html: `<h1>${r.district.name}</h1><p>No schools.</p>`, districtId: r.district.id });
      return;
    }
    const { metrics, trend, staffing, total, affected, highRisk, topRisk } = data;
    const compliancePct = metrics.compliancePercent ?? 0;
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
    const trendLine = trend
      ? `vs Day-0 baseline: <strong>${fmtSign(trend.compliancePts, " pts")}</strong> compliance · ` +
        `<strong>${fmtSign(-trend.exposureDollars).replace(/^([+-])/, (m) => m === "+" ? "−" : "+")}</strong> exposure $ · ` +
        `<strong>${fmtSign(-trend.compEdMinutes)}</strong> comp-ed min · ` +
        `<strong>${fmtSign(-trend.overdueEvaluations)}</strong> overdue evals`
      : `<em>No baseline captured yet — trend will populate after the next snapshot.</em>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Executive Packet — ${esc(r.district.name)}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:780px;margin:24px auto;color:#111;padding:0 20px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:14px;border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:24px}
.banner{background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:16px}
.kpi-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.kpi{border:1px solid #ddd;border-radius:6px;padding:10px}
.kpi-label{font-size:10px;text-transform:uppercase;color:#6b7280;letter-spacing:.04em}
.kpi-value{font-size:20px;font-weight:600;margin-top:4px}
.kpi-sub{font-size:10px;color:#6b7280;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #eee}
th{font-size:10px;text-transform:uppercase;color:#6b7280}
.trend{background:#f0f9ff;border:1px solid #bae6fd;color:#075985;padding:8px 12px;border-radius:6px;font-size:12px;margin:12px 0}
.foot{font-size:10px;color:#6b7280;border-top:1px solid #eee;margin-top:24px;padding-top:8px}
</style></head><body>
<div class="banner">SAMPLE DATA — Generated from a demo district. Numbers are not real.</div>
<h1>Executive Packet — ${esc(r.district.name)}</h1>
<p style="font-size:12px;color:#6b7280">Generated ${new Date().toLocaleString()} · One-page district summary</p>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-label">Compliance</div><div class="kpi-value">${compliancePct}%</div><div class="kpi-sub">${total} active students</div></div>
  <div class="kpi"><div class="kpi-label">Students at risk</div><div class="kpi-value">${affected}</div><div class="kpi-sub">${highRisk} high-risk · open alerts</div></div>
  <div class="kpi"><div class="kpi-label">Comp-ed exposure</div><div class="kpi-value">$${metrics.exposureDollars.toLocaleString()}</div><div class="kpi-sub">${metrics.compEdMinutesOutstanding.toLocaleString()} min outstanding</div></div>
</div>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-label">Overdue evaluations</div><div class="kpi-value">${metrics.overdueEvaluations}</div><div class="kpi-sub">past 60-day deadline</div></div>
  <div class="kpi"><div class="kpi-label">IEPs / progress next 60d</div><div class="kpi-value">${metrics.expiringIepsNext60}</div><div class="kpi-sub">renewals coming due</div></div>
  <div class="kpi"><div class="kpi-label">Staffing strain</div><div class="kpi-value">${staffing.avgCaseload}</div><div class="kpi-sub">${staffing.overloaded} CMs &gt; 25 · max ${staffing.maxCaseload}</div></div>
</div>
<div class="trend">${trendLine}</div>
<h2>Top high-risk students</h2>
<table><thead><tr><th>Student</th><th>Open alerts</th></tr></thead><tbody>
${topRisk.map(s => `<tr><td>${esc(s.first_name)} ${esc(s.last_name)}</td><td>${s.n}</td></tr>`).join("") || `<tr><td colspan="2">None</td></tr>`}
</tbody></table>
<div class="foot">Generated by Demo Control Center for the ${esc(r.district.name)} demo district. Not for distribution outside Trellis demos.</div>
</body></html>`;
    res.json({
      ok: true, districtId: r.district.id, districtName: r.district.name,
      filename: `exec-packet-${r.district.id}-${new Date().toISOString().slice(0, 10)}.html`,
      html,
      summary: {
        compliancePct, total, affected, highRisk,
        exposureDollars: metrics.exposureDollars,
        compEdMinutesOutstanding: metrics.compEdMinutesOutstanding,
        overdueEvaluations: metrics.overdueEvaluations,
        expiringIepsNext60: metrics.expiringIepsNext60,
        staffing,
        trend,
      },
    });
  } catch (err) {
    logger.error({ err }, "exec-packet failed");
    res.status(500).json({ error: "Failed to build executive packet" });
  }
});

// ---------------------------------------------------------------------------
// GET /demo-control/exec-packet.pdf?districtId=  — same packet as PDF.
// Streams application/pdf so the browser can preview or download it directly.
// ---------------------------------------------------------------------------
router.get("/demo-control/exec-packet.pdf", async (req: Request, res: Response) => {
  const r = await requireDemoDistrict(req.query.districtId);
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
  try {
    const data = await buildExecPacketData(r.district.id, r.district.name);
    const filename = `exec-packet-${r.district.id}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    const doc = new PDFDocument({ size: "LETTER", margin: 48 });
    doc.pipe(res);
    doc.fillColor("#92400e").fontSize(9)
       .text("SAMPLE DATA — Generated for a Trellis demo. Numbers are not real.", { align: "left" });
    doc.moveDown(0.4);
    doc.fillColor("#111827").fontSize(20).font("Helvetica-Bold")
       .text(`Executive Packet — ${r.district.name}`);
    doc.fillColor("#6b7280").fontSize(9).font("Helvetica")
       .text(`Generated ${new Date().toLocaleString()} · One-page district summary`);
    doc.moveDown(0.6);
    if (data.empty) {
      doc.fillColor("#111827").fontSize(11).text("No schools configured for this demo district.");
      doc.end();
      return;
    }
    const { metrics, trend, staffing, total, affected, highRisk, topRisk } = data;
    const compliancePct = metrics.compliancePercent ?? 0;
    const drawKpiRow = (kpis: Array<{ label: string; value: string; sub?: string }>, y: number) => {
      const startX = 48; const boxW = 162; const boxH = 56; const gap = 8;
      kpis.forEach((k, i) => {
        const x = startX + i * (boxW + gap);
        doc.rect(x, y, boxW, boxH).strokeColor("#d1d5db").lineWidth(1).stroke();
        doc.fillColor("#6b7280").fontSize(7).font("Helvetica-Bold")
           .text(k.label, x + 6, y + 6, { width: boxW - 12 });
        doc.fillColor("#111827").fontSize(16).font("Helvetica-Bold")
           .text(k.value, x + 6, y + 20, { width: boxW - 12 });
        if (k.sub) {
          doc.fillColor("#6b7280").fontSize(7).font("Helvetica")
             .text(k.sub, x + 6, y + 42, { width: boxW - 12 });
        }
      });
      doc.y = y + boxH + 8;
    };
    drawKpiRow([
      { label: "COMPLIANCE", value: `${compliancePct}%`, sub: `${total} active students` },
      { label: "STUDENTS AT RISK", value: String(affected), sub: `${highRisk} high-risk` },
      { label: "COMP-ED EXPOSURE", value: `$${metrics.exposureDollars.toLocaleString()}`,
        sub: `${metrics.compEdMinutesOutstanding.toLocaleString()} min outstanding` },
    ], doc.y);
    drawKpiRow([
      { label: "OVERDUE EVALUATIONS", value: String(metrics.overdueEvaluations), sub: "past 60-day deadline" },
      { label: "IEPS DUE NEXT 60D", value: String(metrics.expiringIepsNext60), sub: "renewals coming up" },
      { label: "STAFFING STRAIN", value: String(staffing.avgCaseload),
        sub: `${staffing.overloaded} CMs > 25 · max ${staffing.maxCaseload}` },
    ], doc.y);
    // Trend vs baseline
    doc.fillColor("#374151").fontSize(10).font("Helvetica-Bold").text("Trend vs Day-0 baseline");
    doc.moveTo(48, doc.y).lineTo(548, doc.y).strokeColor("#e5e7eb").stroke();
    doc.moveDown(0.2);
    doc.fillColor("#111827").fontSize(10).font("Helvetica");
    if (trend) {
      const expSign = trend.exposureDollars <= 0 ? "↓" : "↑";
      doc.text(
        `Compliance: ${fmtSign(trend.compliancePts, " pts")}   ` +
        `Exposure $: ${expSign} ${Math.abs(trend.exposureDollars).toLocaleString()}   ` +
        `Comp-ed minutes: ${fmtSign(-trend.compEdMinutes)}   ` +
        `Overdue evals: ${fmtSign(-trend.overdueEvaluations)}`,
      );
    } else {
      doc.fillColor("#6b7280").text("No baseline captured yet — trend will populate after the next snapshot.");
    }
    doc.moveDown(0.6);
    // Top high-risk
    doc.fillColor("#374151").fontSize(11).font("Helvetica-Bold").text("Top high-risk students");
    doc.moveTo(48, doc.y).lineTo(548, doc.y).strokeColor("#e5e7eb").stroke();
    doc.moveDown(0.3); doc.fillColor("#111827").fontSize(10).font("Helvetica");
    if (topRisk.length === 0) doc.text("None.");
    else topRisk.forEach(s => doc.text(`• ${s.first_name} ${s.last_name} — ${s.n} open alert(s)`));
    doc.moveDown(1.5);
    doc.fillColor("#6b7280").fontSize(8)
       .text(`Generated by Demo Control Center for the ${r.district.name} demo district. Not for distribution outside Trellis demos.`, { align: "left" });
    doc.end();
  } catch (err) {
    logger.error({ err }, "exec-packet pdf failed");
    if (!res.headersSent) res.status(500).json({ error: "Failed to build PDF packet" });
  }
});

// ---------------------------------------------------------------------------
// POST /demo-control/reset-district  Body: { districtId }
// District-scoped reset: tears down sample data for THIS demo district then
// re-seeds it. Never touches other districts. Refuses non-demo districts.
// ---------------------------------------------------------------------------
router.post("/demo-control/reset-district", async (req: Request, res: Response) => {
  const { districtId } = (req.body ?? {}) as { districtId?: number };
  const r = await requireDemoDistrict(districtId);
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
  const start = Date.now();
  try {
    const teardown = await teardownSampleData(r.district.id);
    const seed = await seedSampleDataForDistrict(r.district.id, {});
    res.json({
      ok: true, districtId: r.district.id, districtName: r.district.name,
      elapsedMs: Date.now() - start,
      teardown, seed,
    });
  } catch (err) {
    logger.error({ err, districtId: r.district.id }, "reset-district failed");
    res.status(500).json({ error: "Failed to reset demo district" });
  }
});

export default router;
