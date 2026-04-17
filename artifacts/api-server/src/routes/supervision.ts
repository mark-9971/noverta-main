// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  supervisionSessionsTable,
  staffTable,
  sessionLogsTable,
} from "@workspace/db";
import { eq, and, desc, gte, lte, sql, asc, isNull } from "drizzle-orm";
import { requireRoles, type AuthedRequest } from "../middlewares/auth";
import { assertSupervisionSessionInCallerDistrict } from "../lib/districtScope";
import { WRITE_SUPERVISION_ROLES, PRIVILEGED_STAFF_ROLES } from "../lib/permissions";
import { getPublicMeta } from "../lib/clerkClaims";
import { requireTierAccess } from "../middlewares/tierGate";

const router: IRouter = Router();
router.use(
  ["/supervision-sessions", "/supervision"],
  requireTierAccess("clinical.supervision"),
);

const VALID_TYPES = ["individual", "group", "direct_observation"];
const VALID_STATUSES = ["completed", "scheduled", "cancelled"];

const requireWriteRole = requireRoles(...WRITE_SUPERVISION_ROLES);

function isPrivileged(req: AuthedRequest): boolean {
  return PRIVILEGED_STAFF_ROLES.includes(req.trellisRole);
}

/** Reads staffId from Clerk session publicMetadata (set via Clerk user management). */
function getClerkStaffId(req: AuthedRequest): number | null {
  const id = getPublicMeta(req).staffId ?? null;
  return id && Number.isFinite(id) ? id : null;
}

function sessionToJson(s: Record<string, unknown>) {
  return {
    ...s,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
    updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
  };
}

router.get("/supervision-sessions", async (req, res): Promise<void> => {
  try {
    const authed = req as AuthedRequest;
    const { supervisorId, superviseeId, startDate, endDate, supervisionType, schoolId } = req.query as Record<string, string>;

    const conditions = [];
    if (!isPrivileged(authed)) {
      const staffId = getClerkStaffId(authed);
      if (!staffId) { res.json([]); return; }
      conditions.push(eq(supervisionSessionsTable.superviseeId, staffId));
    } else {
      if (supervisorId) conditions.push(eq(supervisionSessionsTable.supervisorId, Number(supervisorId)));
      if (superviseeId) conditions.push(eq(supervisionSessionsTable.superviseeId, Number(superviseeId)));
    }
    if (startDate) conditions.push(gte(supervisionSessionsTable.sessionDate, startDate));
    if (endDate) conditions.push(lte(supervisionSessionsTable.sessionDate, endDate));
    if (supervisionType) conditions.push(eq(supervisionSessionsTable.supervisionType, supervisionType));
    if (schoolId) conditions.push(sql`sup_e.school_id = ${Number(schoolId)}`);

    const sessions = await db
      .select({
        id: supervisionSessionsTable.id,
        supervisorId: supervisionSessionsTable.supervisorId,
        superviseeId: supervisionSessionsTable.superviseeId,
        sessionDate: supervisionSessionsTable.sessionDate,
        durationMinutes: supervisionSessionsTable.durationMinutes,
        supervisionType: supervisionSessionsTable.supervisionType,
        topics: supervisionSessionsTable.topics,
        feedbackNotes: supervisionSessionsTable.feedbackNotes,
        status: supervisionSessionsTable.status,
        createdAt: supervisionSessionsTable.createdAt,
        updatedAt: supervisionSessionsTable.updatedAt,
        supervisorFirst: sql<string>`sup_r.first_name`,
        supervisorLast: sql<string>`sup_r.last_name`,
        superviseeFirst: sql<string>`sup_e.first_name`,
        superviseeLast: sql<string>`sup_e.last_name`,
      })
      .from(supervisionSessionsTable)
      .leftJoin(sql`staff AS sup_r`, sql`sup_r.id = ${supervisionSessionsTable.supervisorId}`)
      .leftJoin(sql`staff AS sup_e`, sql`sup_e.id = ${supervisionSessionsTable.superviseeId}`)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(supervisionSessionsTable.sessionDate))
      .limit(200);

    res.json(sessions.map(s => ({
      id: s.id,
      supervisorId: s.supervisorId,
      superviseeId: s.superviseeId,
      sessionDate: s.sessionDate,
      durationMinutes: s.durationMinutes,
      supervisionType: s.supervisionType,
      topics: s.topics,
      feedbackNotes: s.feedbackNotes,
      status: s.status,
      supervisorName: s.supervisorFirst ? `${s.supervisorFirst} ${s.supervisorLast}` : null,
      superviseeName: s.superviseeFirst ? `${s.superviseeFirst} ${s.superviseeLast}` : null,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
    })));
  } catch (e: any) {
    console.error("GET /supervision-sessions error:", e);
    res.status(500).json({ error: "Failed to fetch supervision sessions" });
  }
});

