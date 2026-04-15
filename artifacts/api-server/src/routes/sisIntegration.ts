import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sisConnectionsTable, sisSyncLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireRoles } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import { getConnector, getCsvConnector, SUPPORTED_PROVIDERS } from "../lib/sis/index";
import { runSync } from "../lib/sis/syncEngine";
import type { SisProvider } from "../lib/sis/types";

const router: IRouter = Router();
const ADMIN_ROLES = ["admin"] as const;
const VALID_PROVIDERS = new Set(["powerschool", "infinite_campus", "skyward", "csv"]);

router.get("/sis/providers", requireRoles(...ADMIN_ROLES), async (_req: Request, res: Response): Promise<void> => {
  res.json(SUPPORTED_PROVIDERS);
});

router.get("/sis/connections", requireRoles(...ADMIN_ROLES), async (_req: Request, res: Response): Promise<void> => {
  try {
    const connections = await db.select({
      id: sisConnectionsTable.id,
      provider: sisConnectionsTable.provider,
      label: sisConnectionsTable.label,
      schoolId: sisConnectionsTable.schoolId,
      status: sisConnectionsTable.status,
      syncSchedule: sisConnectionsTable.syncSchedule,
      lastSyncAt: sisConnectionsTable.lastSyncAt,
      enabled: sisConnectionsTable.enabled,
      createdAt: sisConnectionsTable.createdAt,
    })
      .from(sisConnectionsTable)
      .orderBy(desc(sisConnectionsTable.createdAt));

    res.json(connections);
  } catch (err) {
    console.error("Failed to fetch SIS connections:", err);
    res.status(500).json({ error: "Failed to fetch connections" });
  }
});

router.post("/sis/connections", requireRoles(...ADMIN_ROLES), async (req: Request, res: Response): Promise<void> => {
  try {
    const authed = req as AuthedRequest;
    const { provider, label, credentials, schoolId, syncSchedule } = req.body as {
      provider: string;
      label: string;
      credentials: Record<string, unknown>;
      schoolId?: number;
      syncSchedule?: string;
    };

    if (!VALID_PROVIDERS.has(provider)) {
      res.status(400).json({ error: "Unsupported SIS provider" });
      return;
    }

    if (!label || label.trim().length === 0) {
      res.status(400).json({ error: "Connection label is required" });
      return;
    }

    const [connection] = await db.insert(sisConnectionsTable).values({
      provider,
      label: label.trim(),
      credentials: credentials ?? {},
      schoolId: schoolId ?? null,
      syncSchedule: syncSchedule ?? "nightly",
      status: "disconnected",
      createdBy: authed.auth?.userId ?? "unknown",
    }).returning();

    res.status(201).json({
      id: connection.id,
      provider: connection.provider,
      label: connection.label,
      status: connection.status,
    });
  } catch (err) {
    console.error("Failed to create SIS connection:", err);
    res.status(500).json({ error: "Failed to create connection" });
  }
});

router.put("/sis/connections/:id", requireRoles(...ADMIN_ROLES), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { label, credentials, schoolId, syncSchedule, enabled } = req.body as {
      label?: string;
      credentials?: Record<string, unknown>;
      schoolId?: number | null;
      syncSchedule?: string;
      enabled?: boolean;
    };

    const updates: Record<string, unknown> = {};
    if (label !== undefined) updates.label = label.trim();
    if (credentials !== undefined) updates.credentials = credentials;
    if (schoolId !== undefined) updates.schoolId = schoolId;
    if (syncSchedule !== undefined) updates.syncSchedule = syncSchedule;
    if (enabled !== undefined) updates.enabled = enabled;

    const [updated] = await db.update(sisConnectionsTable)
      .set(updates)
      .where(eq(sisConnectionsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }

    res.json({
      id: updated.id,
      provider: updated.provider,
      label: updated.label,
      status: updated.status,
      enabled: updated.enabled,
    });
  } catch (err) {
    console.error("Failed to update SIS connection:", err);
    res.status(500).json({ error: "Failed to update connection" });
  }
});

router.delete("/sis/connections/:id", requireRoles(...ADMIN_ROLES), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(sisConnectionsTable)
      .where(eq(sisConnectionsTable.id, id))
      .returning({ id: sisConnectionsTable.id });

    if (!deleted) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete SIS connection:", err);
    res.status(500).json({ error: "Failed to delete connection" });
  }
});

router.post("/sis/connections/:id/test", requireRoles(...ADMIN_ROLES), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [connection] = await db.select()
      .from(sisConnectionsTable)
      .where(eq(sisConnectionsTable.id, id))
      .limit(1);

    if (!connection) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }

    const connector = getConnector(connection.provider as SisProvider);
    const result = await connector.testConnection(connection.credentials);

    if (result.ok) {
      await db.update(sisConnectionsTable)
        .set({ status: "connected" })
        .where(eq(sisConnectionsTable.id, id));
    }

    res.json(result);
  } catch (err) {
    console.error("Failed to test SIS connection:", err);
    res.status(500).json({ error: "Connection test failed" });
  }
});

router.post("/sis/connections/:id/sync", requireRoles(...ADMIN_ROLES), async (req: Request, res: Response): Promise<void> => {
  try {
    const authed = req as AuthedRequest;
    const id = Number(req.params.id);
    const { syncType } = req.body as { syncType?: string };
    const type = (syncType || "full") as "full" | "students" | "staff";

    const userId = authed.auth?.userId ?? "unknown";
    const result = await runSync(id, type, userId);

    res.json({
      studentsAdded: result.studentsAdded,
      studentsUpdated: result.studentsUpdated,
      studentsArchived: result.studentsArchived,
      staffAdded: result.staffAdded,
      staffUpdated: result.staffUpdated,
      totalRecords: result.totalRecords,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (err) {
    console.error("Failed to run SIS sync:", err);
    res.status(500).json({ error: "Sync failed" });
  }
});

router.post("/sis/connections/:id/upload-csv", requireRoles(...ADMIN_ROLES), async (req: Request, res: Response): Promise<void> => {
  try {
    const authed = req as AuthedRequest;
    const id = Number(req.params.id);
    const { csvText, dataType } = req.body as { csvText: string; dataType: "students" | "staff" };

    if (!csvText || !dataType) {
      res.status(400).json({ error: "csvText and dataType are required" });
      return;
    }

    const syncType = dataType === "students" ? "csv_students" as const : "csv_staff" as const;
    const userId = authed.auth?.userId ?? "unknown";
    const result = await runSync(id, syncType, userId, { csvText });

    res.json({
      studentsAdded: result.studentsAdded,
      studentsUpdated: result.studentsUpdated,
      staffAdded: result.staffAdded,
      staffUpdated: result.staffUpdated,
      totalRecords: result.totalRecords,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (err) {
    console.error("Failed to process CSV upload:", err);
    res.status(500).json({ error: "CSV upload failed" });
  }
});

router.get("/sis/sync-logs", requireRoles(...ADMIN_ROLES), async (req: Request, res: Response): Promise<void> => {
  try {
    const connectionId = req.query.connectionId ? Number(req.query.connectionId) : undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    let query = db.select()
      .from(sisSyncLogsTable)
      .orderBy(desc(sisSyncLogsTable.startedAt))
      .limit(limit);

    if (connectionId) {
      query = query.where(eq(sisSyncLogsTable.connectionId, connectionId)) as typeof query;
    }

    const logs = await query;
    res.json(logs);
  } catch (err) {
    console.error("Failed to fetch sync logs:", err);
    res.status(500).json({ error: "Failed to fetch sync logs" });
  }
});

export default router;
