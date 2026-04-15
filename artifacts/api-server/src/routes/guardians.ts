import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  guardiansTable, insertGuardianSchema,
  emergencyContactsTable, insertEmergencyContactSchema,
  studentsTable, schoolsTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { getPublicMeta } from "../lib/clerkClaims";
import { getAuth } from "@clerk/express";
import { migrateExistingGuardians } from "../lib/migrateGuardians";

const router: IRouter = Router();

async function resolveStudentDistrictId(studentId: number): Promise<number | null> {
  const [result] = await db
    .select({ districtId: schoolsTable.districtId })
    .from(studentsTable)
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(eq(studentsTable.id, studentId))
    .limit(1);
  return result?.districtId ?? null;
}

async function canAccessStudent(req: Request, studentId: number): Promise<boolean> {
  const meta = getPublicMeta(req);
  if (meta.platformAdmin) return true;
  const districtId = await resolveStudentDistrictId(studentId);
  if (!districtId) return false;
  return meta.districtId === districtId;
}

router.get("/students/:studentId/guardians", async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = Number(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student id" }); return; }
    if (!await canAccessStudent(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

    const guardians = await db
      .select()
      .from(guardiansTable)
      .where(eq(guardiansTable.studentId, studentId))
      .orderBy(asc(guardiansTable.contactPriority), asc(guardiansTable.id));

    res.json(guardians);
  } catch (err) {
    console.error("GET /students/:studentId/guardians error:", err);
    res.status(500).json({ error: "Failed to fetch guardians" });
  }
});

router.post("/students/:studentId/guardians", async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = Number(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student id" }); return; }
    if (!await canAccessStudent(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

    const parsed = insertGuardianSchema.safeParse({ ...req.body, studentId });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
      return;
    }

    const [guardian] = await db.insert(guardiansTable).values(parsed.data).returning();
    res.status(201).json(guardian);
  } catch (err) {
    console.error("POST /students/:studentId/guardians error:", err);
    res.status(500).json({ error: "Failed to create guardian" });
  }
});

router.patch("/students/:studentId/guardians/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = Number(req.params.studentId);
    const id = Number(req.params.id);
    if (isNaN(studentId) || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!await canAccessStudent(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

    const allowed = ["name", "relationship", "email", "phone", "preferredContactMethod", "contactPriority", "interpreterNeeded", "language", "notes"] as const;
    const updates: Partial<typeof guardiansTable.$inferInsert> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) (updates as any)[key] = req.body[key];
    }

    const [updated] = await db
      .update(guardiansTable)
      .set(updates)
      .where(and(eq(guardiansTable.id, id), eq(guardiansTable.studentId, studentId)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Guardian not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("PATCH /students/:studentId/guardians/:id error:", err);
    res.status(500).json({ error: "Failed to update guardian" });
  }
});

router.delete("/students/:studentId/guardians/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = Number(req.params.studentId);
    const id = Number(req.params.id);
    if (isNaN(studentId) || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!await canAccessStudent(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

    const [deleted] = await db
      .delete(guardiansTable)
      .where(and(eq(guardiansTable.id, id), eq(guardiansTable.studentId, studentId)))
      .returning();

    if (!deleted) { res.status(404).json({ error: "Guardian not found" }); return; }
    res.status(204).end();
  } catch (err) {
    console.error("DELETE /students/:studentId/guardians/:id error:", err);
    res.status(500).json({ error: "Failed to delete guardian" });
  }
});

router.get("/students/:studentId/emergency-contacts", async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = Number(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student id" }); return; }
    if (!await canAccessStudent(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

    const contacts = await db
      .select()
      .from(emergencyContactsTable)
      .where(eq(emergencyContactsTable.studentId, studentId))
      .orderBy(asc(emergencyContactsTable.priority), asc(emergencyContactsTable.id));

    res.json(contacts);
  } catch (err) {
    console.error("GET /students/:studentId/emergency-contacts error:", err);
    res.status(500).json({ error: "Failed to fetch emergency contacts" });
  }
});

router.post("/students/:studentId/emergency-contacts", async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = Number(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student id" }); return; }
    if (!await canAccessStudent(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

    const parsed = insertEmergencyContactSchema.safeParse({ ...req.body, studentId });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
      return;
    }

    const [contact] = await db.insert(emergencyContactsTable).values(parsed.data).returning();
    res.status(201).json(contact);
  } catch (err) {
    console.error("POST /students/:studentId/emergency-contacts error:", err);
    res.status(500).json({ error: "Failed to create emergency contact" });
  }
});

router.patch("/students/:studentId/emergency-contacts/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = Number(req.params.studentId);
    const id = Number(req.params.id);
    if (isNaN(studentId) || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!await canAccessStudent(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

    const allowed = ["name", "relationship", "phone", "notes", "priority"] as const;
    const updates: Partial<typeof emergencyContactsTable.$inferInsert> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) (updates as any)[key] = req.body[key];
    }

    const [updated] = await db
      .update(emergencyContactsTable)
      .set(updates)
      .where(and(eq(emergencyContactsTable.id, id), eq(emergencyContactsTable.studentId, studentId)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Emergency contact not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("PATCH /students/:studentId/emergency-contacts/:id error:", err);
    res.status(500).json({ error: "Failed to update emergency contact" });
  }
});

router.delete("/students/:studentId/emergency-contacts/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = Number(req.params.studentId);
    const id = Number(req.params.id);
    if (isNaN(studentId) || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!await canAccessStudent(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

    const [deleted] = await db
      .delete(emergencyContactsTable)
      .where(and(eq(emergencyContactsTable.id, id), eq(emergencyContactsTable.studentId, studentId)))
      .returning();

    if (!deleted) { res.status(404).json({ error: "Emergency contact not found" }); return; }
    res.status(204).end();
  } catch (err) {
    console.error("DELETE /students/:studentId/emergency-contacts/:id error:", err);
    res.status(500).json({ error: "Failed to delete emergency contact" });
  }
});

router.post("/guardians/migrate", async (req: Request, res: Response): Promise<void> => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
    const meta = getPublicMeta(req);
    if (!meta.platformAdmin) { res.status(403).json({ error: "Platform admin access required" }); return; }

    const result = await migrateExistingGuardians();
    res.json({ message: "Migration complete", ...result });
  } catch (err) {
    console.error("POST /guardians/migrate error:", err);
    res.status(500).json({ error: "Migration failed" });
  }
});

export default router;
