import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { auditLogsTable, legalAcceptancesTable, staffTable, schoolsTable } from "@workspace/db/schema";
import { requireAuth, requireRoles, type AuthedRequest } from "../middlewares/auth";
import { LEGAL_VERSIONS, LEGAL_DOC_LABELS } from "../lib/legalVersions";
import { logger } from "../lib/logger";
import { eq, and, sql } from "drizzle-orm";

// tenant-scope: district-join
const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getAcceptanceStatus(userId: string) {
  // Use DISTINCT ON to get the latest acceptance per document type.
  // Multiple rows may exist for the same (user, documentType) when versions change —
  // we always want the most recent one to determine currency.
  const rows = await db.execute<{
    document_type: string;
    document_version: string;
    accepted_at: Date;
  }>(sql`
    SELECT DISTINCT ON (document_type)
      document_type, document_version, accepted_at
    FROM legal_acceptances
    WHERE user_id = ${userId}
    ORDER BY document_type, accepted_at DESC
  `);

  const acceptedMap = new Map(rows.rows.map(r => [r.document_type, r]));

  return Object.entries(LEGAL_VERSIONS).map(([docType, currentVersion]) => {
    const row = acceptedMap.get(docType);
    const required = !row || row.document_version !== currentVersion;
    return {
      documentType: docType,
      documentLabel: LEGAL_DOC_LABELS[docType] ?? docType,
      documentVersion: currentVersion,
      required,
      acceptedAt: row?.accepted_at ? new Date(row.accepted_at).toISOString() : null,
    };
  });
}

