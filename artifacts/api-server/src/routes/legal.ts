import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { auditLogsTable, legalAcceptancesTable, staffTable, schoolsTable } from "@workspace/db/schema";
import { requireAuth, requireRoles, type AuthedRequest } from "../middlewares/auth";
import { LEGAL_VERSIONS, LEGAL_DOC_LABELS } from "../lib/legalVersions";
import { logger } from "../lib/logger";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getAcceptanceStatus(userId: string) {
  const existing = await db
    .select()
    .from(legalAcceptancesTable)
    .where(eq(legalAcceptancesTable.userId, userId));

  const acceptedMap = new Map(existing.map(r => [r.documentType, r]));

  return Object.entries(LEGAL_VERSIONS).map(([docType, currentVersion]) => {
    const row = acceptedMap.get(docType);
    const required = !row || row.documentVersion !== currentVersion;
    return {
      documentType: docType,
      documentLabel: LEGAL_DOC_LABELS[docType] ?? docType,
      documentVersion: currentVersion,
      required,
      acceptedAt: row?.acceptedAt?.toISOString() ?? null,
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
  const authed = req as AuthedRequest;
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
  const authed = req as AuthedRequest;
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
    const authed = req as AuthedRequest;
    const districtId = authed.tenantDistrictId;
    if (!districtId) {
      res.status(403).json({ error: "District scope required" });
      return;
    }

    try {
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
            sql`${staffTable.email} IS NOT NULL`,
          ),
        );

      const emails = staff
        .map(s => s.email?.toLowerCase())
        .filter((e): e is string => !!e);

      const allAcceptances = emails.length
        ? await db
            .select()
            .from(legalAcceptancesTable)
            .where(
              sql`lower(${legalAcceptancesTable.userEmail}) = ANY(${sql.raw(`ARRAY[${emails.map(e => `'${e.replace(/'/g, "''")}'`).join(",")}]`)})`,
            )
        : [];

      const byEmail = new Map<string, typeof allAcceptances>();
      for (const row of allAcceptances) {
        const key = (row.userEmail ?? "").toLowerCase();
        if (!byEmail.has(key)) byEmail.set(key, []);
        byEmail.get(key)!.push(row);
      }

      const result = staff.map(s => {
        const emailKey = (s.email ?? "").toLowerCase();
        const userAcc = byEmail.get(emailKey) ?? [];
        const acceptedMap = new Map(userAcc.map(r => [r.documentType, r]));

        const documents = Object.entries(LEGAL_VERSIONS).map(([docType, currentVersion]) => {
          const row = acceptedMap.get(docType);
          return {
            documentType: docType,
            documentLabel: LEGAL_DOC_LABELS[docType] ?? docType,
            currentVersion,
            acceptedVersion: row?.documentVersion ?? null,
            acceptedAt: row?.acceptedAt?.toISOString() ?? null,
            isCurrent: !!row && row.documentVersion === currentVersion,
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
    const authed = req as AuthedRequest;
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

      res.json({ ok: true, message: "DPA request recorded. Trellis will follow up within 2 business days." });
    } catch (err) {
      logger.error({ err }, "[legal] dpa-request error");
      res.status(500).json({ error: "Failed to record request" });
    }
  },
);

export default router;
