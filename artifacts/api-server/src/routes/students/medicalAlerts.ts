import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
// tenant-scope: district-join
  medicalAlertsTable, MEDICAL_ALERT_TYPES, MEDICAL_ALERT_SEVERITIES,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import { assertStudentAccess } from "../../lib/tenantAccess";
import type { AuthedRequest } from "../../middlewares/auth";
import { studentIdParamGuard } from "./idGuard";

const router: IRouter = Router();
router.param("id", studentIdParamGuard);

const EC_WRITE_ROLES = ["admin", "case_manager"] as const;
const EC_READ_ROLES = ["admin", "case_manager", "sped_teacher", "para", "provider", "coordinator", "bcba"] as const;

router.get("/students/:id/medical-alerts", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_READ_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const studentId = Number(req.params.id);
  if (!studentId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await assertStudentAccess(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const alerts = await db
    .select()
    .from(medicalAlertsTable)
    .where(eq(medicalAlertsTable.studentId, studentId))
    .orderBy(desc(medicalAlertsTable.createdAt));

  res.json(alerts.map(a => ({ ...a, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() })));
});

router.post("/students/:id/medical-alerts", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_WRITE_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const studentId = Number(req.params.id);
  if (!studentId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await assertStudentAccess(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const { alertType, description, severity, treatmentNotes, epiPenOnFile, notifyAllStaff } = req.body;
  if (!alertType || !description || !severity) {
    res.status(400).json({ error: "alertType, description, and severity are required" }); return;
  }
  if (!(MEDICAL_ALERT_TYPES as readonly string[]).includes(alertType)) {
    res.status(400).json({ error: `Invalid alertType. Must be one of: ${MEDICAL_ALERT_TYPES.join(", ")}` }); return;
  }
  if (!(MEDICAL_ALERT_SEVERITIES as readonly string[]).includes(severity)) {
    res.status(400).json({ error: `Invalid severity. Must be one of: ${MEDICAL_ALERT_SEVERITIES.join(", ")}` }); return;
  }

  const [alert] = await db.insert(medicalAlertsTable).values({
    studentId,
    alertType,
    description,
    severity,
    treatmentNotes: treatmentNotes ?? null,
    epiPenOnFile: epiPenOnFile ?? false,
    notifyAllStaff: notifyAllStaff ?? false,
  }).returning();

  logAudit(req, {
    action: "create",
    targetTable: "medical_alerts",
    targetId: alert.id,
    studentId,
    summary: `Added medical alert (${alertType}, ${severity}) for student #${studentId}`,
    newValues: { alertType, description, severity } as Record<string, unknown>,
  });

  res.status(201).json({ ...alert, createdAt: alert.createdAt.toISOString(), updatedAt: alert.updatedAt.toISOString() });
});

router.patch("/medical-alerts/:id", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_WRITE_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const alertId = Number(req.params.id);
  if (!alertId) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existingAlert] = await db.select({ studentId: medicalAlertsTable.studentId }).from(medicalAlertsTable).where(eq(medicalAlertsTable.id, alertId));
  if (!existingAlert) { res.status(404).json({ error: "Medical alert not found" }); return; }
  if (!await assertStudentAccess(req, existingAlert.studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const { alertType, description, severity, treatmentNotes, epiPenOnFile, notifyAllStaff } = req.body;

  if (alertType !== undefined && !(MEDICAL_ALERT_TYPES as readonly string[]).includes(alertType)) {
    res.status(400).json({ error: `Invalid alertType. Must be one of: ${MEDICAL_ALERT_TYPES.join(", ")}` }); return;
  }
  if (severity !== undefined && !(MEDICAL_ALERT_SEVERITIES as readonly string[]).includes(severity)) {
    res.status(400).json({ error: `Invalid severity. Must be one of: ${MEDICAL_ALERT_SEVERITIES.join(", ")}` }); return;
  }

  type AlertPatch = Partial<typeof medicalAlertsTable.$inferInsert>;
  const updates: AlertPatch = {};
  if (alertType !== undefined) updates.alertType = alertType;
  if (description !== undefined) updates.description = description;
  if (severity !== undefined) updates.severity = severity;
  if (treatmentNotes !== undefined) updates.treatmentNotes = treatmentNotes;
  if (epiPenOnFile !== undefined) updates.epiPenOnFile = epiPenOnFile;
  if (notifyAllStaff !== undefined) updates.notifyAllStaff = notifyAllStaff;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  const [alert] = await db
    .update(medicalAlertsTable)
    .set(updates)
    .where(eq(medicalAlertsTable.id, alertId))
    .returning();

  if (!alert) { res.status(404).json({ error: "Medical alert not found" }); return; }

  logAudit(req, {
    action: "update",
    targetTable: "medical_alerts",
    targetId: alertId,
    studentId: alert.studentId,
    summary: `Updated medical alert #${alertId}`,
    newValues: updates as Record<string, unknown>,
  });

  res.json({ ...alert, createdAt: alert.createdAt.toISOString(), updatedAt: alert.updatedAt.toISOString() });
});

router.delete("/medical-alerts/:id", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_WRITE_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const alertId = Number(req.params.id);
  if (!alertId) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existingAlert] = await db.select({ studentId: medicalAlertsTable.studentId }).from(medicalAlertsTable).where(eq(medicalAlertsTable.id, alertId));
  if (!existingAlert) { res.status(404).json({ error: "Medical alert not found" }); return; }
  if (!await assertStudentAccess(req, existingAlert.studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const [deleted] = await db
    .delete(medicalAlertsTable)
    .where(eq(medicalAlertsTable.id, alertId))
    .returning({ id: medicalAlertsTable.id, studentId: medicalAlertsTable.studentId });

  if (!deleted) { res.status(404).json({ error: "Medical alert not found" }); return; }

  logAudit(req, {
    action: "delete",
    targetTable: "medical_alerts",
    targetId: alertId,
    studentId: deleted.studentId,
    summary: `Deleted medical alert #${alertId}`,
  });

  res.json({ success: true });
});

export default router;
