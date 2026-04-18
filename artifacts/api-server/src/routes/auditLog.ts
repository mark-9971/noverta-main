import { Router, type IRouter } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { eq, and, gte, lte, desc, ilike, sql } from "drizzle-orm";
import { requireRoles } from "../middlewares/auth";

// tenant-scope: district-join
const router: IRouter = Router();

const ADMIN_ROLES = ["admin"] as const;

router.get("/audit-logs", requireRoles(...ADMIN_ROLES), async (req, res): Promise<void> => {
  try {
    const {
      actorUserId,
      action,
      targetTable,
      studentId,
      dateFrom,
      dateTo,
      search,
      limit: limitStr,
      offset: offsetStr,
    } = req.query;

    const conditions: ReturnType<typeof eq>[] = [];

    if (actorUserId && typeof actorUserId === "string") {
      conditions.push(eq(auditLogsTable.actorUserId, actorUserId));
    }
    if (action && typeof action === "string") {
      conditions.push(eq(auditLogsTable.action, action));
    }
    if (targetTable && typeof targetTable === "string") {
      conditions.push(eq(auditLogsTable.targetTable, targetTable));
    }
    if (studentId && typeof studentId === "string") {
      conditions.push(eq(auditLogsTable.studentId, parseInt(studentId)));
    }
    if (dateFrom && typeof dateFrom === "string") {
      conditions.push(gte(auditLogsTable.createdAt, new Date(dateFrom)));
    }
    if (dateTo && typeof dateTo === "string") {
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      conditions.push(lte(auditLogsTable.createdAt, endDate));
    }
    if (search && typeof search === "string") {
      conditions.push(ilike(auditLogsTable.summary, `%${search}%`));
    }

    const parsedLimit = typeof limitStr === "string" ? parseInt(limitStr, 10) : NaN;
    const limit = Math.min(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 100, 500);
    const parsedOffset = typeof offsetStr === "string" ? parseInt(offsetStr, 10) : NaN;
    const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [logs, countResult] = await Promise.all([
      db
        .select()
        .from(auditLogsTable)
        .where(where)
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogsTable)
        .where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    const page = Math.floor(offset / limit) + 1;

    res.json({
      data: logs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize: limit,
      hasMore: offset + limit < total,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("GET /audit-logs error:", message);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

router.get("/audit-logs/export", requireRoles(...ADMIN_ROLES), async (req, res): Promise<void> => {
  try {
    const { actorUserId, action, targetTable, studentId, dateFrom, dateTo } = req.query;

    const conditions: ReturnType<typeof eq>[] = [];
    if (actorUserId && typeof actorUserId === "string") {
      conditions.push(eq(auditLogsTable.actorUserId, actorUserId));
    }
    if (action && typeof action === "string") {
      conditions.push(eq(auditLogsTable.action, action));
    }
    if (targetTable && typeof targetTable === "string") {
      conditions.push(eq(auditLogsTable.targetTable, targetTable));
    }
    if (studentId && typeof studentId === "string") {
      conditions.push(eq(auditLogsTable.studentId, parseInt(studentId)));
    }
    if (dateFrom && typeof dateFrom === "string") {
      conditions.push(gte(auditLogsTable.createdAt, new Date(dateFrom)));
    }
    if (dateTo && typeof dateTo === "string") {
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      conditions.push(lte(auditLogsTable.createdAt, endDate));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const logs = await db
      .select()
      .from(auditLogsTable)
      .where(where)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(10000);

    const header = "Timestamp,Actor User ID,Role,Action,Table,Target ID,Student ID,IP Address,Summary\n";
    const rows = logs.map((l) => {
      const ts = l.createdAt.toISOString();
      const escapeCsv = (v: string | null | undefined) => {
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
      };
      return [
        ts,
        escapeCsv(l.actorUserId),
        escapeCsv(l.actorRole),
        escapeCsv(l.action),
        escapeCsv(l.targetTable),
        escapeCsv(l.targetId),
        l.studentId ?? "",
        escapeCsv(l.ipAddress),
        escapeCsv(l.summary),
      ].join(",");
    });

    const csv = header + rows.join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="audit-log-${new Date().toISOString().split("T")[0]}.csv"`);
    res.send(csv);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("GET /audit-logs/export error:", message);
    res.status(500).json({ error: "Failed to export audit logs" });
  }
});

router.get("/audit-logs/stats", requireRoles(...ADMIN_ROLES), async (req, res): Promise<void> => {
  try {
    const { dateFrom, dateTo } = req.query;

    const conditions: ReturnType<typeof eq>[] = [];
    if (dateFrom && typeof dateFrom === "string") {
      conditions.push(gte(auditLogsTable.createdAt, new Date(dateFrom)));
    }
    if (dateTo && typeof dateTo === "string") {
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      conditions.push(lte(auditLogsTable.createdAt, endDate));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [byAction, byTable, totalResult] = await Promise.all([
      db
        .select({
          action: auditLogsTable.action,
          count: sql<number>`count(*)::int`,
        })
        .from(auditLogsTable)
        .where(where)
        .groupBy(auditLogsTable.action),
      db
        .select({
          targetTable: auditLogsTable.targetTable,
          count: sql<number>`count(*)::int`,
        })
        .from(auditLogsTable)
        .where(where)
        .groupBy(auditLogsTable.targetTable)
        .orderBy(desc(sql`count(*)`))
        .limit(10),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogsTable)
        .where(where),
    ]);

    res.json({
      total: totalResult[0]?.count ?? 0,
      byAction: Object.fromEntries(byAction.map((r) => [r.action, r.count])),
      topTables: byTable.map((r) => ({ table: r.targetTable, count: r.count })),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("GET /audit-logs/stats error:", message);
    res.status(500).json({ error: "Failed to fetch audit stats" });
  }
});

export default router;
