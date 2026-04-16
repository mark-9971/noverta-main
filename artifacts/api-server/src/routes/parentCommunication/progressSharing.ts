import { Router, type IRouter } from "express";
import { db, shareLinksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { resolveGuardianRecipients, generateProgressSummary } from "./shared";

const router: IRouter = Router();

router.get("/students/:studentId/progress-summary", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

    const days = parseInt(req.query.days as string) || 30;
    const summary = await generateProgressSummary(studentId, days);

    if (!summary) { res.status(404).json({ error: "Student not found" }); return; }
    res.json(summary);
  } catch (e: any) {
    console.error("GET progress-summary error:", e);
    res.status(500).json({ error: "Failed to generate progress summary" });
  }
});

router.post("/students/:studentId/progress-summary/share-link", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

    const days = Math.max(1, Math.min(parseInt(req.body.days as string) || 30, 365));
    const expiresInHours = Math.max(1, Math.min(parseInt(req.body.expiresInHours as string) || 72, 720));

    const summary = await generateProgressSummary(studentId, days);
    if (!summary) { res.status(404).json({ error: "Student not found" }); return; }

    const token = crypto.randomBytes(24).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    await db.insert(shareLinksTable).values({
      tokenHash,
      studentId,
      summary: JSON.stringify(summary),
      expiresAt,
    });

    const guardianRecipients = await resolveGuardianRecipients(studentId);

    res.status(201).json({
      token,
      expiresAt: expiresAt.toISOString(),
      url: `/api/shared/progress/${token}`,
      guardianRecipients,
    });
  } catch (e: any) {
    console.error("POST share-link error:", e);
    res.status(500).json({ error: "Failed to generate share link" });
  }
});

router.get("/shared/progress/:token", async (req, res): Promise<void> => {
  try {
    const { token } = req.params;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const [entry] = await db
      .select()
      .from(shareLinksTable)
      .where(eq(shareLinksTable.tokenHash, tokenHash))
      .limit(1);

    if (!entry) {
      res.status(404).json({ error: "Link not found or expired" });
      return;
    }

    if (new Date() > entry.expiresAt) {
      await db.delete(shareLinksTable).where(eq(shareLinksTable.id, entry.id));
      res.status(410).json({ error: "This link has expired" });
      return;
    }

    res.json(JSON.parse(entry.summary));
  } catch (e: any) {
    console.error("GET shared progress error:", e);
    res.status(500).json({ error: "Failed to fetch shared progress" });
  }
});

export default router;
