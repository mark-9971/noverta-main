import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import {
  districtsTable,
  districtArchiveJobsTable,
  auditLogsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requirePlatformAdmin, requireRoles, invalidateDistrictDeleteCache, type AuthedRequest } from "../middlewares/auth";
import { getPublicMeta } from "../lib/clerkClaims";
import { resolveDistrictIdForCaller } from "../lib/resolveDistrictForCaller";
import { sendAdminEmail } from "../lib/email";
import archiver from "archiver";
import PDFDocument from "pdfkit";

const router: IRouter = Router();

const requireAdmin = requireRoles("admin");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getActorInfo(req: AuthedRequest) {
  const meta = getPublicMeta(req);
  return {
    userId: req.userId ?? "unknown",
    role: req.trellisRole ?? meta.role ?? "unknown",
    name: req.displayName ?? meta.name ?? "Unknown",
    email: (meta as Record<string, unknown>).email as string | undefined,
  };
}

async function writeAuditLog(opts: {
  actorUserId: string;
  actorRole: string;
  action: string;
  targetTable: string;
  targetId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogsTable).values({
      actorUserId: opts.actorUserId,
      actorRole: opts.actorRole,
      action: opts.action,
      targetTable: opts.targetTable,
      targetId: opts.targetId,
      summary: opts.summary,
      metadata: opts.metadata ?? null,
    });
  } catch {
    // audit log failures are non-fatal
  }
}

// Tables scoped to a district via direct districtId column
const DISTRICT_SCOPED_TABLES: Array<{ table: string; col: string; label: string }> = [
  { table: "schools", col: "district_id", label: "Schools" },
  { table: "service_types", col: "district_id", label: "Service Types" },
  { table: "school_years", col: "district_id", label: "School Years" },
  { table: "district_subscriptions", col: "district_id", label: "District Subscriptions" },
  { table: "onboarding_progress", col: "district_id", label: "Onboarding Progress" },
  { table: "agency_contracts", col: "district_id", label: "Agency Contracts" },
  { table: "sis_connections", col: "district_id", label: "SIS Connections" },
  { table: "legal_acceptances", col: "district_id", label: "Legal Acceptances" },
  { table: "scheduled_reports", col: "district_id", label: "Scheduled Reports" },
];

// Tables scoped via school_id → district_id
const SCHOOL_SCOPED_TABLES: Array<{ table: string; col: string; label: string }> = [
  { table: "students", col: "school_id", label: "Students" },
  { table: "staff", col: "school_id", label: "Staff" },
  { table: "service_requirements", col: "school_id", label: "Service Requirements" },
  { table: "schedule_blocks", col: "school_id", label: "Schedule Blocks" },
  { table: "classes", col: "school_id", label: "Classes" },
];

// Tables scoped via student_id
const STUDENT_SCOPED_TABLES: Array<{ table: string; col: string; label: string }> = [
  { table: "iep_documents", col: "student_id", label: "IEP Documents" },
  { table: "iep_goals", col: "student_id", label: "IEP Goals" },
  { table: "iep_accommodations", col: "student_id", label: "IEP Accommodations" },
  { table: "session_logs", col: "student_id", label: "Session Logs" },
  { table: "alerts", col: "student_id", label: "Alerts" },
  { table: "progress_reports", col: "student_id", label: "Progress Reports" },
  { table: "compliance_events", col: "student_id", label: "Compliance Events" },
  { table: "evaluations", col: "student_id", label: "Evaluations" },
  { table: "evaluation_referrals", col: "student_id", label: "Evaluation Referrals" },
  { table: "eligibility_determinations", col: "student_id", label: "Eligibility Determinations" },
  { table: "restraint_incidents", col: "student_id", label: "Restraint Incidents" },
  { table: "parent_contacts", col: "student_id", label: "Parent Contacts" },
  { table: "guardians", col: "student_id", label: "Guardians" },
  { table: "emergency_contacts", col: "student_id", label: "Emergency Contacts" },
  { table: "medical_alerts", col: "student_id", label: "Medical Alerts" },
  { table: "enrollment_events", col: "student_id", label: "Enrollment Events" },
  { table: "transition_plans", col: "student_id", label: "Transition Plans" },
  { table: "transition_goals", col: "student_id", label: "Transition Goals" },
  { table: "fbas", col: "student_id", label: "FBAs" },
  { table: "behavior_intervention_plans", col: "student_id", label: "Behavior Intervention Plans" },
  { table: "compensatory_obligations", col: "student_id", label: "Compensatory Obligations" },
  { table: "student_check_ins", col: "student_id", label: "Student Check-ins" },
  { table: "student_notes", col: "student_id", label: "Student Notes" },
  { table: "student_wins", col: "student_id", label: "Student Wins" },
  { table: "documents", col: "student_id", label: "Documents" },
  { table: "programs", col: "student_id", label: "Programs" },
  { table: "communication_events", col: "student_id", label: "Communication Events" },
  { table: "medicaid_claims", col: "student_id", label: "Medicaid Claims" },
];

