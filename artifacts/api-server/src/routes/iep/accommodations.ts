import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { iepAccommodationsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";

const router: IRouter = Router();

router.get("/students/:studentId/accommodations", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const accs = await db.select().from(iepAccommodationsTable)
      .where(and(eq(iepAccommodationsTable.studentId, studentId), eq(iepAccommodationsTable.active, true)))
      .orderBy(asc(iepAccommodationsTable.category));
    logAudit(req, {
      action: "read",
      targetTable: "iep_accommodations",
      studentId: studentId,
      summary: `Viewed ${accs.length} accommodations for student #${studentId}`,
    });
    res.json(accs.map(a => ({ ...a, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() })));
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch accommodations" });
  }
});

router.post("/students/:studentId/accommodations", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { category, description, setting, frequency, provider, iepDocumentId } = req.body;
    if (!description) { res.status(400).json({ error: "description is required" }); return; }
    const [acc] = await db.insert(iepAccommodationsTable).values({
      studentId, category: category || "instruction", description, setting, frequency, provider,
      iepDocumentId: iepDocumentId || null,
    }).returning();
    logAudit(req, {
      action: "create",
      targetTable: "iep_accommodations",
      targetId: acc.id,
      studentId: studentId,
      summary: `Created accommodation #${acc.id} for student #${studentId}: ${description}`,
      newValues: { category: category || "instruction", description, setting, frequency } as Record<string, unknown>,
    });
    res.status(201).json({ ...acc, createdAt: acc.createdAt.toISOString(), updatedAt: acc.updatedAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to create accommodation" });
  }
});

router.patch("/accommodations/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const updates: any = {};
    for (const key of ["category","description","setting","frequency","provider","active"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [oldAcc] = await db.select().from(iepAccommodationsTable).where(eq(iepAccommodationsTable.id, id));
    const [updated] = await db.update(iepAccommodationsTable).set(updates).where(eq(iepAccommodationsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, {
      action: "update",
      targetTable: "iep_accommodations",
      targetId: id,
      studentId: updated.studentId,
      summary: `Updated accommodation #${id}`,
      oldValues: oldAcc ? (Object.fromEntries(Object.keys(updates).map(k => [k, (oldAcc as Record<string, unknown>)[k]]))) : null,
      newValues: updates as Record<string, unknown>,
    });
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to update accommodation" });
  }
});

router.delete("/accommodations/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [oldAcc] = await db.select().from(iepAccommodationsTable).where(eq(iepAccommodationsTable.id, id));
    await db.delete(iepAccommodationsTable).where(eq(iepAccommodationsTable.id, id));
    logAudit(req, {
      action: "delete",
      targetTable: "iep_accommodations",
      targetId: id,
      studentId: oldAcc?.studentId,
      summary: `Deleted accommodation #${id}`,
      oldValues: oldAcc ? { category: oldAcc.category, description: oldAcc.description } as Record<string, unknown> : null,
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to delete accommodation" });
  }
});

export default router;
