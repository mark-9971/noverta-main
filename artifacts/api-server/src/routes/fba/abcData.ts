import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { fbaObservationsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { isoDate } from "./shared";
import type { AuthedRequest } from "../../middlewares/auth";
import { assertFbaObservationInCallerDistrict } from "../../lib/districtScope";

// tenant-scope: district-join
const router: IRouter = Router();

router.get("/fbas/:fbaId/observations", async (req, res): Promise<void> => {
  try {
    const fbaId = parseInt(req.params.fbaId as string, 10);
    const obs = await db.select().from(fbaObservationsTable)
      .where(eq(fbaObservationsTable.fbaId, fbaId))
      .orderBy(asc(fbaObservationsTable.observationDate), asc(fbaObservationsTable.observationTime));
    res.json(obs.map(o => ({ ...o, createdAt: isoDate(o.createdAt) })));
  } catch (e: any) {
    console.error("GET observations error:", e);
    res.status(500).json({ error: "Failed to fetch observations" });
  }
});

router.post("/fbas/:fbaId/observations", async (req, res): Promise<void> => {
  try {
    const fbaId = parseInt(req.params.fbaId as string, 10);
    const { observerId, observationDate, observationTime, durationMinutes, setting, activity,
      antecedent, antecedentCategory, behavior, behaviorIntensity, behaviorDurationSeconds,
      consequence, consequenceCategory, perceivedFunction, notes } = req.body;
    if (!antecedent || !behavior || !consequence || !observationDate) {
      res.status(400).json({ error: "antecedent, behavior, consequence, and observationDate are required" });
      return;
    }
    const [obs] = await db.insert(fbaObservationsTable).values({
      fbaId, observerId: observerId || null,
      observationDate, observationTime: observationTime || null,
      durationMinutes: durationMinutes || null,
      setting: setting || null, activity: activity || null,
      antecedent, antecedentCategory: antecedentCategory || null,
      behavior, behaviorIntensity: behaviorIntensity || null,
      behaviorDurationSeconds: behaviorDurationSeconds || null,
      consequence, consequenceCategory: consequenceCategory || null,
      perceivedFunction: perceivedFunction || null,
      notes: notes || null,
    }).returning();
    res.status(201).json({ ...obs, createdAt: isoDate(obs.createdAt) });
  } catch (e: any) {
    console.error("POST observation error:", e);
    res.status(500).json({ error: "Failed to create observation" });
  }
});

router.delete("/observations/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!(await assertFbaObservationInCallerDistrict(req as unknown as AuthedRequest, id, res))) return;
    const [deleted] = await db.delete(fbaObservationsTable).where(eq(fbaObservationsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Observation not found" }); return; }
    res.json({ success: true });
  } catch (e: any) {
    console.error("DELETE observation error:", e);
    res.status(500).json({ error: "Failed to delete observation" });
  }
});

router.get("/fbas/:fbaId/observations/summary", async (req, res): Promise<void> => {
  try {
    const fbaId = parseInt(req.params.fbaId as string, 10);
    const obs = await db.select().from(fbaObservationsTable)
      .where(eq(fbaObservationsTable.fbaId, fbaId));

    const functionCounts: Record<string, number> = {};
    const antecedentCounts: Record<string, number> = {};
    const consequenceCounts: Record<string, number> = {};
    const hourCounts: Record<string, number> = {};

    for (const o of obs) {
      if (o.perceivedFunction) functionCounts[o.perceivedFunction] = (functionCounts[o.perceivedFunction] || 0) + 1;
      if (o.antecedentCategory) antecedentCounts[o.antecedentCategory] = (antecedentCounts[o.antecedentCategory] || 0) + 1;
      if (o.consequenceCategory) consequenceCounts[o.consequenceCategory] = (consequenceCounts[o.consequenceCategory] || 0) + 1;
      if (o.observationTime) {
        const hour = o.observationTime.split(":")[0];
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      }
    }

    const topFunction = Object.entries(functionCounts).sort((a, b) => b[1] - a[1])[0];

    res.json({
      totalObservations: obs.length,
      functionCounts,
      antecedentCounts,
      consequenceCounts,
      scatterData: hourCounts,
      suggestedFunction: topFunction ? topFunction[0] : null,
    });
  } catch (e: any) {
    console.error("GET observation summary error:", e);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

export default router;
