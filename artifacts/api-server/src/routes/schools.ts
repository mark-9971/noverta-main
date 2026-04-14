import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { schoolsTable, programsTable } from "@workspace/db";
import { ListSchoolsResponse, CreateSchoolBody, ListProgramsResponse, CreateProgramBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";
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
  const schools = await db.select().from(schoolsTable).orderBy(schoolsTable.name);
  res.json(schools.map(schoolToJson));
});

router.get("/schools/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid school id" }); return; }
  const [school] = await db.select().from(schoolsTable).where(eq(schoolsTable.id, id));
  if (!school) { res.status(404).json({ error: "School not found" }); return; }
  res.json(schoolToJson(school));
});

router.patch("/schools/:id/schedule-settings", async (req, res): Promise<void> => {
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

  const [school] = await db.update(schoolsTable).set(updates).where(eq(schoolsTable.id, id)).returning();
  if (!school) { res.status(404).json({ error: "School not found" }); return; }
  res.json(schoolToJson(school));
});

router.post("/schools", async (req, res): Promise<void> => {
  const parsed = CreateSchoolBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [school] = await db.insert(schoolsTable).values(parsed.data).returning();
  res.status(201).json(schoolToJson(school));
});

router.get("/programs", async (req, res): Promise<void> => {
  const programs = await db.select().from(programsTable).orderBy(programsTable.name);
  res.json(ListProgramsResponse.parse(programs.map(p => ({ ...p, createdAt: p.createdAt.toISOString() }))));
});

router.post("/programs", async (req, res): Promise<void> => {
  const parsed = CreateProgramBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [program] = await db.insert(programsTable).values(parsed.data).returning();
  res.status(201).json({ ...program, createdAt: program.createdAt.toISOString() });
});

export default router;
