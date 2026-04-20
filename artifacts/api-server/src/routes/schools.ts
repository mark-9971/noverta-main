import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { schoolsTable, programsTable, schoolCalendarExceptionsTable, schoolYearsTable, SCHOOL_CALENDAR_EXCEPTION_TYPES } from "@workspace/db";
import { ListSchoolsResponse, CreateSchoolBody, ListProgramsResponse, CreateProgramBody } from "@workspace/api-zod";
import { and, eq, gte, lte, asc } from "drizzle-orm";
import { requireRoles, getEnforcedDistrictId, type AuthedRequest } from "../middlewares/auth";

const requireSchoolAdmin = requireRoles("admin", "coordinator");
const VALID_SCHEDULE_TYPES = ["standard", "ab_day", "rotating_4", "rotating_6"] as const;
type ScheduleType = typeof VALID_SCHEDULE_TYPES[number];

const router: IRouter = Router();

function schoolToJson(s: typeof schoolsTable.$inferSelect) {
  return {
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

router.get("/schools", async (req, res): Promise<void> => {
  const enforcedDid = getEnforcedDistrictId(req as unknown as AuthedRequest);
  const where = enforcedDid != null ? eq(schoolsTable.districtId, enforcedDid) : undefined;
  const schools = await db.select().from(schoolsTable).where(where).orderBy(schoolsTable.name);
  res.json(schools.map(schoolToJson));
});

router.get("/schools/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid school id" }); return; }
  const [school] = await db.select().from(schoolsTable).where(eq(schoolsTable.id, id));
  if (!school) { res.status(404).json({ error: "School not found" }); return; }
  const enforcedDid = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (enforcedDid != null && school.districtId !== enforcedDid) {
    res.status(403).json({ error: "You don't have access to this school" });
    return;
  }
  res.json(schoolToJson(school));
});

router.patch("/schools/:id/schedule-settings", requireSchoolAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid school id" }); return; }

  const body = req.body as Record<string, unknown>;
  const { scheduleType, rotationDays, rotationStartDate, scheduleNotes } = body;

  if (scheduleType !== undefined && !VALID_SCHEDULE_TYPES.includes(scheduleType as ScheduleType)) {
    res.status(400).json({ error: "Invalid scheduleType" }); return;
  }
  if (rotationDays !== undefined && rotationDays !== null && (typeof rotationDays !== "number" || rotationDays < 2 || rotationDays > 6)) {
    res.status(400).json({ error: "rotationDays must be 2–6 or null" }); return;
  }
  if (scheduleNotes !== undefined && scheduleNotes !== null && typeof scheduleNotes === "string" && scheduleNotes.length > 500) {
    res.status(400).json({ error: "scheduleNotes too long" }); return;
  }

  const updates: Partial<typeof schoolsTable.$inferInsert> = {};
  if (scheduleType !== undefined) updates.scheduleType = scheduleType as ScheduleType;
  if (rotationDays !== undefined) updates.rotationDays = rotationDays as number | null;
  if (rotationStartDate !== undefined) updates.rotationStartDate = rotationStartDate as string | null;
  if (scheduleNotes !== undefined) updates.scheduleNotes = scheduleNotes as string | null;

  // Auto-set rotationDays based on scheduleType if not explicitly provided
  if (scheduleType && rotationDays === undefined) {
    if (scheduleType === "ab_day") updates.rotationDays = 2;
    else if (scheduleType === "rotating_4") updates.rotationDays = 4;
    else if (scheduleType === "rotating_6") updates.rotationDays = 6;
    else if (scheduleType === "standard") updates.rotationDays = null;
  }

  // Enforce district scope on UPDATE: confirm the target school belongs to caller's district.
  const enforcedDid = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (enforcedDid != null) {
    const [existing] = await db.select({ districtId: schoolsTable.districtId }).from(schoolsTable).where(eq(schoolsTable.id, id));
    if (!existing) { res.status(404).json({ error: "School not found" }); return; }
    if (existing.districtId !== enforcedDid) {
      res.status(403).json({ error: "You don't have access to this school" });
      return;
    }
  }
  const [school] = await db.update(schoolsTable).set(updates).where(eq(schoolsTable.id, id)).returning();
  if (!school) { res.status(404).json({ error: "School not found" }); return; }
  res.json(schoolToJson(school));
});

router.post("/schools", requireSchoolAdmin, async (req, res): Promise<void> => {
  const parsed = CreateSchoolBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Force districtId to caller's enforced district (non-platform users).
  const enforcedDid = getEnforcedDistrictId(req as unknown as AuthedRequest);
  const values = enforcedDid != null
    ? { ...parsed.data, districtId: enforcedDid }
    : parsed.data;
  const [school] = await db.insert(schoolsTable).values(values).returning();
  res.status(201).json(schoolToJson(school));
});

// ─── School Calendar Exceptions (School Calendar v0 — Slice 1) ────────────────
//
// Per-school day-level exceptions to the default instructional calendar
// (closures, early-release days). Read-only model for now: nothing else
// in the app reads these rows yet — minute totals, schedule blocks, the
// expected-slot calculator, and the Today view are unchanged. Later
// slices will join against this table. See migration 042.

