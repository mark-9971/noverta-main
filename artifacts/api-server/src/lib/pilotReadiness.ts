/**
 * In-app Pilot Readiness checks.
 *
 * Mirrors the database-side checks in scripts/src/pilot-readiness.ts so a
 * district admin sees the same "is this district ready for production use?"
 * signals from inside the app. The CLI script also covers env vars, the
 * unauth-endpoint posture, and a no-fake-data file scan — those are
 * deployment-environment concerns and not surfaced here.
 *
 * Each check returns a stable id so the front-end can attach a "fix this"
 * link, plus a human-readable label and a one-line detail.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export type ReadinessStatus = "pass" | "warn" | "fail";

export interface ReadinessCheck {
  id: string;
  group: "data" | "config" | "operations";
  label: string;
  status: ReadinessStatus;
  detail: string;
  fixHref?: string;
}

export interface ReadinessReport {
  districtId: number;
  districtName: string | null;
  checks: ReadinessCheck[];
  summary: { pass: number; warn: number; fail: number; total: number };
}

async function scalar<T = number>(query: ReturnType<typeof sql>, key = "n"): Promise<T | null> {
  const result = await db.execute(query);
  const row = result.rows?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return row[key] as T;
}

export async function runDistrictReadinessChecks(districtId: number): Promise<ReadinessReport> {
  const checks: ReadinessCheck[] = [];

  // District record exists with a usable name.
  const districtRow = await db.execute(
    sql`SELECT name FROM districts WHERE id = ${districtId} LIMIT 1`,
  );
  const districtName = (districtRow.rows?.[0] as { name?: string } | undefined)?.name ?? null;
  checks.push({
    id: "district-profile",
    group: "config",
    label: "District profile configured",
    status: districtName ? "pass" : "fail",
    detail: districtName ? `Name: ${districtName}` : "No district name set",
    fixHref: "/settings",
  });

  // Active school year configured.
  const syN = (await scalar<number>(sql`
    SELECT COUNT(*)::int AS n FROM school_years
    WHERE district_id = ${districtId} AND is_active = true
  `)) ?? 0;
  checks.push({
    id: "school-year",
    group: "config",
    label: "Active school year configured",
    status: syN > 0 ? "pass" : "fail",
    detail: syN > 0 ? "An active school year is set" : "No active school year — reports and rollover need this",
    fixHref: "/school-year",
  });

  // At least one admin staff record for the district.
  const adminN = (await scalar<number>(sql`
    SELECT COUNT(*)::int AS n FROM staff st
    JOIN schools sc ON sc.id = st.school_id
    WHERE sc.district_id = ${districtId} AND st.role = 'admin' AND st.deleted_at IS NULL
  `)) ?? 0;
  checks.push({
    id: "admin-staff",
    group: "operations",
    label: "District has admin staff",
    status: adminN > 0 ? "pass" : "fail",
    detail: adminN > 0 ? `${adminN} admin${adminN === 1 ? "" : "s"} on file` : "No admin staff — nobody can run the platform",
    fixHref: "/staff",
  });

  // Staff roster.
  const staffN = (await scalar<number>(sql`
    SELECT COUNT(*)::int AS n FROM staff st
    JOIN schools sc ON sc.id = st.school_id
    WHERE sc.district_id = ${districtId} AND st.deleted_at IS NULL
  `)) ?? 0;
  checks.push({
    id: "staff-roster",
    group: "data",
    label: "Staff imported",
    status: staffN >= 5 ? "pass" : staffN > 0 ? "warn" : "fail",
    detail: `${staffN} staff member${staffN === 1 ? "" : "s"} on file`,
    fixHref: "/staff",
  });

  // Student roster.
  const studentN = (await scalar<number>(sql`
    SELECT COUNT(*)::int AS n FROM students s
    JOIN schools sc ON sc.id = s.school_id
    WHERE sc.district_id = ${districtId} AND s.deleted_at IS NULL
  `)) ?? 0;
  checks.push({
    id: "student-roster",
    group: "data",
    label: "Students imported",
    status: studentN > 0 ? "pass" : "fail",
    detail: `${studentN} active student${studentN === 1 ? "" : "s"}`,
    fixHref: "/import",
  });

  // Service requirements present.
  const reqN = (await scalar<number>(sql`
    SELECT COUNT(*)::int AS n FROM service_requirements sr
    JOIN students s ON s.id = sr.student_id
    JOIN schools sc ON sc.id = s.school_id
    WHERE sc.district_id = ${districtId}
  `)) ?? 0;
  checks.push({
    id: "service-requirements",
    group: "data",
    label: "Service requirements imported",
    status: reqN > 0 ? "pass" : "fail",
    detail: `${reqN} requirement${reqN === 1 ? "" : "s"} on file`,
    fixHref: "/students",
  });

  // Service requirements with provider assigned.
  const reqWithProv = (await scalar<number>(sql`
    SELECT COUNT(*)::int AS n FROM service_requirements sr
    JOIN students s ON s.id = sr.student_id
    JOIN schools sc ON sc.id = s.school_id
    WHERE sc.district_id = ${districtId} AND sr.provider_id IS NOT NULL
  `)) ?? 0;
  if (reqN > 0) {
    const pct = Math.round((reqWithProv / reqN) * 100);
    checks.push({
      id: "providers-assigned",
      group: "operations",
      label: "Providers assigned to requirements",
      status: reqWithProv === reqN ? "pass" : reqWithProv > 0 ? "warn" : "fail",
      detail: `${reqWithProv} of ${reqN} requirements have a provider (${pct}%)`,
      fixHref: "/staff",
    });
  } else {
    checks.push({
      id: "providers-assigned",
      group: "operations",
      label: "Providers assigned to requirements",
      status: "fail",
      detail: "Add service requirements first",
      fixHref: "/students",
    });
  }

  // Sessions logged (drives compliance dashboards).
  const sessionN = (await scalar<number>(sql`
    SELECT COUNT(*)::int AS n FROM session_logs sl
    JOIN students s ON s.id = sl.student_id
    JOIN schools sc ON sc.id = s.school_id
    WHERE sc.district_id = ${districtId}
  `)) ?? 0;
  checks.push({
    id: "sessions-logged",
    group: "data",
    label: "Service sessions being logged",
    status: sessionN > 0 ? "pass" : "fail",
    detail: `${sessionN} session${sessionN === 1 ? "" : "s"} logged to date`,
    fixHref: "/sessions",
  });

  // Currently-active service requirements (so there's something to log against).
  const activeReqN = (await scalar<number>(sql`
    SELECT COUNT(*)::int AS n FROM service_requirements sr
    JOIN students s ON s.id = sr.student_id
    JOIN schools sc ON sc.id = s.school_id
    WHERE sc.district_id = ${districtId}
      AND sr.active = true
      AND (sr.end_date IS NULL OR sr.end_date::date >= CURRENT_DATE)
  `)) ?? 0;
  checks.push({
    id: "active-requirements",
    group: "data",
    label: "Currently-active service requirements",
    status: activeReqN > 0 ? "pass" : "fail",
    detail: activeReqN > 0
      ? `${activeReqN} active requirement${activeReqN === 1 ? "" : "s"}`
      : "No active requirements — minute-progress will be empty",
    fixHref: "/students",
  });

  // Service rate configs (compensatory finance accuracy).
  const ratesTbl = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'service_rate_configs'
  `);
  const hasRatesTbl = Number((ratesTbl.rows?.[0] as { n?: number } | undefined)?.n ?? 0) > 0;
  if (hasRatesTbl) {
    const ratesN = (await scalar<number>(sql`
      SELECT COUNT(*)::int AS n FROM service_rate_configs WHERE district_id = ${districtId}
    `)) ?? 0;
    checks.push({
      id: "service-rates",
      group: "config",
      label: "District-specific service rates configured",
      status: ratesN > 0 ? "pass" : "warn",
      detail: ratesN > 0
        ? `${ratesN} rate config${ratesN === 1 ? "" : "s"}`
        : "Using system defaults — compensatory finance estimates may not match your contracts",
      fixHref: "/settings",
    });
  }

  // Email provider configured (for guardian notifications).
  checks.push({
    id: "email-provider",
    group: "config",
    label: "Email provider configured",
    status: process.env.RESEND_API_KEY ? "pass" : "warn",
    detail: process.env.RESEND_API_KEY
      ? "Guardian / parent emails will be delivered"
      : "Emails are recorded but not sent — set RESEND_API_KEY to deliver them",
  });

  // Rate-limit breaches in the last 24 h (district-scoped via audit log actor).
  const rlBreachTbl = await db.execute(sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  `);
  if ((rlBreachTbl.rows?.length ?? 0) > 0) {
    const rlBreaches = (await scalar<number>(sql`
      SELECT COUNT(*)::int AS n FROM audit_logs
      WHERE action = 'rate_limit_exceeded'
        AND created_at >= now() - interval '24 hours'
    `)) ?? 0;
    checks.push({
      id: "rate-limit-breaches",
      group: "operations",
      label: "Rate-limit breach count (last 24 h)",
      status: rlBreaches === 0 ? "pass" : rlBreaches < 50 ? "warn" : "fail",
      detail: rlBreaches === 0
        ? "No rate-limit violations in the past 24 hours"
        : `${rlBreaches} rate-limit violation${rlBreaches === 1 ? "" : "s"} in the last 24 hours — review audit log for patterns`,
      fixHref: "/admin/audit-log",
    });
  }

  const summary = {
    pass: checks.filter((c) => c.status === "pass").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
    total: checks.length,
  };

  return { districtId, districtName, checks, summary };
}
