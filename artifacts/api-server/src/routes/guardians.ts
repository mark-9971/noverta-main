// tenant-scope: district-join
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  guardiansTable, insertGuardianSchema,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { getPublicMeta } from "../lib/clerkClaims";
import { assertStudentAccess } from "../lib/tenantAccess";
import { getAuth } from "@clerk/express";
import { migrateExistingGuardians } from "../lib/migrateGuardians";

const router: IRouter = Router();

const patchGuardianSchema = insertGuardianSchema
  .omit({ studentId: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

type PatchGuardian = (typeof patchGuardianSchema)["_output"];

async function canAccessStudent(req: Request, studentId: number): Promise<boolean> {
  const meta = getPublicMeta(req);
  if (meta.platformAdmin) return true;
  return assertStudentAccess(req, studentId);
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

router.get("/students/:studentId/guardians/contact-recipients", async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = Number(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student id" }); return; }
    if (!await canAccessStudent(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

    const guardians = await db
      .select({
        id: guardiansTable.id,
        name: guardiansTable.name,
        relationship: guardiansTable.relationship,
        email: guardiansTable.email,
        phone: guardiansTable.phone,
        preferredContactMethod: guardiansTable.preferredContactMethod,
        contactPriority: guardiansTable.contactPriority,
        interpreterNeeded: guardiansTable.interpreterNeeded,
        language: guardiansTable.language,
      })
      .from(guardiansTable)
      .where(eq(guardiansTable.studentId, studentId))
      .orderBy(asc(guardiansTable.contactPriority), asc(guardiansTable.id));

    const recipients = guardians.map((g) => ({
      guardianId: g.id,
      name: g.name,
      relationship: g.relationship,
      email: g.email ?? null,
      phone: g.phone ?? null,
      preferredContactMethod: g.preferredContactMethod ?? "email",
      contactPriority: g.contactPriority,
      interpreterNeeded: g.interpreterNeeded,
      language: g.language ?? null,
      deliveryChannels: {
        email: !!g.email,
        phone: !!g.phone,
      },
    }));

    res.json({ studentId, recipients });
  } catch (err) {
    console.error("GET /students/:studentId/guardians/contact-recipients error:", err);
    res.status(500).json({ error: "Failed to fetch contact recipients" });
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

    const parsed = patchGuardianSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
      return;
    }

    const updates: PatchGuardian = parsed.data;

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
