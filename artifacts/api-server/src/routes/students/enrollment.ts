import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { studentsTable, staffTable, enrollmentEventsTable } from "@workspace/db";
import { GetStudentParams } from "@workspace/api-zod";
import { eq, and, desc, isNull } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import type { AuthedRequest } from "../../middlewares/auth";
import { studentIdParamGuard } from "./idGuard";

// tenant-scope: district-join
const router: IRouter = Router();
router.param("id", studentIdParamGuard);

const ENROLLMENT_EDIT_ROLES = ["admin", "case_manager"] as const;
const ENROLLMENT_READ_ROLES = ["admin", "case_manager", "sped_teacher", "coordinator", "bcba"] as const;

router.get("/students/:id/enrollment", async (req, res): Promise<void> => {
  const authRole = (req as AuthedRequest).trellisRole;
  if (!(ENROLLMENT_READ_ROLES as readonly string[]).includes(authRole ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const params = GetStudentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const events = await db
    .select({
      id: enrollmentEventsTable.id,
      studentId: enrollmentEventsTable.studentId,
      eventType: enrollmentEventsTable.eventType,
      eventDate: enrollmentEventsTable.eventDate,
      source: enrollmentEventsTable.source,
      reasonCode: enrollmentEventsTable.reasonCode,
      reason: enrollmentEventsTable.reason,
      notes: enrollmentEventsTable.notes,
      fromSchoolId: enrollmentEventsTable.fromSchoolId,
      toSchoolId: enrollmentEventsTable.toSchoolId,
      fromProgramId: enrollmentEventsTable.fromProgramId,
      toProgramId: enrollmentEventsTable.toProgramId,
      performedById: enrollmentEventsTable.performedById,
      performedByFirst: staffTable.firstName,
      performedByLast: staffTable.lastName,
      recordedById: enrollmentEventsTable.recordedById,
      createdAt: enrollmentEventsTable.createdAt,
    })
    .from(enrollmentEventsTable)
    .leftJoin(staffTable, eq(staffTable.id, enrollmentEventsTable.performedById))
    .where(eq(enrollmentEventsTable.studentId, params.data.id))
    .orderBy(desc(enrollmentEventsTable.eventDate));

  logAudit(req, {
    action: "read",
    targetTable: "enrollment_events",
    studentId: params.data.id,
    summary: `Viewed enrollment history for student #${params.data.id}`,
  });

  res.json(events.map(e => ({ ...e, createdAt: e.createdAt.toISOString() })));
});

router.post("/students/:id/enrollment", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(ENROLLMENT_EDIT_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const params = GetStudentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const { eventType, eventDate, reasonCode, reason, notes, performedById, fromSchoolId, toSchoolId, fromProgramId, toProgramId } = req.body;
  if (!eventType || !eventDate) { res.status(400).json({ error: "eventType and eventDate are required" }); return; }

  const VALID_EVENT_TYPES = new Set([
    "enrolled", "reactivated", "withdrawn", "transferred_in", "transferred_out",
    "program_change", "graduated", "suspended", "leave_of_absence", "note",
  ]);
  if (!VALID_EVENT_TYPES.has(eventType)) {
    res.status(400).json({ error: `Invalid eventType '${eventType}'. Must be one of: ${[...VALID_EVENT_TYPES].join(", ")}` }); return;
  }

  const VALID_REASON_CODES = new Set(["graduation", "transfer", "family_move", "program_completion", "other"]);
  if (reasonCode !== undefined && reasonCode !== null && reasonCode !== "" && !VALID_REASON_CODES.has(reasonCode)) {
    res.status(400).json({ error: `Invalid reasonCode '${reasonCode}'. Must be one of: ${[...VALID_REASON_CODES].join(", ")}` }); return;
  }

  const LIFECYCLE_STATUS: Record<string, string> = {
    enrolled: "active",
    reactivated: "active",
    transferred_in: "active",
    withdrawn: "inactive",
    suspended: "inactive",
    leave_of_absence: "inactive",
    transferred_out: "transferred",
    graduated: "graduated",
  };

  const [event] = await db.transaction(async (tx) => {
    const [ev] = await tx.insert(enrollmentEventsTable).values({
      studentId: params.data.id,
      eventType,
      eventDate,
      source: "manual",
      reasonCode: reasonCode ?? null,
      reason: reason ?? null,
      notes: notes ?? null,
      fromSchoolId: fromSchoolId ? Number(fromSchoolId) : null,
      toSchoolId: toSchoolId ? Number(toSchoolId) : null,
      fromProgramId: fromProgramId ? Number(fromProgramId) : null,
      toProgramId: toProgramId ? Number(toProgramId) : null,
      performedById: performedById ? Number(performedById) : null,
      recordedById: null,
    }).returning();

    const newStatus = LIFECYCLE_STATUS[eventType];
    if (newStatus) {
      if (newStatus === "active") {
        await tx.update(studentsTable)
          .set({ status: "active", enrolledAt: eventDate, withdrawnAt: null })
          .where(and(eq(studentsTable.id, params.data.id), isNull(studentsTable.deletedAt)));
      } else {
        await tx.update(studentsTable)
          .set({ status: newStatus, withdrawnAt: eventDate })
          .where(and(eq(studentsTable.id, params.data.id), isNull(studentsTable.deletedAt)));
      }
    }

    return [ev];
  });

  logAudit(req, {
    action: "create",
    targetTable: "enrollment_events",
    targetId: event.id,
    studentId: params.data.id,
    summary: `Logged enrollment event '${eventType}' for student #${params.data.id}`,
    newValues: { eventType, eventDate, reasonCode, reason, notes } as Record<string, unknown>,
  });

  res.status(201).json({ ...event, createdAt: event.createdAt.toISOString(), updatedAt: event.updatedAt.toISOString() });
});

router.patch("/students/:id/enrollment/:eventId", async (req, res): Promise<void> => {
  const patchRole = (req as AuthedRequest).trellisRole;
  if (!(ENROLLMENT_EDIT_ROLES as readonly string[]).includes(patchRole ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const studentId = Number(req.params.id);
  const eventId = Number(req.params.eventId);
  if (!studentId || !eventId) { res.status(400).json({ error: "Invalid id" }); return; }

  const { eventType, eventDate, reasonCode, reason, notes } = req.body;

  const VALID_EVENT_TYPES_PATCH = new Set([
    "enrolled", "reactivated", "withdrawn", "transferred_in", "transferred_out",
    "program_change", "graduated", "suspended", "leave_of_absence", "note",
  ]);
  if (eventType !== undefined && !VALID_EVENT_TYPES_PATCH.has(eventType)) {
    res.status(400).json({ error: `Invalid eventType '${eventType}'.` }); return;
  }

  const VALID_REASON_CODES_PATCH = new Set(["graduation", "transfer", "family_move", "program_completion", "other"]);
  if (reasonCode !== undefined && reasonCode !== null && reasonCode !== "" && !VALID_REASON_CODES_PATCH.has(reasonCode)) {
    res.status(400).json({ error: `Invalid reasonCode '${reasonCode}'.` }); return;
  }

  type EventPatch = Partial<Pick<typeof enrollmentEventsTable.$inferInsert, "eventType" | "eventDate" | "reasonCode" | "reason" | "notes">>;
  const updates: EventPatch = {};
  if (eventType !== undefined) updates.eventType = eventType;
  if (eventDate !== undefined) updates.eventDate = eventDate;
  if (reasonCode !== undefined) updates.reasonCode = reasonCode;
  if (reason !== undefined) updates.reason = reason;
  if (notes !== undefined) updates.notes = notes;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  const LIFECYCLE_STATUS_PATCH: Record<string, string> = {
    enrolled: "active",
    reactivated: "active",
    transferred_in: "active",
    withdrawn: "inactive",
    suspended: "inactive",
    leave_of_absence: "inactive",
    transferred_out: "transferred",
    graduated: "graduated",
  };

  const updated = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ eventType: enrollmentEventsTable.eventType, eventDate: enrollmentEventsTable.eventDate })
      .from(enrollmentEventsTable)
      .where(and(eq(enrollmentEventsTable.id, eventId), eq(enrollmentEventsTable.studentId, studentId)));
    if (!current) return null;

    const [ev] = await tx
      .update(enrollmentEventsTable)
      .set(updates)
      .where(and(eq(enrollmentEventsTable.id, eventId), eq(enrollmentEventsTable.studentId, studentId)))
      .returning();

    const effectiveType = updates.eventType ?? current.eventType;
    const effectiveDate = updates.eventDate ?? current.eventDate;
    const newStatus = LIFECYCLE_STATUS_PATCH[effectiveType];
    if (newStatus && (updates.eventType !== undefined || updates.eventDate !== undefined)) {
      if (newStatus === "active") {
        await tx.update(studentsTable)
          .set({ status: "active", enrolledAt: effectiveDate, withdrawnAt: null })
          .where(and(eq(studentsTable.id, studentId), isNull(studentsTable.deletedAt)));
      } else {
        await tx.update(studentsTable)
          .set({ status: newStatus, withdrawnAt: effectiveDate })
          .where(and(eq(studentsTable.id, studentId), isNull(studentsTable.deletedAt)));
      }
    }

    return ev;
  });

  if (!updated) { res.status(404).json({ error: "Event not found" }); return; }

  logAudit(req, {
    action: "update",
    targetTable: "enrollment_events",
    targetId: eventId,
    studentId,
    summary: `Updated enrollment event #${eventId} for student #${studentId}`,
    newValues: updates as Record<string, unknown>,
  });

  res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
});

