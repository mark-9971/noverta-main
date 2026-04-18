import { Router } from "express";
import { db, preferenceAssessmentsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { resolveCallerDistrictId } from "./dashboard/shared";

const router = Router();

// List all preference assessments for a student
router.get("/students/:studentId/preference-assessments", async (req, res): Promise<void> => {
  const studentId = parseInt(req.params.studentId as string, 10);
  if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

  const rows = await db
    .select()
    .from(preferenceAssessmentsTable)
    .where(eq(preferenceAssessmentsTable.studentId, studentId))
    .orderBy(desc(preferenceAssessmentsTable.conductedDate));

  res.json(rows);
});

// Create a new preference assessment
router.post("/students/:studentId/preference-assessments", async (req, res): Promise<void> => {
  const studentId = parseInt(req.params.studentId as string, 10);
  if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

  const { assessmentType, conductedDate, conductedByName, items, notes } = req.body;
  if (!assessmentType || !conductedDate) {
    res.status(400).json({ error: "assessmentType and conductedDate are required" });
    return;
  }

  const [row] = await db.insert(preferenceAssessmentsTable).values({
    studentId,
    assessmentType,
    conductedDate,
    conductedByName: conductedByName || null,
    items: items ?? [],
    notes: notes || null,
  }).returning();

  res.status(201).json(row);
});

// Update a preference assessment
router.patch("/preference-assessments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { assessmentType, conductedDate, conductedByName, items, notes } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (assessmentType !== undefined) updates.assessmentType = assessmentType;
  if (conductedDate !== undefined) updates.conductedDate = conductedDate;
  if (conductedByName !== undefined) updates.conductedByName = conductedByName;
  if (items !== undefined) updates.items = items;
  if (notes !== undefined) updates.notes = notes;

  const [row] = await db
    .update(preferenceAssessmentsTable)
    .set(updates)
    .where(eq(preferenceAssessmentsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// Delete a preference assessment
router.delete("/preference-assessments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  await db.delete(preferenceAssessmentsTable).where(eq(preferenceAssessmentsTable.id, id));
  res.status(204).send();
});

export default router;
