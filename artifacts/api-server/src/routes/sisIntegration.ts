import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sisConnectionsTable, sisSyncLogsTable, districtsTable, staffTable, schoolsTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { requireRoles } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import { getPublicMeta } from "../lib/clerkClaims";
import { getConnector, getCsvConnector, SUPPORTED_PROVIDERS } from "../lib/sis/index";
import { runSync } from "../lib/sis/syncEngine";
import { encryptCredentials, decryptCredentials } from "../lib/sis/credentials";
import type { SisProvider } from "../lib/sis/types";

const router: IRouter = Router();
const ADMIN_ROLES = ["admin"] as const;
const VALID_PROVIDERS = new Set(["powerschool", "infinite_campus", "skyward", "csv", "sftp"]);

async function getDistrictIdForUser(req: Request): Promise<number | null> {
  const meta = getPublicMeta(req);

  if (meta.staffId) {
    const [staff] = await db.select({ schoolId: staffTable.schoolId })
      .from(staffTable)
      .where(eq(staffTable.id, meta.staffId))
      .limit(1);

    if (staff?.schoolId) {
      const [school] = await db.select({ districtId: schoolsTable.districtId })
        .from(schoolsTable)
        .where(eq(schoolsTable.id, staff.schoolId))
        .limit(1);

      if (school?.districtId) return school.districtId;
    }
  }

  const districts = await db.select({ id: districtsTable.id })
    .from(districtsTable)
    .limit(2);

  if (districts.length === 1) return districts[0].id;

  return null;
}

async function assertConnectionOwnership(connectionId: number, districtId: number): Promise<typeof sisConnectionsTable.$inferSelect | null> {
  const [conn] = await db.select()
    .from(sisConnectionsTable)
    .where(and(eq(sisConnectionsTable.id, connectionId), eq(sisConnectionsTable.districtId, districtId)))
    .limit(1);
  return conn ?? null;
}

router.get("/sis/providers", requireRoles(...ADMIN_ROLES), async (_req: Request, res: Response): Promise<void> => {
  res.json(SUPPORTED_PROVIDERS);
});

router.get("/sis/connections", requireRoles(...ADMIN_ROLES), async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = await getDistrictIdForUser(req);
    if (!districtId) {
      res.json([]);
      return;
    }

    const connections = await db.select({
      id: sisConnectionsTable.id,
      provider: sisConnectionsTable.provider,
      label: sisConnectionsTable.label,
      schoolId: sisConnectionsTable.schoolId,
      districtId: sisConnectionsTable.districtId,
      status: sisConnectionsTable.status,
      syncSchedule: sisConnectionsTable.syncSchedule,
      lastSyncAt: sisConnectionsTable.lastSyncAt,
      enabled: sisConnectionsTable.enabled,
      createdAt: sisConnectionsTable.createdAt,
    })
      .from(sisConnectionsTable)
      .where(eq(sisConnectionsTable.districtId, districtId))
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
    const districtId = await getDistrictIdForUser(req);
    if (!districtId) {
      res.status(400).json({ error: "No district configured. Complete onboarding first." });
      return;
    }

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

    const encrypted = credentials ? encryptCredentials(credentials) : null;

    const [connection] = await db.insert(sisConnectionsTable).values({
      provider,
      label: label.trim(),
      credentialsEncrypted: encrypted,
      schoolId: schoolId ?? null,
      districtId,
      syncSchedule: syncSchedule ?? "nightly",
      status: "disconnected",
      createdBy: authed.userId,
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
    const districtId = await getDistrictIdForUser(req);
    if (!districtId) {
      res.status(403).json({ error: "No district configured" });
      return;
    }

    const existing = await assertConnectionOwnership(id, districtId);
    if (!existing) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }

    const { label, credentials, schoolId, syncSchedule, enabled } = req.body as {
      label?: string;
      credentials?: Record<string, unknown>;
      schoolId?: number | null;
      syncSchedule?: string;
      enabled?: boolean;
    };

    const updates: Record<string, unknown> = {};
    if (label !== undefined) updates.label = label.trim();
    if (credentials !== undefined) updates.credentialsEncrypted = encryptCredentials(credentials);
    if (schoolId !== undefined) updates.schoolId = schoolId;
    if (syncSchedule !== undefined) updates.syncSchedule = syncSchedule;
    if (enabled !== undefined) updates.enabled = enabled;

    const [updated] = await db.update(sisConnectionsTable)
      .set(updates)
      .where(and(eq(sisConnectionsTable.id, id), eq(sisConnectionsTable.districtId, districtId)))
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
    const districtId = await getDistrictIdForUser(req);
    if (!districtId) {
      res.status(403).json({ error: "No district configured" });
      return;
    }

    const existing = await assertConnectionOwnership(id, districtId);
    if (!existing) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }

    const [deleted] = await db.delete(sisConnectionsTable)
      .where(and(eq(sisConnectionsTable.id, id), eq(sisConnectionsTable.districtId, districtId)))
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
    const districtId = await getDistrictIdForUser(req);
    if (!districtId) {
      res.status(403).json({ error: "No district configured" });
      return;
    }

    const connection = await assertConnectionOwnership(id, districtId);
    if (!connection) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }

    const credentials = connection.credentialsEncrypted
      ? decryptCredentials(connection.credentialsEncrypted)
      : {};
    const connector = getConnector(connection.provider as SisProvider);
    const result = await connector.testConnection(credentials);

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
    const districtId = await getDistrictIdForUser(req);
    if (!districtId) {
      res.status(403).json({ error: "No district configured" });
      return;
    }

    const connection = await assertConnectionOwnership(id, districtId);
    if (!connection) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }

    const { syncType } = req.body as { syncType?: string };
    const type = (syncType || "full") as "full" | "students" | "staff";

    const result = await runSync(id, type, authed.userId);

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
    const districtId = await getDistrictIdForUser(req);
    if (!districtId) {
      res.status(403).json({ error: "No district configured" });
      return;
    }

    const connection = await assertConnectionOwnership(id, districtId);
    if (!connection) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }

    const { csvText, dataType } = req.body as { csvText: string; dataType: "students" | "staff" };

    if (!csvText || !dataType) {
      res.status(400).json({ error: "csvText and dataType are required" });
      return;
    }

    const syncType = dataType === "students" ? "csv_students" as const : "csv_staff" as const;
    const result = await runSync(id, syncType, authed.userId, { csvText });

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
    const districtId = await getDistrictIdForUser(req);
    if (!districtId) {
      res.json([]);
      return;
    }

    const districtConnections = await db.select({ id: sisConnectionsTable.id })
      .from(sisConnectionsTable)
      .where(eq(sisConnectionsTable.districtId, districtId));

    const connectionIds = districtConnections.map((c) => c.id);
    if (connectionIds.length === 0) {
      res.json([]);
      return;
    }

    const connectionId = req.query.connectionId ? Number(req.query.connectionId) : undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const conditions = [inArray(sisSyncLogsTable.connectionId, connectionIds)];
    if (connectionId && connectionIds.includes(connectionId)) {
      conditions.push(eq(sisSyncLogsTable.connectionId, connectionId));
    }

    const logs = await db.select()
      .from(sisSyncLogsTable)
      .where(and(...conditions))
      .orderBy(desc(sisSyncLogsTable.startedAt))
      .limit(limit);

    res.json(logs);
  } catch (err) {
    console.error("Failed to fetch sync logs:", err);
    res.status(500).json({ error: "Failed to fetch sync logs" });
  }
});

export default router;