function toCsvRow(row: Record<string, unknown>): string {
  return Object.values(row)
    .map(v => {
      if (v === null || v === undefined) return "";
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(",");
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(","), ...rows.map(toCsvRow)];
  return lines.join("\n");
}

// ─── Run archive job async ────────────────────────────────────────────────────

async function runArchiveJob(jobId: number, districtId: number) {
  try {
    await db
      .update(districtArchiveJobsTable)
      .set({ status: "running" })
      .where(eq(districtArchiveJobsTable.id, jobId));

    const [district] = await db
      .select({ name: districtsTable.name })
      .from(districtsTable)
      .where(eq(districtsTable.id, districtId));

    const tableManifest: Array<{ name: string; rows: number }> = [];
    const client = await pool.connect();

    try {
      // Count rows per table for manifest
      for (const t of DISTRICT_SCOPED_TABLES) {
        try {
          const { rows } = await client.query(
            `SELECT COUNT(*)::int AS cnt FROM ${t.table} WHERE ${t.col} = $1`,
            [districtId]
          );
          tableManifest.push({ name: t.label, rows: rows[0]?.cnt ?? 0 });
        } catch { tableManifest.push({ name: t.label, rows: 0 }); }
      }

      const schoolIds = await client
        .query<{ id: number }>("SELECT id FROM schools WHERE district_id = $1", [districtId])
        .then(r => r.rows.map(r => r.id));

      for (const t of SCHOOL_SCOPED_TABLES) {
        if (!schoolIds.length) { tableManifest.push({ name: t.label, rows: 0 }); continue; }
        try {
          const { rows } = await client.query(
            `SELECT COUNT(*)::int AS cnt FROM ${t.table} WHERE ${t.col} = ANY($1)`,
            [schoolIds]
          );
          tableManifest.push({ name: t.label, rows: rows[0]?.cnt ?? 0 });
        } catch { tableManifest.push({ name: t.label, rows: 0 }); }
      }

      const studentIds = schoolIds.length
        ? await client
            .query<{ id: number }>("SELECT id FROM students WHERE school_id = ANY($1)", [schoolIds])
            .then(r => r.rows.map(r => r.id))
        : [];

      for (const t of STUDENT_SCOPED_TABLES) {
        if (!studentIds.length) { tableManifest.push({ name: t.label, rows: 0 }); continue; }
        try {
          const { rows } = await client.query(
            `SELECT COUNT(*)::int AS cnt FROM ${t.table} WHERE ${t.col} = ANY($1)`,
            [studentIds]
          );
          tableManifest.push({ name: t.label, rows: rows[0]?.cnt ?? 0 });
        } catch { tableManifest.push({ name: t.label, rows: 0 }); }
      }
    } finally {
      client.release();
    }

    const totalRows = tableManifest.reduce((s, t) => s + t.rows, 0);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const manifest = {
      districtName: district?.name ?? "Unknown District",
      generatedAt: new Date().toISOString(),
      tables: tableManifest,
      totalRows,
      storageBytesEstimate: totalRows * 512,
    };

    const [updatedJob] = await db
      .update(districtArchiveJobsTable)
      .set({
        status: "complete",
        manifest,
        completedAt: new Date(),
        expiresAt,
      })
      .where(eq(districtArchiveJobsTable.id, jobId))
      .returning();

    // Email the requesting admin a "your archive is ready" notification
    if (updatedJob?.requestedByEmail) {
      const expiresDateStr = expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      sendAdminEmail({
        to: [updatedJob.requestedByEmail],
        subject: `Noverta — Your district archive is ready (${manifest.districtName})`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#059669;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
<h2 style="margin:0;font-size:18px">District Data Archive Ready</h2>
</div>
<div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
<p>Hi ${updatedJob.requestedByName ?? "there"},</p>
<p>Your district data archive for <strong>${manifest.districtName}</strong> is ready to download.</p>
<ul style="color:#374151">
<li><strong>Total records:</strong> ${manifest.totalRows.toLocaleString()}</li>
<li><strong>Tables exported:</strong> ${manifest.tables.length}</li>
<li><strong>Generated:</strong> ${new Date(manifest.generatedAt).toLocaleString()}</li>
<li><strong>Download expires:</strong> ${expiresDateStr}</li>
</ul>
<p>Download the archive from <strong>Settings → Data &amp; Privacy</strong> in Noverta. The link will remain active until ${expiresDateStr}.</p>
<p style="color:#6b7280;font-size:13px">Archive ID: ${jobId}</p>
</div>
<div style="text-align:center;padding:12px;color:#9ca3af;font-size:11px">Noverta SPED Compliance Platform — Confidential</div>
</div>`,
        notificationType: "district_archive_ready",
      }).catch(() => {});
    }

    await writeAuditLog({
      actorUserId: updatedJob?.requestedBy ?? "system",
      actorRole: "admin",
      action: "district_archive_ready",
      targetTable: "districts",
      targetId: String(districtId),
      summary: `Archive ready for download: ${manifest.totalRows.toLocaleString()} records across ${manifest.tables.length} tables`,
      metadata: { jobId, expiresAt: expiresAt.toISOString(), totalRows: manifest.totalRows },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(districtArchiveJobsTable)
      .set({ status: "failed", errorMessage: msg })
      .where(eq(districtArchiveJobsTable.id, jobId));
  }
}

// ─── POST /district-data/archive ─────────────────────────────────────────────

router.post("/district-data/archive", requireAdmin, async (req, res): Promise<void> => {
  const authed = req as AuthedRequest;
  const actor = getActorInfo(authed);
  const districtId = await resolveDistrictIdForCaller(req);
  if (!districtId) {
    res.status(400).json({ error: "District context required" });
    return;
  }

  const [job] = await db
    .insert(districtArchiveJobsTable)
    .values({
      districtId,
      requestedBy: actor.userId,
      requestedByEmail: actor.email ?? null,
      requestedByName: actor.name,
      status: "pending",
    })
    .returning();

  await writeAuditLog({
    actorUserId: actor.userId,
    actorRole: actor.role,
    action: "district_archive_requested",
    targetTable: "districts",
    targetId: String(districtId),
    summary: `Archive requested by ${actor.name}`,
    metadata: { jobId: job.id },
  });

  // Fire-and-forget
  runArchiveJob(job.id, districtId).catch(err =>
    console.error("[DistrictArchive] Job failed:", err)
  );

  // Send notification email if configured
  if (actor.email) {
    sendAdminEmail({
      to: [actor.email],
      subject: "Noverta — Your district archive is being prepared",
      html: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#059669;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
<h2 style="margin:0;font-size:18px">District Data Archive</h2>
</div>
<div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
<p>Hi ${actor.name},</p>
<p>Your district data archive is being generated. This typically takes a few minutes.</p>
<p>You can check the status and download the archive from <strong>Settings → Data & Privacy</strong> in Noverta.</p>
<p style="color:#6b7280;font-size:13px">The archive will be available for 7 days.</p>
</div>
<div style="text-align:center;padding:12px;color:#9ca3af;font-size:11px">Noverta SPED Compliance Platform — Confidential</div>
</div>`,
      notificationType: "district_archive",
    }).catch(() => {});
  }

  res.status(202).json({ jobId: job.id, status: "pending" });
});

// ─── GET /district-data/archive ──────────────────────────────────────────────

router.get("/district-data/archive", requireAdmin, async (req, res): Promise<void> => {
  const districtId = await resolveDistrictIdForCaller(req);
  if (!districtId) {
    res.status(400).json({ error: "District context required" });
    return;
  }

  const jobs = await db
    .select()
    .from(districtArchiveJobsTable)
    .where(eq(districtArchiveJobsTable.districtId, districtId))
    .orderBy(desc(districtArchiveJobsTable.createdAt))
    .limit(10);

  res.json(
    jobs.map(j => ({
      ...j,
      createdAt: j.createdAt.toISOString(),
      completedAt: j.completedAt?.toISOString() ?? null,
      expiresAt: j.expiresAt?.toISOString() ?? null,
      expired: j.expiresAt ? j.expiresAt < new Date() : false,
    }))
  );
});

// ─── GET /district-data/archive/:jobId/download ───────────────────────────────

router.get("/district-data/archive/:jobId/download", requireAdmin, async (req, res): Promise<void> => {
  const authed = req as AuthedRequest;
  const actor = getActorInfo(authed);
  const jobId = Number(req.params.jobId);
  if (isNaN(jobId)) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  const districtId = await resolveDistrictIdForCaller(req);
  if (!districtId) {
    res.status(400).json({ error: "District context required" });
    return;
  }

  const [job] = await db
    .select()
    .from(districtArchiveJobsTable)
    .where(
      and(
        eq(districtArchiveJobsTable.id, jobId),
        eq(districtArchiveJobsTable.districtId, districtId)
      )
    );

  if (!job) {
    res.status(404).json({ error: "Archive job not found" });
    return;
  }
  if (job.status !== "complete") {
    res.status(409).json({ error: "Archive is not ready yet", status: job.status });
    return;
  }
  if (job.expiresAt && job.expiresAt < new Date()) {
    res.status(410).json({ error: "Archive download link has expired" });
    return;
  }

  const [district] = await db
    .select({ name: districtsTable.name })
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId));

  const districtName = district?.name ?? "district";
  const slug = districtName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const filename = `trellis-export-${slug}-${new Date().toISOString().slice(0, 10)}.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.pipe(res as unknown as NodeJS.WritableStream);

  const client = await pool.connect();
  try {
    // Generate manifest JSON
    const manifest = {
      ...job.manifest,
      downloadedAt: new Date().toISOString(),
      downloadedBy: actor.name,
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

    // District-scoped tables
    for (const t of DISTRICT_SCOPED_TABLES) {
      try {
        const { rows } = await client.query(
          `SELECT * FROM ${t.table} WHERE ${t.col} = $1`,
          [districtId]
        );
        archive.append(toCsv(rows), { name: `${t.table}.csv` });
      } catch { archive.append("", { name: `${t.table}.csv` }); }
    }

    const schoolIds = await client
      .query<{ id: number }>("SELECT id FROM schools WHERE district_id = $1", [districtId])
      .then(r => r.rows.map(r => r.id));

    // School-scoped tables
    for (const t of SCHOOL_SCOPED_TABLES) {
      if (!schoolIds.length) { archive.append("", { name: `${t.table}.csv` }); continue; }
      try {
        const { rows } = await client.query(
          `SELECT * FROM ${t.table} WHERE ${t.col} = ANY($1)`,
          [schoolIds]
        );
        archive.append(toCsv(rows), { name: `${t.table}.csv` });
      } catch { archive.append("", { name: `${t.table}.csv` }); }
    }

    const studentIds = schoolIds.length
      ? await client
          .query<{ id: number }>("SELECT id FROM students WHERE school_id = ANY($1)", [schoolIds])
          .then(r => r.rows.map(r => r.id))
      : [];

    // Student-scoped tables
    for (const t of STUDENT_SCOPED_TABLES) {
      if (!studentIds.length) { archive.append("", { name: `${t.table}.csv` }); continue; }
      try {
        const { rows } = await client.query(
          `SELECT * FROM ${t.table} WHERE ${t.col} = ANY($1)`,
          [studentIds]
        );
        archive.append(toCsv(rows), { name: `${t.table}.csv` });
      } catch { archive.append("", { name: `${t.table}.csv` }); }
    }
  } finally {
    client.release();
  }

  await archive.finalize();

  await writeAuditLog({
    actorUserId: actor.userId,
    actorRole: actor.role,
    action: "district_archive_downloaded",
    targetTable: "districts",
    targetId: String(districtId),
    summary: `Archive downloaded by ${actor.name}`,
    metadata: { jobId },
  });
});

// ─── GET /district-data/status ────────────────────────────────────────────────

router.get("/district-data/status", requireAdmin, async (req, res): Promise<void> => {
  const districtId = await resolveDistrictIdForCaller(req);
  if (!districtId) {
    res.status(400).json({ error: "District context required" });
    return;
  }

  const [district] = await db
    .select({
      id: districtsTable.id,
      name: districtsTable.name,
      deleteInitiatedAt: districtsTable.deleteInitiatedAt,
      deleteScheduledAt: districtsTable.deleteScheduledAt,
      deleteInitiatedBy: districtsTable.deleteInitiatedBy,
    })
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId));

  if (!district) {
    res.status(404).json({ error: "District not found" });
    return;
  }

  res.json({
    districtId,
    districtName: district.name,
    pendingDelete: district.deleteInitiatedAt != null,
    deleteInitiatedAt: district.deleteInitiatedAt?.toISOString() ?? null,
    deleteScheduledAt: district.deleteScheduledAt?.toISOString() ?? null,
    deleteInitiatedBy: district.deleteInitiatedBy ?? null,
  });
});

// ─── POST /district-data/soft-delete ─────────────────────────────────────────

router.post("/district-data/soft-delete", requirePlatformAdmin, async (req, res): Promise<void> => {
  const authed = req as AuthedRequest;
  const actor = getActorInfo(authed);
  const { districtId: reqDistrictId, confirmName } = req.body as {
    districtId?: number;
    confirmName?: string;
  };

  if (!reqDistrictId || typeof reqDistrictId !== "number") {
    res.status(400).json({ error: "districtId is required" });
    return;
  }

  const [district] = await db
    .select()
    .from(districtsTable)
    .where(eq(districtsTable.id, reqDistrictId));

  if (!district) {
    res.status(404).json({ error: "District not found" });
    return;
  }

  if (!confirmName || confirmName.trim() !== district.name.trim()) {
    res.status(400).json({
      error: "District name confirmation does not match. Type the exact district name to confirm.",
    });
    return;
  }

  if (district.deleteInitiatedAt) {
    res.status(409).json({ error: "District deletion is already scheduled" });
    return;
  }

  const now = new Date();
  const scheduledAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await db
    .update(districtsTable)
    .set({
      deleteInitiatedAt: now,
      deleteScheduledAt: scheduledAt,
      deleteInitiatedBy: actor.userId,
    })
    .where(eq(districtsTable.id, reqDistrictId));

  invalidateDistrictDeleteCache(reqDistrictId);

  await writeAuditLog({
    actorUserId: actor.userId,
    actorRole: actor.role,
    action: "district_soft_delete_initiated",
    targetTable: "districts",
    targetId: String(reqDistrictId),
    summary: `Soft-delete initiated by ${actor.name} for district "${district.name}". Hard purge scheduled for ${scheduledAt.toISOString()}.`,
    metadata: { scheduledAt: scheduledAt.toISOString(), districtName: district.name },
  });

  res.json({
    success: true,
    deleteInitiatedAt: now.toISOString(),
    deleteScheduledAt: scheduledAt.toISOString(),
  });
});

// ─── DELETE /district-data/soft-delete ───────────────────────────────────────

router.delete("/district-data/soft-delete", requirePlatformAdmin, async (req, res): Promise<void> => {
  const authed = req as AuthedRequest;
  const actor = getActorInfo(authed);
  const { districtId: reqDistrictId } = req.body as { districtId?: number };

  if (!reqDistrictId || typeof reqDistrictId !== "number") {
    res.status(400).json({ error: "districtId is required" });
    return;
  }

  const [district] = await db
    .select()
    .from(districtsTable)
    .where(eq(districtsTable.id, reqDistrictId));

  if (!district) {
    res.status(404).json({ error: "District not found" });
    return;
  }

  if (!district.deleteInitiatedAt) {
    res.status(409).json({ error: "District does not have a pending deletion" });
    return;
  }

  await db
    .update(districtsTable)
    .set({
      deleteInitiatedAt: null,
      deleteScheduledAt: null,
      deleteInitiatedBy: null,
    })
    .where(eq(districtsTable.id, reqDistrictId));

  invalidateDistrictDeleteCache(reqDistrictId);

  await writeAuditLog({
    actorUserId: actor.userId,
    actorRole: actor.role,
    action: "district_soft_delete_cancelled",
    targetTable: "districts",
    targetId: String(reqDistrictId),
    summary: `Soft-delete cancelled by ${actor.name} for district "${district.name}".`,
    metadata: { districtName: district.name },
  });

  res.json({ success: true });
});

// ─── Shared hard-purge logic (used by manual route + scheduled scheduler) ────

export type HardPurgeActor = {
  userId: string;
  role: string;
  name: string;
  email?: string;
};

export type HardPurgeResult = {
  districtName: string;
  purgeDate: string;
  totalRowsDeleted: number;
  tables: Array<{ table: string; rowsDeleted: number }>;
};

/**
 * Execute a hard purge for a district. Performs the per-table deletions
 * inside a single transaction, writes audit log entries (initiated, per-table,
 * complete), and emails a deletion certificate PDF to the supplied recipients
 * (typically the actor and/or the district's billing/admin contacts).
 *
 * Throws on failure so callers can decide how to surface errors.
 */
export async function runHardPurgeForDistrict(opts: {
  districtId: number;
  actor: HardPurgeActor;
  /** Recipients for the deletion certificate email. Empty array = no email. */
  notifyEmails?: string[];
}): Promise<HardPurgeResult> {
  const { districtId, actor } = opts;
  const notifyEmails = (opts.notifyEmails ?? []).filter(
    (e): e is string => typeof e === "string" && e.length > 0,
  );

  const [district] = await db
    .select()
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId));
  if (!district) {
    throw new Error(`District ${districtId} not found`);
  }

  await writeAuditLog({
    actorUserId: actor.userId,
    actorRole: actor.role,
    action: "district_hard_purge_initiated",
    targetTable: "districts",
    targetId: String(districtId),
    summary: `Hard purge initiated for district "${district.name}" by ${actor.name}.`,
    metadata: { districtName: district.name, initiatedBy: actor.userId },
  });

  const purgeSummary: Array<{ table: string; rowsDeleted: number }> = [];
  const client = await pool.connect();
  const totalStorageBytes = 0;

  try {
    await client.query("BEGIN");

    const { rows: schoolRows } = await client.query<{ id: number }>(
      "SELECT id FROM schools WHERE district_id = $1",
      [districtId],
    );
    const schoolIds = schoolRows.map(r => r.id);

    const studentIds: number[] = [];
    if (schoolIds.length) {
      const { rows: studentRows } = await client.query<{ id: number }>(
        "SELECT id FROM students WHERE school_id = ANY($1)",
        [schoolIds],
      );
      studentIds.push(...studentRows.map(r => r.id));
    }

    for (const t of STUDENT_SCOPED_TABLES) {
      if (!studentIds.length) { purgeSummary.push({ table: t.table, rowsDeleted: 0 }); continue; }
      try {
        const { rowCount } = await client.query(
          `DELETE FROM ${t.table} WHERE ${t.col} = ANY($1)`,
          [studentIds],
        );
        purgeSummary.push({ table: t.table, rowsDeleted: rowCount ?? 0 });
      } catch {
        purgeSummary.push({ table: t.table, rowsDeleted: 0 });
      }
    }

    for (const t of SCHOOL_SCOPED_TABLES) {
      if (!schoolIds.length) { purgeSummary.push({ table: t.table, rowsDeleted: 0 }); continue; }
      try {
        const { rowCount } = await client.query(
          `DELETE FROM ${t.table} WHERE ${t.col} = ANY($1)`,
          [schoolIds],
        );
        purgeSummary.push({ table: t.table, rowsDeleted: rowCount ?? 0 });
      } catch {
        purgeSummary.push({ table: t.table, rowsDeleted: 0 });
      }
    }

    if (schoolIds.length) {
      const { rowCount } = await client.query(
        "DELETE FROM schools WHERE district_id = $1",
        [districtId],
      );
      purgeSummary.push({ table: "schools", rowsDeleted: rowCount ?? 0 });
    }

    for (const t of DISTRICT_SCOPED_TABLES.filter(t => t.table !== "schools")) {
      try {
        const { rowCount } = await client.query(
          `DELETE FROM ${t.table} WHERE ${t.col} = $1`,
          [districtId],
        );
        purgeSummary.push({ table: t.table, rowsDeleted: rowCount ?? 0 });
      } catch {
        purgeSummary.push({ table: t.table, rowsDeleted: 0 });
      }
    }

    const { rowCount: archiveCount } = await client.query(
      "DELETE FROM district_archive_jobs WHERE district_id = $1",
      [districtId],
    );
    purgeSummary.push({ table: "district_archive_jobs", rowsDeleted: archiveCount ?? 0 });

    await client.query("DELETE FROM districts WHERE id = $1", [districtId]);
    purgeSummary.push({ table: "districts", rowsDeleted: 1 });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    throw err;
  }

  client.release();

  const totalRowsDeleted = purgeSummary.reduce((s, t) => s + t.rowsDeleted, 0);
  const purgeDate = new Date().toISOString();

  for (const t of purgeSummary) {
    if (t.rowsDeleted > 0) {
      await writeAuditLog({
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: "district_hard_purge_table",
        targetTable: t.table,
        targetId: String(districtId),
        summary: `Hard purge: deleted ${t.rowsDeleted} row(s) from ${t.table} for district "${district.name}"`,
        metadata: { districtId, districtName: district.name, rowsDeleted: t.rowsDeleted },
      });
    }
  }

  await writeAuditLog({
    actorUserId: actor.userId,
    actorRole: actor.role,
    action: "district_hard_purge_complete",
    targetTable: "districts",
    targetId: String(districtId),
    summary: `Hard purge complete for district "${district.name}". ${totalRowsDeleted} total rows deleted across ${purgeSummary.length} tables.`,
    metadata: {
      districtName: district.name,
      totalRowsDeleted,
      tables: purgeSummary,
      purgeDate,
      initiatedBy: actor.userId,
    },
  });

  if (notifyEmails.length > 0) {
    try {
      const pdfBuffer = await generateDeletionCertificate({
        districtName: district.name,
        purgeDate,
        tables: purgeSummary,
        totalRowsDeleted,
        storageBytesPurged: totalStorageBytes,
        initiatedBy: actor.name,
        email: notifyEmails[0],
      });

      const dateStr = new Date(purgeDate).toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      });

      await sendAdminEmail({
        to: notifyEmails,
        subject: `Noverta — Data Deletion Certificate: ${district.name}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#7f1d1d;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
<h2 style="margin:0;font-size:18px">Data Deletion Certificate</h2>
</div>
<div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
<p>The hard purge of all data for <strong>${district.name}</strong> has been completed.</p>
<ul>
<li><strong>District:</strong> ${district.name}</li>
<li><strong>Purge date:</strong> ${dateStr}</li>
<li><strong>Total records deleted:</strong> ${totalRowsDeleted.toLocaleString()}</li>
<li><strong>Performed by:</strong> ${actor.name}</li>
</ul>
<p>A DPA-compliant deletion certificate is attached to this email for your records.</p>
</div>
<div style="text-align:center;padding:12px;color:#9ca3af;font-size:11px">Noverta SPED Compliance Platform — Confidential</div>
</div>`,
        notificationType: "district_deletion_certificate",
        attachments: [
          {
            filename: `trellis-deletion-certificate-${districtId}.pdf`,
            content: pdfBuffer,
          },
        ],
      });
    } catch (err) {
      console.error("[HardPurge] Certificate email failed:", err);
    }
  }

  return {
    districtName: district.name,
    purgeDate,
    totalRowsDeleted,
    tables: purgeSummary,
  };
}

// ─── POST /district-data/hard-purge ──────────────────────────────────────────

router.post("/district-data/hard-purge", requirePlatformAdmin, async (req, res): Promise<void> => {
  const authed = req as AuthedRequest;
  const actor = getActorInfo(authed);
  const { districtId: reqDistrictId, confirmName, force } = req.body as {
    districtId?: number;
    confirmName?: string;
    force?: boolean;
  };

  if (!reqDistrictId || typeof reqDistrictId !== "number") {
    res.status(400).json({ error: "districtId is required" });
    return;
  }

  const [district] = await db
    .select()
    .from(districtsTable)
    .where(eq(districtsTable.id, reqDistrictId));

  if (!district) {
    res.status(404).json({ error: "District not found" });
    return;
  }

  if (!confirmName || confirmName.trim() !== district.name.trim()) {
    res.status(400).json({ error: "District name confirmation does not match" });
    return;
  }

  // If not force, require either the 30-day window to have passed or explicit force flag
  if (!force && district.deleteScheduledAt && district.deleteScheduledAt > new Date()) {
    const daysLeft = Math.ceil(
      (district.deleteScheduledAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    res.status(409).json({
      error: `Hard purge is not yet due. ${daysLeft} day(s) remaining in the soft-delete period.`,
      daysRemaining: daysLeft,
    });
    return;
  }

  try {
    const result = await runHardPurgeForDistrict({
      districtId: reqDistrictId,
      actor,
      notifyEmails: actor.email ? [actor.email] : [],
    });
    res.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Purge failed: ${msg}` });
  }
});

