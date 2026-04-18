// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertsTable, studentsTable, staffTable } from "@workspace/db";
import {
  ListAlertsQueryParams,
  ResolveAlertParams,
  ResolveAlertBody,
  BulkResolveAlertsBody,
  SnoozeAlertParams,
} from "@workspace/api-zod";
import { eq, and, desc, sql, inArray, gt, isNull, isNotNull, or, count } from "drizzle-orm";
import { runComplianceChecks } from "../lib/complianceEngine";
import { runComplianceBreachAlerts, runDistrictBreachAlerts } from "../lib/complianceBreachAlerts";
import { districtsTable } from "@workspace/db";
import { requireRoles, getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import { assertAlertInCallerDistrict, filterAlertIdsInCallerDistrict } from "../lib/districtScope";

const requireBreachAdmin = requireRoles("admin", "coordinator");

const router: IRouter = Router();

function alertToJson(a: any) {
  return {
    ...a,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    resolvedAt: a.resolvedAt instanceof Date ? a.resolvedAt.toISOString() : a.resolvedAt,
    snoozedUntil: a.snoozedUntil instanceof Date ? a.snoozedUntil.toISOString() : a.snoozedUntil ?? null,
  };
}

router.get("/alerts", async (req, res): Promise<void> => {
  const params = ListAlertsQueryParams.safeParse(req.query);
  const conditions: any[] = [];
  if (params.success) {
    if (params.data.severity) conditions.push(eq(alertsTable.severity, params.data.severity));
    if (params.data.resolved === "true") conditions.push(eq(alertsTable.resolved, true));
    else if (params.data.resolved === "false") conditions.push(eq(alertsTable.resolved, false));

    if (params.data.snoozed === "true") {
      conditions.push(gt(alertsTable.snoozedUntil, new Date()));
    } else if (params.data.snoozed === "false") {
      conditions.push(or(isNull(alertsTable.snoozedUntil), sql`${alertsTable.snoozedUntil} <= NOW()`));
    }

    if (params.data.studentId) conditions.push(eq(alertsTable.studentId, Number(params.data.studentId)));
    if (params.data.staffId) conditions.push(eq(alertsTable.staffId, Number(params.data.staffId)));
    if (params.data.type) conditions.push(eq(alertsTable.type, params.data.type));
    if (params.data.schoolId) conditions.push(sql`${alertsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${Number(params.data.schoolId)})`);
    if (params.data.districtId) conditions.push(sql`${alertsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${Number(params.data.districtId)}))`);
  }

  const rawLimit = req.query.limit ? parseInt(String(req.query.limit), 10) : NaN;
  const rawOffset = req.query.offset ? parseInt(String(req.query.offset), 10) : NaN;
  const pageSize = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 200;
  const pageOffset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [alerts, totalResult] = await Promise.all([
    db
      .select({
        id: alertsTable.id,
        type: alertsTable.type,
        severity: alertsTable.severity,
        studentId: alertsTable.studentId,
        staffId: alertsTable.staffId,
        serviceRequirementId: alertsTable.serviceRequirementId,
        message: alertsTable.message,
        suggestedAction: alertsTable.suggestedAction,
        resolved: alertsTable.resolved,
        resolvedAt: alertsTable.resolvedAt,
        resolvedNote: alertsTable.resolvedNote,
        snoozedUntil: alertsTable.snoozedUntil,
        createdAt: alertsTable.createdAt,
        studentFirst: studentsTable.firstName,
        studentLast: studentsTable.lastName,
        staffFirst: staffTable.firstName,
        staffLast: staffTable.lastName,
      })
      .from(alertsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, alertsTable.studentId))
      .leftJoin(staffTable, eq(staffTable.id, alertsTable.staffId))
      .where(whereClause)
      .orderBy(desc(alertsTable.createdAt))
      .limit(pageSize)
      .offset(pageOffset),
    db.select({ total: count() }).from(alertsTable).where(whereClause),
  ]);
  const total = totalResult[0]?.total ?? 0;

  const page = Math.floor(pageOffset / pageSize) + 1;
  res.json({
    data: alerts.map(a => ({
      ...alertToJson(a),
      studentName: a.studentFirst ? `${a.studentFirst} ${a.studentLast}` : null,
      staffName: a.staffFirst ? `${a.staffFirst} ${a.staffLast}` : null,
    })),
    total,
    page,
    pageSize,
    hasMore: pageOffset + alerts.length < total,
  });
});