router.post("/students/:id/archive", async (req, res): Promise<void> => {
  const params = GetStudentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const archiveRole = (req as AuthedRequest).trellisRole;
  if (archiveRole !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const today = new Date().toISOString().slice(0, 10);
  const { reason, notes } = req.body;

  const { updated, event } = await db.transaction(async (tx) => {
    const [stu] = await tx
      .update(studentsTable)
      .set({ status: "inactive", withdrawnAt: today })
      .where(and(eq(studentsTable.id, params.data.id), isNull(studentsTable.deletedAt)))
      .returning({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName });
    if (!stu) return { updated: null, event: null };
    const [ev] = await tx.insert(enrollmentEventsTable).values({
      studentId: params.data.id,
      eventType: "withdrawn",
      eventDate: today,
      reason: reason ?? null,
      notes: notes ?? null,
      performedById: null,
    }).returning();
    return { updated: stu, event: ev };
  });

  if (!updated) { res.status(404).json({ error: "Student not found" }); return; }

  logAudit(req, {
    action: "update",
    targetTable: "students",
    targetId: params.data.id,
    studentId: params.data.id,
    summary: `Archived student ${updated.firstName} ${updated.lastName} (status → inactive)`,
    newValues: { status: "inactive", withdrawnAt: today, reason } as Record<string, unknown>,
  });

  res.json({ success: true, eventId: event!.id });
});

router.post("/students/:id/reactivate", async (req, res): Promise<void> => {
  const params = GetStudentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const reactivateRole = (req as AuthedRequest).trellisRole;
  if (reactivateRole !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const today = new Date().toISOString().slice(0, 10);
  const { notes } = req.body;

  const { updated, event } = await db.transaction(async (tx) => {
    const [stu] = await tx
      .update(studentsTable)
      .set({ status: "active", enrolledAt: today, withdrawnAt: null })
      .where(and(eq(studentsTable.id, params.data.id), isNull(studentsTable.deletedAt)))
      .returning({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName });
    if (!stu) return { updated: null, event: null };
    const [ev] = await tx.insert(enrollmentEventsTable).values({
      studentId: params.data.id,
      eventType: "reactivated",
      eventDate: today,
      reason: null,
      notes: notes ?? null,
      performedById: null,
    }).returning();
    return { updated: stu, event: ev };
  });

  if (!updated) { res.status(404).json({ error: "Student not found" }); return; }

  logAudit(req, {
    action: "update",
    targetTable: "students",
    targetId: params.data.id,
    studentId: params.data.id,
    summary: `Reactivated student ${updated.firstName} ${updated.lastName} (status → active)`,
    newValues: { status: "active", enrolledAt: today } as Record<string, unknown>,
  });

  res.json({ success: true, eventId: event!.id });
});

export default router;