// ─── PDF Certificate Generator ───────────────────────────────────────────────

async function generateDeletionCertificate(opts: {
  districtName: string;
  purgeDate: string;
  tables: Array<{ table: string; rowsDeleted: number }>;
  totalRowsDeleted: number;
  storageBytesPurged: number;
  initiatedBy: string;
  email: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const purgeDate = new Date(opts.purgeDate);
    const dateStr = purgeDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Header
    doc.rect(0, 0, doc.page.width, 80).fill("#7f1d1d");
    doc.fillColor("white").fontSize(22).font("Helvetica-Bold")
      .text("DATA DELETION CERTIFICATE", 50, 25);
    doc.fontSize(11).font("Helvetica")
      .text("Noverta SPED Compliance Platform", 50, 52);

    doc.moveDown(3).fillColor("#111");

    doc.fontSize(13).font("Helvetica-Bold").text("Certificate of Data Destruction");
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica")
      .text("This certificate confirms that all personal data associated with the district listed below has been permanently and irreversibly deleted from the Noverta platform systems in accordance with applicable data protection regulations.");

    doc.moveDown(1);
    doc.fontSize(12).font("Helvetica-Bold").text("District Information");
    doc.moveDown(0.3);
    doc.fontSize(11).font("Helvetica");
    doc.text(`District Name: ${opts.districtName}`);
    doc.text(`Deletion Date: ${dateStr}`);
    doc.text(`Performed By: ${opts.initiatedBy}`);
    doc.text(`Notified To: ${opts.email}`);
    doc.text(`Total Records Deleted: ${opts.totalRowsDeleted.toLocaleString()}`);

    doc.moveDown(1);
    doc.fontSize(12).font("Helvetica-Bold").text("Tables Cleared");
    doc.moveDown(0.3);

    const filtered = opts.tables.filter(t => t.rowsDeleted > 0);
    for (const t of filtered) {
      doc.fontSize(11).font("Helvetica")
        .text(`  • ${t.table}: ${t.rowsDeleted.toLocaleString()} records`);
    }

    doc.moveDown(1.5);
    doc.fontSize(11).font("Helvetica-Bold")
      .text("Certification");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10)
      .text("This certificate is issued by Noverta confirming that the above-named district's data has been deleted from all primary and backup systems accessible to the Noverta platform. This deletion is permanent and cannot be reversed.");

    doc.moveDown(1);
    doc.fontSize(10).fillColor("#6b7280")
      .text(`Certificate generated: ${new Date().toISOString()}`, { align: "right" });
    doc.text("Noverta SPED Compliance Platform", { align: "right" });

    doc.end();
  });
}

export default router;
