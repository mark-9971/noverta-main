import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { demoRequestsTable, insertDemoRequestSchema } from "@workspace/db";
import { desc } from "drizzle-orm";
import { getPublicMeta } from "../lib/clerkClaims";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();

router.post("/demo-requests", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = insertDemoRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }

    const [request] = await db
      .insert(demoRequestsTable)
      .values(parsed.data)
      .returning();

    res.status(201).json(request);
  } catch (err) {
    console.error("POST /demo-requests error:", err);
    res.status(500).json({ error: "Failed to submit demo request" });
  }
});

router.get("/demo-requests", async (req: Request, res: Response): Promise<void> => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    const meta = getPublicMeta(req);
    if (!meta.platformAdmin) {
      res.status(403).json({ error: "Platform admin access required" });
      return;
    }

    const requests = await db
      .select()
      .from(demoRequestsTable)
      .orderBy(desc(demoRequestsTable.createdAt));

    res.json(requests);
  } catch (err) {
    console.error("GET /demo-requests error:", err);
    res.status(500).json({ error: "Failed to fetch demo requests" });
  }
});

export default router;