const VALID_EXCEPTION_TYPES = SCHOOL_CALENDAR_EXCEPTION_TYPES;
type ExceptionType = typeof VALID_EXCEPTION_TYPES[number];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function exceptionToJson(e: typeof schoolCalendarExceptionsTable.$inferSelect) {
  return {
    ...e,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

/**
 * Confirm the school exists and (for non-platform users) belongs to the
 * caller's enforced district. Returns the school row on success or sends
 * the appropriate 4xx and returns null.
 */
async function loadSchoolForCaller(req: AuthedRequest, res: import("express").Response, schoolId: number) {
  const [school] = await db.select().from(schoolsTable).where(eq(schoolsTable.id, schoolId));
  if (!school) { res.status(404).json({ error: "School not found" }); return null; }
  const enforcedDid = getEnforcedDistrictId(req);
  if (enforcedDid != null && school.districtId !== enforcedDid) {
    res.status(403).json({ error: "You don't have access to this school" });
    return null;
  }
  return school;
}

/**
 * Validate a fully-resolved exception payload. Always operates on a complete
 * row shape: PATCH callers merge the existing row with their partial body
 * before invoking this so the type↔dismissalTime invariant can be checked
 * exhaustively (mirrors the DB CHECK constraint so we return 400 with a
 * clear message instead of letting a 500 leak from a constraint violation).
 */
function validateExceptionPayload(body: Record<string, unknown>): { ok: true; data: Required<Pick<typeof schoolCalendarExceptionsTable.$inferInsert, "exceptionDate" | "type" | "reason">> & { dismissalTime: string | null; notes: string | null } } | { ok: false; error: string } {
  const { exceptionDate, type, dismissalTime, reason, notes } = body;

  if (typeof exceptionDate !== "string" || !ISO_DATE_RE.test(exceptionDate)) {
    return { ok: false, error: "exceptionDate must be YYYY-MM-DD" };
  }
  if (typeof type !== "string" || !VALID_EXCEPTION_TYPES.includes(type as ExceptionType)) {
    return { ok: false, error: `type must be one of: ${VALID_EXCEPTION_TYPES.join(", ")}` };
  }
  if (dismissalTime !== undefined && dismissalTime !== null
      && (typeof dismissalTime !== "string" || !HHMM_RE.test(dismissalTime))) {
    return { ok: false, error: "dismissalTime must be HH:MM (24h) or null" };
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { ok: false, error: "reason is required" };
  }
  if (reason.length > 200) return { ok: false, error: "reason too long (max 200)" };
  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    return { ok: false, error: "notes must be string or null" };
  }
  if (typeof notes === "string" && notes.length > 1000) return { ok: false, error: "notes too long (max 1000)" };

  const dt = (dismissalTime ?? null) as string | null;
  if (type === "early_release" && dt === null) {
    return { ok: false, error: "dismissalTime is required when type is early_release" };
  }
  if (type === "closure" && dt !== null) {
    return { ok: false, error: "dismissalTime must be null when type is closure" };
  }

  return {
    ok: true,
    data: {
      exceptionDate,
      type,
      dismissalTime: dt,
      reason: reason.trim(),
      notes: (notes ?? null) as string | null,
    },
  };
}

router.get("/schools/:schoolId/calendar-exceptions", async (req, res): Promise<void> => {
  const schoolId = Number(req.params.schoolId);
  if (isNaN(schoolId)) { res.status(400).json({ error: "Invalid school id" }); return; }
  const school = await loadSchoolForCaller(req as unknown as AuthedRequest, res, schoolId);
  if (!school) return;

  const fromQ = typeof req.query.from === "string" ? req.query.from : undefined;
  const toQ = typeof req.query.to === "string" ? req.query.to : undefined;
  if (fromQ && !ISO_DATE_RE.test(fromQ)) { res.status(400).json({ error: "from must be YYYY-MM-DD" }); return; }
  if (toQ && !ISO_DATE_RE.test(toQ)) { res.status(400).json({ error: "to must be YYYY-MM-DD" }); return; }

  // Default window: active school year for the caller's district (if any).
  let from = fromQ;
  let to = toQ;
  if (!from || !to) {
    const enforcedDid = school.districtId ?? getEnforcedDistrictId(req as unknown as AuthedRequest) ?? null;
    if (enforcedDid != null) {
      const [active] = await db.select({ startDate: schoolYearsTable.startDate, endDate: schoolYearsTable.endDate })
        .from(schoolYearsTable)
        .where(and(eq(schoolYearsTable.districtId, enforcedDid), eq(schoolYearsTable.isActive, true)));
      if (active) {
        from = from ?? active.startDate;
        to = to ?? active.endDate;
      }
    }
  }

  const conds = [eq(schoolCalendarExceptionsTable.schoolId, schoolId)];
  if (from) conds.push(gte(schoolCalendarExceptionsTable.exceptionDate, from));
  if (to) conds.push(lte(schoolCalendarExceptionsTable.exceptionDate, to));

  const rows = await db.select().from(schoolCalendarExceptionsTable)
    .where(and(...conds))
    .orderBy(asc(schoolCalendarExceptionsTable.exceptionDate));
  res.json(rows.map(exceptionToJson));
});

router.post("/schools/:schoolId/calendar-exceptions", requireSchoolAdmin, async (req, res): Promise<void> => {
  const schoolId = Number(req.params.schoolId);
  if (isNaN(schoolId)) { res.status(400).json({ error: "Invalid school id" }); return; }
  const school = await loadSchoolForCaller(req as unknown as AuthedRequest, res, schoolId);
  if (!school) return;

  const v = validateExceptionPayload(req.body ?? {});
  if (!v.ok) { res.status(400).json({ error: v.error }); return; }

  try {
    const [row] = await db.insert(schoolCalendarExceptionsTable).values({
      schoolId,
      exceptionDate: v.data.exceptionDate,
      type: v.data.type,
      dismissalTime: v.data.dismissalTime,
      reason: v.data.reason,
      notes: v.data.notes,
      createdBy: (req as unknown as AuthedRequest).tenantStaffId ?? null,
    }).returning();
    res.status(201).json(exceptionToJson(row));
  } catch (err: unknown) {
    // Unique-violation on (school_id, exception_date) — surface as 409 so
    // the UI can offer "edit existing" instead of double-inserting. The
    // error may come from the pg driver directly or wrapped by drizzle
    // under .cause; match either shape and also fall back to message text.
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "An exception already exists for that school on that date." });
      return;
    }
    throw err;
  }
});

