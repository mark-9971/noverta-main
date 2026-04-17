import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertsTable, studentsTable, staffTable } from "@workspace/db";
import {
// tenant-scope: district-join
  ListAlertsQueryParams,
  ResolveAlertParams,
  ResolveAlertBody,
  BulkResolveAlertsBody,
  SnoozeAlertParams,
} from "@workspace/api-zod";
import { eq, and, desc, sql, inArray, gt, isNull, isNotNull, or } from "drizzle-orm";
import { runComplianceChecks } from "../lib/complianceEngine";
import type { AuthedRequest } from "../middlewares/auth";
import { assertAlertInCallerDistrict, filterAlertIdsInCallerDistrict } from "../lib/districtScope";

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

  const alerts = await db
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
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(alertsTable.createdAt));

  res.json(alerts.map(a => ({
    ...alertToJson(a),
    studentName: a.studentFirst ? `${a.studentFirst} ${a.studentLast}` : null,
    staffName: a.staffFirst ? `${a.staffFirst} ${a.staffLast}` : null,
  })));
});

router.patch("/alerts/:id/resolve", async (req, res): Promise<void> => {
  const params = ResolveAlertParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!(await assertAlertInCallerDistrict(req as AuthedRequest, params.data.id, res))) return;
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
  const scopedIds = await filterAlertIdsInCallerDistrict(req as AuthedRequest, ids);
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
  if (!(await assertAlertInCallerDistrict(req as AuthedRequest, params.data.id, res))) return;

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

router.post("/alerts/run-checks", async (req, res): Promise<void> => {
  const result = await runComplianceChecks();
  res.json({
    newAlerts: result.newAlerts,
    resolvedAlerts: result.resolvedAlerts,
    message: `Compliance check complete. Created ${result.newAlerts} new alerts, resolved ${result.resolvedAlerts} old alerts.`,
  });
});

export default router;