router.post("/supervision-sessions", requireWriteRole, async (req, res): Promise<void> => {
  try {
    const { supervisorId, superviseeId, sessionDate, durationMinutes, supervisionType, topics, feedbackNotes, status } = req.body;

    if (!supervisorId || !superviseeId || !sessionDate || !durationMinutes || !supervisionType) {
      res.status(400).json({ error: "Missing required fields: supervisorId, superviseeId, sessionDate, durationMinutes, supervisionType" });
      return;
    }

    const parsedSupervisorId = Number(supervisorId);
    const parsedSuperviseeId = Number(superviseeId);
    const parsedDuration = Number(durationMinutes);
    if (!Number.isFinite(parsedSupervisorId) || !Number.isFinite(parsedSuperviseeId) || !Number.isFinite(parsedDuration)) {
      res.status(400).json({ error: "supervisorId, superviseeId, and durationMinutes must be valid numbers" });
      return;
    }

    if (parsedDuration < 1 || parsedDuration > 480) {
      res.status(400).json({ error: "Duration must be between 1 and 480 minutes" });
      return;
    }

    if (!VALID_TYPES.includes(supervisionType)) {
      res.status(400).json({ error: `supervisionType must be one of: ${VALID_TYPES.join(", ")}` });
      return;
    }

    const sessionStatus = status || "completed";
    if (!VALID_STATUSES.includes(sessionStatus)) {
      res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
      return;
    }

    const [session] = await db.insert(supervisionSessionsTable).values({
      supervisorId: parsedSupervisorId,
      superviseeId: parsedSuperviseeId,
      sessionDate,
      durationMinutes: parsedDuration,
      supervisionType,
      topics: topics || null,
      feedbackNotes: feedbackNotes || null,
      status: sessionStatus,
    }).returning();

    res.status(201).json(sessionToJson(session));
  } catch (e: any) {
    console.error("POST /supervision-sessions error:", e);
    res.status(500).json({ error: "Failed to create supervision session" });
  }
});

