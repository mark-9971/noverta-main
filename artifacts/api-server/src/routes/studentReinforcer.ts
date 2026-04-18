import { Router } from "express";
import { db, studentReinforcersTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";

const router = Router();

/* ─── List all reinforcers for a student ──────────────────────────────────── */
router.get("/students/:studentId/reinforcers", async (req, res): Promise<void> => {
  const studentId = parseInt(req.params.studentId);
  if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

  const rows = await db
    .select()
    .from(studentReinforcersTable)
    .where(eq(studentReinforcersTable.studentId, studentId))
    .orderBy(
      studentReinforcersTable.active,    // active first (true > false desc in pg — we reverse in JS)
      asc(studentReinforcersTable.category),
      asc(studentReinforcersTable.name),
    );

  // Sort: active=true first, then by category, then name
  const sorted = [
    ...rows.filter(r => r.active),
    ...rows.filter(r => !r.active),
  ];

  res.json(sorted);
});

/* ─── Create a reinforcer ──────────────────────────────────────────────────── */
router.post("/students/:studentId/reinforcers", async (req, res): Promise<void> => {
  const studentId = parseInt(req.params.studentId);
  if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

  const { name, category, notes, active, sourceAssessmentId } = req.body as {
    name: string;
    category?: string;
    notes?: string;
    active?: boolean;
    sourceAssessmentId?: number | null;
  };

  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [row] = await db.insert(studentReinforcersTable).values({
    studentId,
    name: name.trim(),
    category: category || "tangible",
    notes: notes?.trim() || null,
    active: active !== false,
    sourceAssessmentId: sourceAssessmentId ?? null,
  }).returning();

  res.status(201).json(row);
});

/* ─── Update a reinforcer ─────────────────────────────────────────────────── */
router.patch("/reinforcers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { name, category, notes, active } = req.body as {
    name?: string;
    category?: string;
    notes?: string | null;
    active?: boolean;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name.trim();
  if (category !== undefined) updates.category = category;
  if (notes !== undefined) updates.notes = notes?.trim() || null;
  if (active !== undefined) updates.active = active;

  const [row] = await db
    .update(studentReinforcersTable)
    .set(updates)
    .where(eq(studentReinforcersTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

/* ─── Delete a reinforcer ─────────────────────────────────────────────────── */
router.delete("/reinforcers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  await db.delete(studentReinforcersTable).where(eq(studentReinforcersTable.id, id));
  res.status(204).send();
});

export default router;
