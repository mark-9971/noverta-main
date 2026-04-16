import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { fbasTable, staffTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { isoDate } from "./shared";

const router: IRouter = Router();

router.get("/students/:studentId/fbas", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const fbas = await db.select({
      id: fbasTable.id,
      studentId: fbasTable.studentId,
      conductedBy: fbasTable.conductedBy,
      targetBehavior: fbasTable.targetBehavior,
      operationalDefinition: fbasTable.operationalDefinition,
      status: fbasTable.status,
      referralDate: fbasTable.referralDate,
      startDate: fbasTable.startDate,
      completionDate: fbasTable.completionDate,
      hypothesizedFunction: fbasTable.hypothesizedFunction,
      createdAt: fbasTable.createdAt,
      updatedAt: fbasTable.updatedAt,
      conductedByName: sql<string>`${staffTable.firstName} || ' ' || ${staffTable.lastName}`,
    })
      .from(fbasTable)
      .leftJoin(staffTable, eq(fbasTable.conductedBy, staffTable.id))
      .where(eq(fbasTable.studentId, studentId))
      .orderBy(desc(fbasTable.createdAt));
    res.json(fbas.map(f => ({ ...f, createdAt: isoDate(f.createdAt), updatedAt: isoDate(f.updatedAt) })));
  } catch (e: any) {
    console.error("GET fbas error:", e);
    res.status(500).json({ error: "Failed to fetch FBAs" });
  }
});

router.post("/students/:studentId/fbas", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { targetBehavior, operationalDefinition, conductedBy, referralReason, referralDate,
      settingDescription, status } = req.body;
    if (!targetBehavior || !operationalDefinition) {
      res.status(400).json({ error: "targetBehavior and operationalDefinition are required" });
      return;
    }
    const [fba] = await db.insert(fbasTable).values({
      studentId, targetBehavior, operationalDefinition,
      conductedBy: conductedBy || null,
      referralReason: referralReason || null,
      referralDate: referralDate || null,
      settingDescription: settingDescription || null,
      status: status || "draft",
    }).returning();
    res.status(201).json({ ...fba, createdAt: isoDate(fba.createdAt), updatedAt: isoDate(fba.updatedAt) });
  } catch (e: any) {
    console.error("POST fba error:", e);
    res.status(500).json({ error: "Failed to create FBA" });
  }
});

router.get("/fbas/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [fba] = await db.select().from(fbasTable).where(eq(fbasTable.id, id));
    if (!fba) { res.status(404).json({ error: "FBA not found" }); return; }
    res.json({ ...fba, createdAt: isoDate(fba.createdAt), updatedAt: isoDate(fba.updatedAt) });
  } catch (e: any) {
    console.error("GET fba error:", e);
    res.status(500).json({ error: "Failed to fetch FBA" });
  }
});

router.patch("/fbas/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const allowed = [
      "targetBehavior", "operationalDefinition", "status", "conductedBy",
      "referralReason", "referralDate", "startDate", "completionDate",
      "settingDescription", "indirectMethods", "indirectFindings",
      "directMethods", "directFindings", "hypothesizedFunction",
      "hypothesisNarrative", "recommendations"
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [updated] = await db.update(fbasTable).set(updates).where(eq(fbasTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "FBA not found" }); return; }
    res.json({ ...updated, createdAt: isoDate(updated.createdAt), updatedAt: isoDate(updated.updatedAt) });
  } catch (e: any) {
    console.error("PATCH fba error:", e);
    res.status(500).json({ error: "Failed to update FBA" });
  }
});

export default router;