router.get("/supervision-sessions/export/csv", requireWriteRole, async (req, res): Promise<void> => {
  try {
    const { supervisorId, superviseeId, startDate, endDate, schoolId } = req.query as Record<string, string>;

    const conditions = [];
    if (supervisorId) conditions.push(eq(supervisionSessionsTable.supervisorId, Number(supervisorId)));
    if (superviseeId) conditions.push(eq(supervisionSessionsTable.superviseeId, Number(superviseeId)));
    if (startDate) conditions.push(gte(supervisionSessionsTable.sessionDate, startDate));
    if (endDate) conditions.push(lte(supervisionSessionsTable.sessionDate, endDate));
    if (schoolId) conditions.push(sql`sup_e.school_id = ${Number(schoolId)}`);

    const sessions = await db
      .select({
        sessionDate: supervisionSessionsTable.sessionDate,
        durationMinutes: supervisionSessionsTable.durationMinutes,
        supervisionType: supervisionSessionsTable.supervisionType,
        topics: supervisionSessionsTable.topics,
        feedbackNotes: supervisionSessionsTable.feedbackNotes,
        status: supervisionSessionsTable.status,
        supervisorFirst: sql<string>`sup_r.first_name`,
        supervisorLast: sql<string>`sup_r.last_name`,
        superviseeFirst: sql<string>`sup_e.first_name`,
        superviseeLast: sql<string>`sup_e.last_name`,
      })
      .from(supervisionSessionsTable)
      .leftJoin(sql`staff AS sup_r`, sql`sup_r.id = ${supervisionSessionsTable.supervisorId}`)
      .leftJoin(sql`staff AS sup_e`, sql`sup_e.id = ${supervisionSessionsTable.superviseeId}`)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(supervisionSessionsTable.sessionDate));

    const header = "Date,Duration (min),Type,Supervisor,Supervisee,Topics,Feedback,Status";
    const rows = sessions.map(s => {
      const esc = (v: string | null) => v ? `"${v.replace(/"/g, '""')}"` : "";
      return [
        s.sessionDate,
        s.durationMinutes,
        s.supervisionType,
        s.supervisorFirst ? `${s.supervisorFirst} ${s.supervisorLast}` : "",
        s.superviseeFirst ? `${s.superviseeFirst} ${s.superviseeLast}` : "",
        esc(s.topics),
        esc(s.feedbackNotes),
        s.status,
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="supervision_sessions_${new Date().toISOString().substring(0, 10)}.csv"`);
    res.send(csv);
  } catch (e: any) {
    console.error("GET /supervision-sessions/export/csv error:", e);
    res.status(500).json({ error: "Failed to export CSV" });
  }
});

router.get("/supervision-sessions/:id", async (req, res): Promise<void> => {
  try {
    const authed = req as unknown as AuthedRequest;
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [session] = await db
      .select()
      .from(supervisionSessionsTable)
      .where(eq(supervisionSessionsTable.id, id));

    if (!session) { res.status(404).json({ error: "Supervision session not found" }); return; }

    if (!isPrivileged(authed)) {
      const staffId = getClerkStaffId(authed);
      if (!staffId || session.superviseeId !== staffId) {
        res.status(403).json({ error: "You can only view your own supervision sessions" });
        return;
      }
    }
    res.json(sessionToJson(session));
  } catch (e: any) {
    console.error("GET /supervision-sessions/:id error:", e);
    res.status(500).json({ error: "Failed to fetch supervision session" });
  }
});

router.patch("/supervision-sessions/:id", requireWriteRole, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    if (!(await assertSupervisionSessionInCallerDistrict(req as AuthedRequest, id, res))) return;

    const { sessionDate, durationMinutes, supervisionType, topics, feedbackNotes, status } = req.body;
    const updates: Partial<Record<string, string | number | null>> = {};
    if (sessionDate !== undefined) updates.sessionDate = sessionDate;
    if (durationMinutes !== undefined) {
      const dur = Number(durationMinutes);
      if (!Number.isFinite(dur) || dur < 1 || dur > 480) { res.status(400).json({ error: "Duration must be between 1 and 480 minutes" }); return; }
      updates.durationMinutes = dur;
    }
    if (supervisionType !== undefined) {
      if (!VALID_TYPES.includes(supervisionType)) { res.status(400).json({ error: `supervisionType must be one of: ${VALID_TYPES.join(", ")}` }); return; }
      updates.supervisionType = supervisionType;
    }
    if (topics !== undefined) updates.topics = topics;
    if (feedbackNotes !== undefined) updates.feedbackNotes = feedbackNotes;
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) { res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }); return; }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

    const [updated] = await db.update(supervisionSessionsTable).set(updates).where(eq(supervisionSessionsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(sessionToJson(updated));
  } catch (e: any) {
    console.error("PATCH /supervision-sessions/:id error:", e);
    res.status(500).json({ error: "Failed to update supervision session" });
  }
});

router.delete("/supervision-sessions/:id", requireWriteRole, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    if (!(await assertSupervisionSessionInCallerDistrict(req as AuthedRequest, id, res))) return;

    const [deleted] = await db.delete(supervisionSessionsTable).where(eq(supervisionSessionsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ success: true });
  } catch (e: any) {
    console.error("DELETE /supervision-sessions/:id error:", e);
    res.status(500).json({ error: "Failed to delete supervision session" });
  }
});

router.get("/supervision/compliance-summary", requireWriteRole, async (req, res): Promise<void> => {
  try {
    const { schoolId } = req.query as Record<string, string>;

    const superviseeRoles = ["para", "provider"];
    const roleConditions = superviseeRoles.map(r => sql`${staffTable.role} = ${r}`);

    const staffConditions = [
      eq(staffTable.status, "active"),
      sql`(${sql.join(roleConditions, sql` OR `)})`,
    ];
    if (schoolId) {
      staffConditions.push(eq(staffTable.schoolId, Number(schoolId)));
    }

    const supervisees = await db
      .select({
        id: staffTable.id,
        firstName: staffTable.firstName,
        lastName: staffTable.lastName,
        role: staffTable.role,
        schoolId: staffTable.schoolId,
      })
      .from(staffTable)
      .where(and(...staffConditions))
      .orderBy(staffTable.lastName, staffTable.firstName);

    if (supervisees.length === 0) {
      res.json([]);
      return;
    }

    const superviseeIds = supervisees.map(s => s.id);

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const cutoff30 = thirtyDaysAgo.toISOString().substring(0, 10);

    const supervisionHours = await db
      .select({
        superviseeId: supervisionSessionsTable.superviseeId,
        totalMinutes: sql<number>`COALESCE(SUM(${supervisionSessionsTable.durationMinutes}), 0)`,
        sessionCount: sql<number>`COUNT(*)`,
      })
      .from(supervisionSessionsTable)
      .where(
        and(
          sql`${supervisionSessionsTable.superviseeId} IN (${sql.join(superviseeIds.map(id => sql`${id}`), sql`, `)})`,
          gte(supervisionSessionsTable.sessionDate, cutoff30),
          eq(supervisionSessionsTable.status, "completed")
        )
      )
      .groupBy(supervisionSessionsTable.superviseeId);

    const directServiceHours = await db
      .select({
        staffId: sessionLogsTable.staffId,
        totalMinutes: sql<number>`COALESCE(SUM(${sessionLogsTable.durationMinutes}), 0)`,
      })
      .from(sessionLogsTable)
      .where(
        and(
          sql`${sessionLogsTable.staffId} IN (${sql.join(superviseeIds.map(id => sql`${id}`), sql`, `)})`,
          gte(sessionLogsTable.sessionDate, cutoff30),
          eq(sessionLogsTable.status, "completed"),
          isNull(sessionLogsTable.deletedAt)
        )
      )
      .groupBy(sessionLogsTable.staffId);

    const supMap = new Map(supervisionHours.map(s => [s.superviseeId, s]));
    const svcMap = new Map(directServiceHours.map(s => [s.staffId, s]));

    const result = supervisees.map(staff => {
      const supData = supMap.get(staff.id);
      const svcData = svcMap.get(staff.id);
      const supervisionMinutes = Number(supData?.totalMinutes || 0);
      const directServiceMinutes = Number(svcData?.totalMinutes || 0);
      const requiredMinutes = Math.ceil(directServiceMinutes * 0.05);
      const compliancePercent = requiredMinutes > 0
        ? Math.round((supervisionMinutes / requiredMinutes) * 100)
        : (supervisionMinutes > 0 ? 100 : 0);
      const complianceStatus = compliancePercent >= 100 ? "compliant" : compliancePercent >= 75 ? "at_risk" : "non_compliant";

      return {
        superviseeId: staff.id,
        superviseeName: `${staff.firstName} ${staff.lastName}`,
        role: staff.role,
        schoolId: staff.schoolId,
        periodDays: 30,
        directServiceMinutes,
        requiredSupervisionMinutes: requiredMinutes,
        deliveredSupervisionMinutes: supervisionMinutes,
        sessionCount: Number(supData?.sessionCount || 0),
        compliancePercent: Math.min(compliancePercent, 100),
        complianceStatus,
      };
    });

    res.json(result);
  } catch (e: any) {
    console.error("GET /supervision/compliance-summary error:", e);
    res.status(500).json({ error: "Failed to compute supervision compliance" });
  }
});

router.get("/supervision/staff/:staffId/summary", async (req, res): Promise<void> => {
  try {
    const authed = req as unknown as AuthedRequest;
    const staffId = parseInt(String(req.params.staffId));
    if (isNaN(staffId)) { res.status(400).json({ error: "Invalid staff ID" }); return; }

    if (!isPrivileged(authed)) {
      const clerkStaffId = getClerkStaffId(authed);
      if (!clerkStaffId || staffId !== clerkStaffId) {
        res.status(403).json({ error: "You can only view your own supervision summary" });
        return;
      }
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const cutoff30 = thirtyDaysAgo.toISOString().substring(0, 10);

    const recentSessions = await db
      .select({
        id: supervisionSessionsTable.id,
        supervisorId: supervisionSessionsTable.supervisorId,
        superviseeId: supervisionSessionsTable.superviseeId,
        sessionDate: supervisionSessionsTable.sessionDate,
        durationMinutes: supervisionSessionsTable.durationMinutes,
        supervisionType: supervisionSessionsTable.supervisionType,
        topics: supervisionSessionsTable.topics,
        feedbackNotes: supervisionSessionsTable.feedbackNotes,
        status: supervisionSessionsTable.status,
        createdAt: supervisionSessionsTable.createdAt,
        updatedAt: supervisionSessionsTable.updatedAt,
        supervisorFirst: sql<string>`sup_r.first_name`,
        supervisorLast: sql<string>`sup_r.last_name`,
      })
      .from(supervisionSessionsTable)
      .leftJoin(sql`staff AS sup_r`, sql`sup_r.id = ${supervisionSessionsTable.supervisorId}`)
      .where(
        and(
          eq(supervisionSessionsTable.superviseeId, staffId),
          gte(supervisionSessionsTable.sessionDate, cutoff30)
        )
      )
      .orderBy(desc(supervisionSessionsTable.sessionDate))
      .limit(20);

    const directServiceResult = await db
      .select({
        totalMinutes: sql<number>`COALESCE(SUM(${sessionLogsTable.durationMinutes}), 0)`,
      })
      .from(sessionLogsTable)
      .where(
        and(
          eq(sessionLogsTable.staffId, staffId),
          gte(sessionLogsTable.sessionDate, cutoff30),
          eq(sessionLogsTable.status, "completed"),
          isNull(sessionLogsTable.deletedAt)
        )
      );

    const directServiceMinutes = Number(directServiceResult[0]?.totalMinutes || 0);
    const supervisionMinutes = recentSessions
      .filter(s => s.status === "completed")
      .reduce((sum, s) => sum + s.durationMinutes, 0);
    const requiredMinutes = Math.ceil(directServiceMinutes * 0.05);
    const compliancePercent = requiredMinutes > 0
      ? Math.min(Math.round((supervisionMinutes / requiredMinutes) * 100), 100)
      : (supervisionMinutes > 0 ? 100 : 0);

    res.json({
      staffId,
      periodDays: 30,
      directServiceMinutes,
      requiredSupervisionMinutes: requiredMinutes,
      deliveredSupervisionMinutes: supervisionMinutes,
      compliancePercent,
      complianceStatus: compliancePercent >= 100 ? "compliant" : compliancePercent >= 75 ? "at_risk" : "non_compliant",
      recentSessions: recentSessions.map(s => ({
        id: s.id,
        supervisorId: s.supervisorId,
        superviseeId: s.superviseeId,
        sessionDate: s.sessionDate,
        durationMinutes: s.durationMinutes,
        supervisionType: s.supervisionType,
        topics: s.topics,
        feedbackNotes: s.feedbackNotes,
        status: s.status,
        supervisorName: s.supervisorFirst ? `${s.supervisorFirst} ${s.supervisorLast}` : null,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
        updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
      })),
    });
  } catch (e: any) {
    console.error("GET /supervision/staff/:staffId/summary error:", e);
    res.status(500).json({ error: "Failed to fetch supervision summary" });
  }
});

router.get("/supervision/trend", requireWriteRole, async (req, res): Promise<void> => {
  try {
    const { schoolId, weeks } = req.query as Record<string, string>;
    const numWeeks = Math.min(Math.max(parseInt(weeks) || 12, 4), 52);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numWeeks * 7);
    const startStr = startDate.toISOString().substring(0, 10);

    const conditions = [
      gte(supervisionSessionsTable.sessionDate, startStr),
      eq(supervisionSessionsTable.status, "completed"),
    ];

    if (schoolId) {
      conditions.push(sql`sup_e.school_id = ${Number(schoolId)}`);
    }

    const sessions = await db
      .select({
        sessionDate: supervisionSessionsTable.sessionDate,
        durationMinutes: supervisionSessionsTable.durationMinutes,
      })
      .from(supervisionSessionsTable)
      .leftJoin(sql`staff AS sup_e`, sql`sup_e.id = ${supervisionSessionsTable.superviseeId}`)
      .where(and(...conditions))
      .orderBy(asc(supervisionSessionsTable.sessionDate));

    const weekBuckets: Record<string, number> = {};
    for (let i = 0; i < numWeeks; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (numWeeks - 1 - i) * 7);
      const weekStart = new Date(d);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const key = weekStart.toISOString().substring(0, 10);
      weekBuckets[key] = 0;
    }

    for (const s of sessions) {
      const d = new Date(s.sessionDate);
      d.setDate(d.getDate() - d.getDay());
      const key = d.toISOString().substring(0, 10);
      if (weekBuckets[key] !== undefined) {
        weekBuckets[key] += s.durationMinutes;
      } else {
        const keys = Object.keys(weekBuckets);
        const closest = keys.reduce((prev, curr) =>
          Math.abs(new Date(curr).getTime() - d.getTime()) < Math.abs(new Date(prev).getTime() - d.getTime()) ? curr : prev
        );
        weekBuckets[closest] += s.durationMinutes;
      }
    }

    const trend = Object.entries(weekBuckets).sort().map(([weekStart, totalMinutes]) => ({
      weekStart,
      totalMinutes,
    }));

    res.json(trend);
  } catch (e: any) {
    console.error("GET /supervision/trend error:", e);
    res.status(500).json({ error: "Failed to compute supervision trend" });
  }
});

export default router;
