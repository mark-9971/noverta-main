import { Router, type IRouter, type Request, type Response } from "express";
import { db, restraintIncidentsTable, incidentSignaturesTable, incidentStatusHistoryTable, studentsTable, staffTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import { getPublicMetaAsync } from "../../lib/clerkClaims";
import { registerIncidentIdParam } from "./utils";

// tenant-scope: district-join
const router: IRouter = Router();
registerIncidentIdParam(router);

router.post("/protective-measures/incidents/:id/transition", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { toStatus, note } = req.body;
  if (!toStatus || !note?.trim()) {
    res.status(400).json({ error: "toStatus and note are required" });
    return;
  }

  const actorStaffId = (await getPublicMetaAsync(req)).staffId ?? null;

  const VALID_TRANSITIONS: Record<string, string[]> = {
    draft: ["open"],
    draft_quick: ["open"],
    open: ["under_review"],
    under_review: ["resolved", "open"],
    resolved: ["dese_reported"],
    dese_reported: [],
  };

  const [existing] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const allowedNext = VALID_TRANSITIONS[existing.status] ?? [];
  if (!allowedNext.includes(toStatus)) {
    res.status(400).json({ error: `Cannot transition from '${existing.status}' to '${toStatus}'. Allowed: ${allowedNext.join(", ") || "none"}` });
    return;
  }

  const TERMINAL_TRANSITIONS = new Set(["under_review", "resolved", "dese_reported"]);
  if (TERMINAL_TRANSITIONS.has(toStatus) && !actorStaffId) {
    res.status(401).json({ error: "Actor identity required for terminal transitions. Ensure your session is authenticated." });
    return;
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { status: toStatus };

  if (toStatus === "resolved" || toStatus === "dese_reported") {
    updateData.resolutionNote = note.trim();
    updateData.resolvedAt = now;
    updateData.resolvedBy = actorStaffId;
  }
  if (toStatus === "under_review" && !existing.adminReviewedAt) {
    updateData.adminReviewNotes = note.trim();
    updateData.adminReviewedAt = now.split("T")[0];
    updateData.adminReviewedBy = actorStaffId;
  }

  const [updated] = await db.update(restraintIncidentsTable).set(updateData).where(eq(restraintIncidentsTable.id, id)).returning();

  await db.insert(incidentStatusHistoryTable).values({
    incidentId: id,
    fromStatus: existing.status,
    toStatus,
    note: note.trim(),
    actorStaffId: actorStaffId ?? undefined,
  });

  logAudit(req, {
    action: "update",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: existing.studentId,
    summary: `Status transition: ${existing.status} → ${toStatus} on incident #${id}`,
    oldValues: { status: existing.status } as Record<string, unknown>,
    newValues: { status: toStatus, note: note.trim() } as Record<string, unknown>,
  });

  res.json(updated);
});

router.get("/protective-measures/incidents/:id/status-history", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const history = await db
    .select({
      id: incidentStatusHistoryTable.id,
      incidentId: incidentStatusHistoryTable.incidentId,
      fromStatus: incidentStatusHistoryTable.fromStatus,
      toStatus: incidentStatusHistoryTable.toStatus,
      note: incidentStatusHistoryTable.note,
      actorStaffId: incidentStatusHistoryTable.actorStaffId,
      actorFirst: staffTable.firstName,
      actorLast: staffTable.lastName,
      createdAt: incidentStatusHistoryTable.createdAt,
    })
    .from(incidentStatusHistoryTable)
    .leftJoin(staffTable, eq(incidentStatusHistoryTable.actorStaffId, staffTable.id))
    .where(eq(incidentStatusHistoryTable.incidentId, id))
    .orderBy(desc(incidentStatusHistoryTable.createdAt));

  res.json(history);
});

// DEPRECATED — use POST /protective-measures/incidents/:id/transition with { toStatus: "under_review", note }
// Kept as 410 Gone so any stale clients get a clear error instead of a silent failure.
router.post("/protective-measures/incidents/:id/admin-review", (_req: Request, res: Response) => {
  res.status(410).json({
    error: "This endpoint has been removed. Use POST /protective-measures/incidents/:id/transition with { toStatus: \"under_review\", note } instead.",
    replacement: "/protective-measures/incidents/:id/transition",
  });
});

