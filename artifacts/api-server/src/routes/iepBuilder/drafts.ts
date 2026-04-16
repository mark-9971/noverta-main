import { Router, type IRouter } from "express";
import { db, iepBuilderDraftsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getStaffIdFromReq } from "./shared";

const router: IRouter = Router();

router.get("/students/:studentId/iep-builder/draft", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }
    const staffId = getStaffIdFromReq(req);
    if (!staffId) { res.status(403).json({ error: "Staff identity required" }); return; }
    const rows = await db.select().from(iepBuilderDraftsTable)
      .where(and(eq(iepBuilderDraftsTable.studentId, studentId), eq(iepBuilderDraftsTable.staffId, staffId)))
      .limit(1);
    if (rows.length === 0) {
      res.json(null);
      return;
    }
    const d = rows[0];
    res.json({
      id: d.id,
      studentId: d.studentId,
      staffId: d.staffId,
      wizardStep: d.wizardStep,
      formData: d.formData,
      updatedAt: d.updatedAt.toISOString(),
    });
  } catch (e: any) {
    console.error("GET iep-builder draft error:", e);
    res.status(500).json({ error: "Failed to load draft" });
  }
});

router.put("/students/:studentId/iep-builder/draft", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }
    const staffId = getStaffIdFromReq(req);
    if (!staffId) { res.status(403).json({ error: "Staff identity required" }); return; }
    const { wizardStep, formData } = req.body;
    if (wizardStep == null || typeof wizardStep !== "number" || wizardStep < 1 || wizardStep > 5) {
      res.status(400).json({ error: "wizardStep must be 1-5" });
      return;
    }
    if (formData == null || typeof formData !== "object") {
      res.status(400).json({ error: "formData object required" });
      return;
    }
    const existing = await db.select({ id: iepBuilderDraftsTable.id }).from(iepBuilderDraftsTable)
      .where(and(eq(iepBuilderDraftsTable.studentId, studentId), eq(iepBuilderDraftsTable.staffId, staffId)))
      .limit(1);
    let row;
    if (existing.length > 0) {
      [row] = await db.update(iepBuilderDraftsTable)
        .set({ wizardStep, formData })
        .where(eq(iepBuilderDraftsTable.id, existing[0].id))
        .returning();
    } else {
      [row] = await db.insert(iepBuilderDraftsTable)
        .values({ studentId, staffId, wizardStep, formData })
        .returning();
    }
    res.json({ id: row.id, updatedAt: row.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("PUT iep-builder draft error:", e);
    res.status(500).json({ error: "Failed to save draft" });
  }
});

router.delete("/students/:studentId/iep-builder/draft", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }
    const staffId = getStaffIdFromReq(req);
    if (!staffId) { res.status(403).json({ error: "Staff identity required" }); return; }
    await db.delete(iepBuilderDraftsTable)
      .where(and(eq(iepBuilderDraftsTable.studentId, studentId), eq(iepBuilderDraftsTable.staffId, staffId)));
    res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE iep-builder draft error:", e);
    res.status(500).json({ error: "Failed to delete draft" });
  }
});

export default router;