router.patch("/alerts/:id/resolve", async (req, res): Promise<void> => {
  const params = ResolveAlertParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!(await assertAlertInCallerDistrict(req as unknown as AuthedRequest, params.data.id, res))) return;
  const parsed = ResolveAlertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [alert] = await db
    .update(alertsTable)
    .set({
      resolved: true,
      resolvedAt: new Date(),
      resolvedNote: parsed.data.resolvedNote,
      snoozedUntil: null,
    })
    .where(eq(alertsTable.id, params.data.id))
    .returning();

  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  res.json(alertToJson(alert));
});

router.post("/alerts/bulk-resolve", async (req, res): Promise<void> => {
  const parsed = BulkResolveAlertsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { ids, resolvedNote } = parsed.data;
  if (!ids.length) {
    res.json({ resolved: 0 });
    return;
  }

  // Tenant scope: drop any ids that don't belong to caller's district.
  const scopedIds = await filterAlertIdsInCallerDistrict(req as unknown as AuthedRequest, ids);
  if (!scopedIds.length) {
    res.json({ resolved: 0 });
    return;
  }

  const updated = await db
    .update(alertsTable)
    .set({
      resolved: true,
      resolvedAt: new Date(),
      resolvedNote: resolvedNote ?? "Bulk resolved from dashboard",
      snoozedUntil: null,
    })
    .where(inArray(alertsTable.id, scopedIds))
    .returning({ id: alertsTable.id });

  res.json({ resolved: updated.length });
});

router.patch("/alerts/:id/snooze", async (req, res): Promise<void> => {
  const params = SnoozeAlertParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!(await assertAlertInCallerDistrict(req as unknown as AuthedRequest, params.data.id, res))) return;

  const snoozedUntil = new Date();
  snoozedUntil.setDate(snoozedUntil.getDate() + 7);

  const [alert] = await db
    .update(alertsTable)
    .set({ snoozedUntil })
    .where(eq(alertsTable.id, params.data.id))
    .returning();

  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  res.json(alertToJson(alert));
});

// Scoped helper: only platform admins (no enforced district) get to scan all
// districts. District-scoped admins/coordinators are limited to their own
// district so a single tenant cannot trigger emails for other districts.
async function runBreachScanForCaller(
  req: AuthedRequest,
): Promise<{
  districtsScanned: number;
  restraintAlertsCreated: number;
  iepAlertsCreated: number;
  emailsSent: number;
  emailsSkippedNoRecipient: number;
}> {
  const callerDistrictId = getEnforcedDistrictId(req);
  if (callerDistrictId == null) {
    return runComplianceBreachAlerts();
  }
  const [district] = await db
    .select({ id: districtsTable.id, name: districtsTable.name })
    .from(districtsTable)
    .where(eq(districtsTable.id, callerDistrictId));
  if (!district) {
    return {
      districtsScanned: 0,
      restraintAlertsCreated: 0,
      iepAlertsCreated: 0,
      emailsSent: 0,
      emailsSkippedNoRecipient: 0,
    };
  }
  const r = await runDistrictBreachAlerts(district.id, district.name);
  return { districtsScanned: 1, ...r };
}

router.post("/alerts/run-checks", requireBreachAdmin, async (req, res): Promise<void> => {
  const result = await runComplianceChecks();
  const breachResult = await runBreachScanForCaller(req as AuthedRequest);
  res.json({
    newAlerts: result.newAlerts,
    resolvedAlerts: result.resolvedAlerts,
    restraintBreachAlerts: breachResult.restraintAlertsCreated,
    iepTimelineBreachAlerts: breachResult.iepAlertsCreated,
    breachAlertEmailsSent: breachResult.emailsSent,
    message:
      `Compliance check complete. Created ${result.newAlerts} new alerts, resolved ${result.resolvedAlerts} old alerts. ` +
      `Compliance breach scan: ${breachResult.restraintAlertsCreated} restraint, ${breachResult.iepAlertsCreated} IEP timeline alerts created; ${breachResult.emailsSent} emails sent.`,
  });
});

router.post("/alerts/run-compliance-breach-checks", requireBreachAdmin, async (req, res): Promise<void> => {
  const result = await runBreachScanForCaller(req as AuthedRequest);
  res.json({
    ...result,
    message:
      `Compliance breach scan complete across ${result.districtsScanned} district(s): ` +
      `${result.restraintAlertsCreated} restraint alerts, ${result.iepAlertsCreated} IEP timeline alerts, ` +
      `${result.emailsSent} emails sent` +
      (result.emailsSkippedNoRecipient > 0
        ? ` (${result.emailsSkippedNoRecipient} skipped — no admin on file).`
        : "."),
  });
});

export default router;