router.post("/protective-measures/incidents/:id/dese-report", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const actorStaffId = (await getPublicMetaAsync(req)).staffId ?? null;
  if (!actorStaffId) {
    res.status(401).json({ error: "Authenticated actor identity required to file DESE report." });
    return;
  }

  const { thirtyDayLogSent, note } = req.body;
  if (!note || !String(note).trim()) {
    res.status(400).json({ error: "A note is required when filing a DESE report." });
    return;
  }

  const [existing] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (existing.status !== "resolved") {
    res.status(400).json({ error: `DESE report requires incident to be in 'resolved' status. Current status: '${existing.status}'.` });
    return;
  }

  const now = new Date().toISOString();
  const dateOnly = now.split("T")[0];
  const updates: Record<string, unknown> = {
    deseReportSentAt: dateOnly,
    status: "dese_reported",
    resolutionNote: String(note).trim(),
    resolvedAt: existing.resolvedAt ?? now,
    resolvedBy: existing.resolvedBy ?? actorStaffId,
  };
  if (thirtyDayLogSent) updates.thirtyDayLogSentToDese = true;

  const [updated] = await db.update(restraintIncidentsTable).set(updates).where(eq(restraintIncidentsTable.id, id)).returning();

  await db.insert(incidentStatusHistoryTable).values({
    incidentId: id,
    fromStatus: existing.status,
    toStatus: "dese_reported",
    note: String(note).trim(),
    actorStaffId: Number(actorStaffId),
  });

  logAudit(req, {
    action: "update",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: existing.studentId,
    summary: `DESE report filed for restraint incident #${id}`,
    oldValues: { status: existing.status } as Record<string, unknown>,
    newValues: { status: "dese_reported", deseReportSentAt: dateOnly } as Record<string, unknown>,
  });
  res.json(updated);
});

router.post("/protective-measures/incidents/:id/signature", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { type, name } = req.body;
  if (!type || !name) { res.status(400).json({ error: "type and name required" }); return; }
  if (type !== "reporting_staff" && type !== "admin") { res.status(400).json({ error: "type must be 'reporting_staff' or 'admin'" }); return; }

  const [existing] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const now = new Date().toISOString();
  const updates: any = {};
  if (type === "reporting_staff") {
    updates.reportingStaffSignature = name;
    updates.reportingStaffSignedAt = now;
  } else {
    updates.adminSignature = name;
    updates.adminSignedAt = now;
  }

  const [updated] = await db.update(restraintIncidentsTable).set(updates).where(eq(restraintIncidentsTable.id, id)).returning();
  logAudit(req, {
    action: "update",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: existing.studentId,
    summary: `${type} signature added to restraint incident #${id}`,
  });
  res.json(updated);
});

router.get("/protective-measures/incidents/:id/signatures", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const sigs = await db
    .select({
      id: incidentSignaturesTable.id,
      incidentId: incidentSignaturesTable.incidentId,
      staffId: incidentSignaturesTable.staffId,
      staffFirstName: staffTable.firstName,
      staffLastName: staffTable.lastName,
      staffTitle: staffTable.title,
      staffRole: staffTable.role,
      role: incidentSignaturesTable.role,
      signatureName: incidentSignaturesTable.signatureName,
      signedAt: incidentSignaturesTable.signedAt,
      requestedAt: incidentSignaturesTable.requestedAt,
      status: incidentSignaturesTable.status,
      notes: incidentSignaturesTable.notes,
    })
    .from(incidentSignaturesTable)
    .leftJoin(staffTable, eq(incidentSignaturesTable.staffId, staffTable.id))
    .where(eq(incidentSignaturesTable.incidentId, id))
    .orderBy(incidentSignaturesTable.requestedAt);

  res.json(sigs);
});