/** Resolve the primary email for a Clerk user ID. Cached locally per call, not across calls. */
async function resolveClerkEmail(userId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const primary = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId);
    return primary?.emailAddress
      ?? user.emailAddresses[0]?.emailAddress
      ?? null;
  } catch {
    return null;
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/legal/acceptance-status
 * Returns which documents the current user needs to accept.
 * Intentionally does NOT require district scope — runs before the app shell renders.
 */
router.get("/legal/acceptance-status", requireAuth, async (req, res) => {
  const authed = req as unknown as AuthedRequest;

  // Exempt roles: consistent with frontend gate and middleware.
  const EXEMPT_ROLES = ["sped_parent", "sped_student"];
  if (authed.trellisRole && EXEMPT_ROLES.includes(authed.trellisRole)) {
    const documents = Object.entries(LEGAL_VERSIONS).map(([documentType, documentVersion]) => ({
      documentType,
      documentLabel: LEGAL_DOC_LABELS[documentType] ?? documentType,
      documentVersion,
      required: false,
      acceptedAt: null,
    }));
    res.json({ required: false, documents });
    return;
  }

  try {
    const documents = await getAcceptanceStatus(authed.userId);
    const required = documents.some(d => d.required);
    res.json({ required, documents });
  } catch (err) {
    logger.error({ err }, "[legal] acceptance-status error");
    res.status(500).json({ error: "Failed to load acceptance status" });
  }
});

/**
 * POST /api/legal/accept
 * Records acceptance of one or more documents for the current user.
 * Body: { acceptances: Array<{ documentType: string, documentVersion: string }> }
 */
router.post("/legal/accept", requireAuth, async (req, res) => {
  const authed = req as unknown as AuthedRequest;
  const { acceptances } = req.body as {
    acceptances?: Array<{ documentType: string; documentVersion: string }>;
  };

  if (!Array.isArray(acceptances) || acceptances.length === 0) {
    res.status(400).json({ error: "acceptances array is required" });
    return;
  }

  const ipAddress =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? null;
  const userAgent =
    typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;
  const now = new Date();

  const userEmail = await resolveClerkEmail(authed.userId);

  try {
    for (const { documentType, documentVersion } of acceptances) {
      if (!LEGAL_VERSIONS[documentType]) continue;
      if (LEGAL_VERSIONS[documentType] !== documentVersion) continue;

      await db
        .insert(legalAcceptancesTable)
        .values({
          userId: authed.userId,
          userEmail,
          documentType,
          documentVersion,
          acceptedAt: now,
          ipAddress,
          userAgent,
        })
        .onConflictDoNothing();
    }

    await db.insert(auditLogsTable).values({
      actorUserId: authed.userId,
      actorRole: authed.trellisRole ?? "staff",
      action: "legal_accepted",
      targetTable: "legal_acceptances",
      targetId: null,
      ipAddress,
      summary: `Accepted: ${acceptances.map(a => `${LEGAL_DOC_LABELS[a.documentType] ?? a.documentType} v${a.documentVersion}`).join(", ")}`,
      metadata: { acceptances, acceptedAt: now.toISOString(), userEmail },
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[legal] accept error");
    res.status(500).json({ error: "Failed to record acceptance" });
  }
});

/**
 * GET /api/legal/acceptance-report
 * Admin report: all staff in this district with their acceptance status per document.
 * Joins legal_acceptances by email since staff table has no Clerk user ID column.
 */
router.get(
  "/legal/acceptance-report",
  requireRoles("admin", "coordinator"),
  async (req, res) => {
    const authed = req as unknown as AuthedRequest;
    const districtId = authed.tenantDistrictId;
    if (!districtId) {
      res.status(403).json({ error: "District scope required" });
      return;
    }

    try {
      // Include ALL active staff — including those without email (they will show as
      // "unresolvable" in the report since acceptance is matched by email).
      const staff = await db
        .select({
          name: sql<string>`${staffTable.firstName} || ' ' || ${staffTable.lastName}`,
          email: staffTable.email,
          role: staffTable.role,
        })
        .from(staffTable)
        .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
        .where(
          and(
            eq(schoolsTable.districtId, districtId),
            sql`${staffTable.deletedAt} IS NULL`,
          ),
        );

      // Only query acceptances for staff who have a resolvable email.
      const emails = staff
        .map(s => s.email?.toLowerCase())
        .filter((e): e is string => !!e);

      // DISTINCT ON (user_email, document_type) ordered by accepted_at DESC gives the
      // latest acceptance per (staff member, document) — correct even after version bumps.
      // Uses parameterized query (no sql.raw) to safely pass the emails array.
      type LatestAccRow = { user_email: string; document_type: string; document_version: string; accepted_at: Date };
      const allAcceptances: LatestAccRow[] = emails.length
        ? (await db.execute<LatestAccRow>(sql`
            SELECT DISTINCT ON (lower(user_email), document_type)
              user_email, document_type, document_version, accepted_at
            FROM legal_acceptances
            WHERE lower(user_email) = ANY(${emails}::text[])
            ORDER BY lower(user_email), document_type, accepted_at DESC
          `)).rows
        : [];

      // Key: lowercase email → Map<documentType, latest row>
      const byEmail = new Map<string, Map<string, LatestAccRow>>();
      for (const row of allAcceptances) {
        const key = (row.user_email ?? "").toLowerCase();
        if (!byEmail.has(key)) byEmail.set(key, new Map());
        byEmail.get(key)!.set(row.document_type, row);
      }

      const result = staff.map(s => {
        const emailKey = (s.email ?? "").toLowerCase();
        const userDocMap = byEmail.get(emailKey) ?? new Map<string, LatestAccRow>();

        const documents = Object.entries(LEGAL_VERSIONS).map(([docType, currentVersion]) => {
          const row = userDocMap.get(docType);
          return {
            documentType: docType,
            documentLabel: LEGAL_DOC_LABELS[docType] ?? docType,
            currentVersion,
            acceptedVersion: row?.document_version ?? null,
            acceptedAt: row?.accepted_at ? new Date(row.accepted_at).toISOString() : null,
            isCurrent: !!row && row.document_version === currentVersion,
          };
        });

        return {
          name: s.name,
          email: s.email,
          role: s.role,
          allAccepted: documents.every(d => d.isCurrent),
          documents,
        };
      });

      res.json({ staff: result, versions: LEGAL_VERSIONS, docLabels: LEGAL_DOC_LABELS });
    } catch (err) {
      logger.error({ err }, "[legal] acceptance-report error");
      res.status(500).json({ error: "Failed to load acceptance report" });
    }
  },
);

/**
 * POST /api/legal/request-dpa
 * Records a DPA request from an admin user.
 */
router.post(
  "/legal/request-dpa",
  requireRoles("admin", "coordinator"),
  async (req, res) => {
    const authed = req as unknown as AuthedRequest;
    const { districtName, contactName, contactEmail, contactTitle, notes } =
      req.body as Record<string, string>;

    if (!districtName || !contactName || !contactEmail) {
      res.status(400).json({ error: "districtName, contactName, and contactEmail are required" });
      return;
    }

    try {
      await db.insert(auditLogsTable).values({
        action: "dpa_request",
        targetTable: "legal",
        targetId: null,
        actorUserId: authed.userId,
        actorRole: authed.trellisRole ?? "admin",
        summary: `DPA request from ${contactName} (${districtName})`,
        metadata: {
          districtName,
          contactName,
          contactEmail,
          contactTitle: contactTitle ?? null,
          notes: notes ?? null,
          requestedAt: new Date().toISOString(),
        },
      });

      res.json({ ok: true, message: "DPA request recorded. Noverta will follow up within 2 business days." });
    } catch (err) {
      logger.error({ err }, "[legal] dpa-request error");
      res.status(500).json({ error: "Failed to record request" });
    }
  },
);

export default router;
