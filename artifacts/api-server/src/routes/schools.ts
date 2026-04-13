import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { schoolsTable, programsTable } from "@workspace/db";
import { ListSchoolsResponse, CreateSchoolBody, ListProgramsResponse, CreateProgramBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/schools", async (req, res): Promise<void> => {
  const schools = await db.select().from(schoolsTable).orderBy(schoolsTable.name);
  res.json(ListSchoolsResponse.parse(schools.map(s => ({ ...s, createdAt: s.createdAt.toISOString() }))));
});

router.post("/schools", async (req, res): Promise<void> => {
  const parsed = CreateSchoolBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [school] = await db.insert(schoolsTable).values(parsed.data).returning();
  res.status(201).json({ ...school, createdAt: school.createdAt.toISOString() });
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
