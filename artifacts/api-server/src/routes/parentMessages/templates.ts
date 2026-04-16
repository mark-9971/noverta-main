import { Router, type Request, type Response } from "express";
import { db, messageTemplatesTable } from "@workspace/db";
import { eq, isNull, or } from "drizzle-orm";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";

const router = Router();

router.get("/message-templates", async (req: Request, res: Response) => {
  try {
    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    const templates = await db
      .select()
      .from(messageTemplatesTable)
      .where(
        districtId
          ? or(
              eq(messageTemplatesTable.isSystem, true),
              isNull(messageTemplatesTable.districtId),
              eq(messageTemplatesTable.districtId, districtId),
            )
          : or(eq(messageTemplatesTable.isSystem, true), isNull(messageTemplatesTable.districtId))
      )
      .orderBy(messageTemplatesTable.name);
    res.json(templates);
  } catch (err) {
    console.error("GET /message-templates error:", err);
    res.status(500).json({ error: "Failed to load templates" });
  }
});

export default router;
