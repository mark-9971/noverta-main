import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { demoRequestsTable, insertDemoRequestSchema } from "@workspace/db";
import { desc } from "drizzle-orm";
import { getPublicMeta } from "../lib/clerkClaims";
import { getAuth } from "@clerk/express";
import { getClientIp } from "../lib/clientIp";
import { SlidingWindowLimiter } from "../lib/rateLimiter";

// tenant-scope: public
const router: IRouter = Router();

/**
 * Per-IP rate limit for the public, unauthenticated demo-request submission.
 *
 * The /api global limiter (200 req/min) is too loose for a write endpoint
 * that anyone can hit and that can fill up the demo_requests table. 5 valid
 * submissions per IP per hour is plenty for legitimate use and stops trivial
 * spam without a captcha. Skipped in test so suite-wide tests don't trip it.
 */
const demoSubmitLimiter = new SlidingWindowLimiter(60 * 60 * 1000, 5);
export function __resetDemoLimiter(): void { demoSubmitLimiter.reset(); }

router.post("/demo-requests", async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.env.NODE_ENV !== "test") {
      const ip = getClientIp(req);
      if (ip && !demoSubmitLimiter.allow(ip)) {
        res.status(429).json({ error: "Too many demo requests from this address. Please try again later.", code: "rate_limited" });
        return;
      }
    }

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
