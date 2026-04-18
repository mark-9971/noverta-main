// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { guardiansTable, studentsTable } from "@workspace/db";
import { eq, and, isNotNull, gte, sql, count } from "drizzle-orm";
import { resolveCallerDistrictId } from "./shared";

const router: IRouter = Router();

/**
 * GET /dashboard/parent-engagement
 *
 * Returns portal engagement metrics for families in the district:
 *   - invitedCount:  guardians with a portal invite sent
 *   - acceptedCount: guardians who accepted their invite
 *   - activeCount:   guardians who logged in within the last 30 days
 *
 * Access: admin / coordinator only (enforced by the calling dashboard middleware
 * which already requires a valid staff session; the UI also gates visibility).
 */
router.get("/dashboard/parent-engagement", async (req, res): Promise<void> => {
  try {
    const districtId = await resolveCallerDistrictId(req);

    if (!districtId) {
      res.json({ invitedCount: 0, acceptedCount: 0, activeCount: 0 });
      return;
    }

    const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Guardians belong to students who belong to a district via their school.
    // We join guardians → students → schools to scope by districtId.
    const [row] = await db
      .select({
        invitedCount: sql<number>`count(*) filter (where ${guardiansTable.portalInvitedAt} is not null)`,
        acceptedCount: sql<number>`count(*) filter (where ${guardiansTable.portalAcceptedAt} is not null)`,
        activeCount: sql<number>`count(*) filter (where ${guardiansTable.lastPortalLoginAt} >= ${cutoff30d})`,
      })
      .from(guardiansTable)
      .innerJoin(studentsTable, eq(studentsTable.id, guardiansTable.studentId))
      .where(
        and(
          eq(studentsTable.status, "active"),
          sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${districtId})`,
        ),
      );

    res.json({
      invitedCount: Number(row?.invitedCount ?? 0),
      acceptedCount: Number(row?.acceptedCount ?? 0),
      activeCount: Number(row?.activeCount ?? 0),
    });
  } catch (err) {
    console.error("GET /dashboard/parent-engagement error:", err);
    res.status(500).json({ error: "Failed to load parent engagement stats" });
  }
});

export default router;