router.post("/protective-measures/incidents/:id/signatures/:sigId/sign", async (req: Request, res: Response) => {
  const incidentId = Number(req.params.id);
  const sigId = Number(req.params.sigId);
  if (isNaN(incidentId) || isNaN(sigId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { signatureName, notes } = req.body;
  if (!signatureName) { res.status(400).json({ error: "signatureName required" }); return; }

  const [existing] = await db.select().from(incidentSignaturesTable)
    .where(and(eq(incidentSignaturesTable.id, sigId), eq(incidentSignaturesTable.incidentId, incidentId)));
  if (!existing) { res.status(404).json({ error: "Signature request not found" }); return; }

  if (existing.status !== "pending") {
    res.status(400).json({ error: "Signature has already been completed" });
    return;
  }

  const now = new Date().toISOString();
  const [updated] = await db.update(incidentSignaturesTable).set({
    signatureName,
    signedAt: now,
    status: "signed",
    notes: notes || existing.notes,
  }).where(eq(incidentSignaturesTable.id, sigId)).returning();

  if (existing.role === "reporting_staff") {
    await db.update(restraintIncidentsTable).set({
      reportingStaffSignature: signatureName,
      reportingStaffSignedAt: now,
    }).where(eq(restraintIncidentsTable.id, incidentId));
  }

  if (existing.role === "admin_reviewer") {
    const [incident] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, incidentId));
    if (incident && !incident.adminSignature) {
      await db.update(restraintIncidentsTable).set({
        adminSignature: signatureName,
        adminSignedAt: now,
        adminReviewedBy: existing.staffId,
        adminReviewedAt: now.split("T")[0],
      }).where(eq(restraintIncidentsTable.id, incidentId));
    }
  }

  logAudit(req, {
    action: "update",
    targetTable: "incident_signatures",
    targetId: sigId,
    summary: `Signature signed for incident #${incidentId} (role: ${existing.role})`,
  });
  res.json(updated);
});

router.post("/protective-measures/incidents/:id/signatures/request", async (req: Request, res: Response) => {
  const incidentId = Number(req.params.id);
  if (isNaN(incidentId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { staffId, role } = req.body;
  if (!staffId || !role) { res.status(400).json({ error: "staffId and role required" }); return; }

  const [existingIncident] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, incidentId));
  if (!existingIncident) { res.status(404).json({ error: "Incident not found" }); return; }

  const [existingSig] = await db.select().from(incidentSignaturesTable)
    .where(and(
      eq(incidentSignaturesTable.incidentId, incidentId),
      eq(incidentSignaturesTable.staffId, Number(staffId)),
      eq(incidentSignaturesTable.role, role),
    ));
  if (existingSig) {
    res.status(409).json({ error: "Signature request already exists for this staff member and role", existing: existingSig });
    return;
  }

  const now = new Date().toISOString();
  const [sig] = await db.insert(incidentSignaturesTable).values({
    incidentId,
    staffId: Number(staffId),
    role,
    requestedAt: now,
    status: "pending",
  }).returning();

  logAudit(req, {
    action: "create",
    targetTable: "incident_signatures",
    targetId: sig.id,
    summary: `Signature request created for incident #${incidentId} (staff #${staffId}, role: ${role})`,
    newValues: { incidentId, staffId: Number(staffId), role, status: "pending" } as Record<string, unknown>,
  });
  res.status(201).json(sig);
});

router.get("/protective-measures/pending-signatures", async (req: Request, res: Response) => {
  const { staffId } = req.query;
  const conditions: any[] = [eq(incidentSignaturesTable.status, "pending")];
  if (staffId) conditions.push(eq(incidentSignaturesTable.staffId, Number(staffId)));

  const pending = await db
    .select({
      id: incidentSignaturesTable.id,
      incidentId: incidentSignaturesTable.incidentId,
      staffId: incidentSignaturesTable.staffId,
      role: incidentSignaturesTable.role,
      requestedAt: incidentSignaturesTable.requestedAt,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      incidentDate: restraintIncidentsTable.incidentDate,
      incidentType: restraintIncidentsTable.incidentType,
    })
    .from(incidentSignaturesTable)
    .innerJoin(restraintIncidentsTable, eq(incidentSignaturesTable.incidentId, restraintIncidentsTable.id))
    .leftJoin(studentsTable, eq(restraintIncidentsTable.studentId, studentsTable.id))
    .where(and(...conditions))
    .orderBy(desc(incidentSignaturesTable.requestedAt));

  res.json(pending);
});

export default router;