router.patch("/schools/:schoolId/calendar-exceptions/:exceptionId", requireSchoolAdmin, async (req, res): Promise<void> => {
  const schoolId = Number(req.params.schoolId);
  const exceptionId = Number(req.params.exceptionId);
  if (isNaN(schoolId) || isNaN(exceptionId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const school = await loadSchoolForCaller(req as unknown as AuthedRequest, res, schoolId);
  if (!school) return;

  const [existing] = await db.select().from(schoolCalendarExceptionsTable)
    .where(and(eq(schoolCalendarExceptionsTable.id, exceptionId), eq(schoolCalendarExceptionsTable.schoolId, schoolId)));
  if (!existing) { res.status(404).json({ error: "Exception not found" }); return; }

  // For partial updates, fold in the existing row before re-validating the
  // type ↔ dismissalTime invariant so callers can flip type without also
  // resending dismissalTime when it's already set correctly.
  const merged = {
    exceptionDate: req.body?.exceptionDate ?? existing.exceptionDate,
    type: req.body?.type ?? existing.type,
    dismissalTime: req.body?.dismissalTime !== undefined ? req.body.dismissalTime : existing.dismissalTime,
    reason: req.body?.reason ?? existing.reason,
    notes: req.body?.notes !== undefined ? req.body.notes : existing.notes,
  };
  const v = validateExceptionPayload(merged);
  if (!v.ok) { res.status(400).json({ error: v.error }); return; }

  try {
    const [row] = await db.update(schoolCalendarExceptionsTable)
      .set({
        exceptionDate: v.data.exceptionDate,
        type: v.data.type,
        dismissalTime: v.data.dismissalTime,
        reason: v.data.reason,
        notes: v.data.notes,
      })
      .where(and(eq(schoolCalendarExceptionsTable.id, exceptionId), eq(schoolCalendarExceptionsTable.schoolId, schoolId)))
      .returning();
    res.json(exceptionToJson(row));
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "An exception already exists for that school on that date." });
      return;
    }
    throw err;
  }
});

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  if (e.code === "23505") return true;
  if (e.cause?.code === "23505") return true;
  if (typeof e.message === "string" && /duplicate key value|unique constraint/i.test(e.message)) return true;
  return false;
}

router.delete("/schools/:schoolId/calendar-exceptions/:exceptionId", requireSchoolAdmin, async (req, res): Promise<void> => {
  const schoolId = Number(req.params.schoolId);
  const exceptionId = Number(req.params.exceptionId);
  if (isNaN(schoolId) || isNaN(exceptionId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const school = await loadSchoolForCaller(req as unknown as AuthedRequest, res, schoolId);
  if (!school) return;

  const result = await db.delete(schoolCalendarExceptionsTable)
    .where(and(eq(schoolCalendarExceptionsTable.id, exceptionId), eq(schoolCalendarExceptionsTable.schoolId, schoolId)))
    .returning({ id: schoolCalendarExceptionsTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Exception not found" }); return; }
  res.status(204).end();
});

router.get("/programs", async (req, res): Promise<void> => {
  const programs = await db.select().from(programsTable).orderBy(programsTable.name);
  res.json(ListProgramsResponse.parse(programs.map(p => ({ ...p, createdAt: p.createdAt.toISOString() }))));
});

router.post("/programs", requireSchoolAdmin, async (req, res): Promise<void> => {
  const parsed = CreateProgramBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [program] = await db.insert(programsTable).values(parsed.data).returning();
  res.status(201).json({ ...program, createdAt: program.createdAt.toISOString() });
});

export default router;
