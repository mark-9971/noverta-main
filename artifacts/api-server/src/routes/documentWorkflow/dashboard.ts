import { Router } from "express";
import { db, approvalWorkflowsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";

const router = Router();

router.get("/document-workflow/dashboard/summary", async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!districtId) { res.status(403).json({ error: "No district scope" }); return; }

  const rows = await db.select({
    currentStage: approvalWorkflowsTable.currentStage,
    status: approvalWorkflowsTable.status,
    count: sql<number>`count(*)::int`,
  })
    .from(approvalWorkflowsTable)
    .where(eq(approvalWorkflowsTable.districtId, districtId))
    .groupBy(approvalWorkflowsTable.currentStage, approvalWorkflowsTable.status);

  const summary: Record<string, number> = {};
  let totalActive = 0;
  let totalCompleted = 0;
  let totalRejected = 0;

  for (const row of rows) {
    if (row.status === "in_progress") {
      summary[row.currentStage] = (summary[row.currentStage] || 0) + row.count;
      totalActive += row.count;
    } else if (row.status === "completed") {
      totalCompleted += row.count;
    } else if (row.status === "rejected") {
      totalRejected += row.count;
    }
  }

  const agingRows = await db.select({
    id: approvalWorkflowsTable.id,
    title: approvalWorkflowsTable.title,
    currentStage: approvalWorkflowsTable.currentStage,
    updatedAt: approvalWorkflowsTable.updatedAt,
    daysInStage: sql<number>`EXTRACT(DAY FROM NOW() - ${approvalWorkflowsTable.updatedAt})::int`,
  })
    .from(approvalWorkflowsTable)
    .where(and(
      eq(approvalWorkflowsTable.districtId, districtId),
      eq(approvalWorkflowsTable.status, "in_progress"),
      sql`${approvalWorkflowsTable.updatedAt} < NOW() - INTERVAL '3 days'`,
    ))
    .orderBy(approvalWorkflowsTable.updatedAt);

  res.json({ byStage: summary, totalActive, totalCompleted, totalRejected, aging: agingRows });
});

export default router;
