import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { functionalAnalysesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { isoDate } from "./shared";

const router: IRouter = Router();

router.get("/fbas/:fbaId/fa-sessions", async (req, res): Promise<void> => {
  try {
    const fbaId = parseInt(req.params.fbaId);
    const sessions = await db.select().from(functionalAnalysesTable)
      .where(eq(functionalAnalysesTable.fbaId, fbaId))
      .orderBy(asc(functionalAnalysesTable.sessionNumber));
    res.json(sessions.map(s => ({ ...s, createdAt: isoDate(s.createdAt) })));
  } catch (e: any) {
    console.error("GET fa-sessions error:", e);
    res.status(500).json({ error: "Failed to fetch FA sessions" });
  }
});

router.post("/fbas/:fbaId/fa-sessions", async (req, res): Promise<void> => {
  try {
    const fbaId = parseInt(req.params.fbaId);
    const { sessionNumber, condition, sessionDate, conductedBy, durationMinutes,
      responseCount, responseRate, latencySeconds, durationOfBehaviorSeconds, notes } = req.body;
    if (!condition || !sessionDate) {
      res.status(400).json({ error: "condition and sessionDate are required" });
      return;
    }
    const [session] = await db.insert(functionalAnalysesTable).values({
      fbaId, sessionNumber: sessionNumber || 1,
      condition, sessionDate,
      conductedBy: conductedBy || null,
      durationMinutes: durationMinutes || 10,
      responseCount: responseCount || 0,
      responseRate: responseRate != null ? String(responseRate) : null,
      latencySeconds: latencySeconds || null,
      durationOfBehaviorSeconds: durationOfBehaviorSeconds || null,
      notes: notes || null,
    }).returning();
    res.status(201).json({ ...session, createdAt: isoDate(session.createdAt) });
  } catch (e: any) {
    console.error("POST fa-session error:", e);
    res.status(500).json({ error: "Failed to create FA session" });
  }
});

router.delete("/fa-sessions/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(functionalAnalysesTable).where(eq(functionalAnalysesTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "FA session not found" }); return; }
    res.json({ success: true });
  } catch (e: any) {
    console.error("DELETE fa-session error:", e);
    res.status(500).json({ error: "Failed to delete FA session" });
  }
});

export default router;
