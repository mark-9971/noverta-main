import { type RequestHandler } from "express";
import { db } from "@workspace/db";
import { legalAcceptancesTable } from "@workspace/db/schema";
import { LEGAL_VERSIONS } from "../lib/legalVersions";
import { type AuthedRequest } from "./auth";
import { logger } from "../lib/logger";
import { eq, sql } from "drizzle-orm";

/**
 * Express middleware that blocks access to student-sensitive routes until
 * the authenticated user has accepted all current legal documents.
 *
 * Apply after `requireAuth` on any route that may expose student PII.
 * Exempt roles (sped_parent, sped_student) are not staff and bypass this check;
 * they receive their own ToS flow through their portal.
 */
export const requireLegalAcceptance: RequestHandler = async (req, res, next) => {
  // Test-mode bypass: consistent with requireAuth's x-test-* header support.
  // Legal acceptance DB rows don't exist for synthetic test users, so skip the
  // check entirely in test mode. This is safe because test mode already requires
  // NODE_ENV=test (never "development" or "production").
  if (process.env.NODE_ENV === "test" && req.headers["x-test-user-id"]) {
    next();
    return;
  }

  const authed = req as unknown as AuthedRequest;
  const userId = authed.userId;

  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const exemptRoles = ["sped_parent", "sped_student"];
  if (authed.trellisRole && exemptRoles.includes(authed.trellisRole)) {
    next();
    return;
  }

  try {
    // Get latest acceptance per document type (DISTINCT ON is PostgreSQL-specific).
    const rows = await db.execute<{
      document_type: string;
      document_version: string;
    }>(sql`
      SELECT DISTINCT ON (document_type)
        document_type, document_version
      FROM ${legalAcceptancesTable}
      WHERE user_id = ${userId}
      ORDER BY document_type, accepted_at DESC
    `);

    const acceptedMap = new Map(rows.rows.map(r => [r.document_type, r.document_version]));

    const missing = Object.entries(LEGAL_VERSIONS).filter(
      ([docType, currentVersion]) => acceptedMap.get(docType) !== currentVersion,
    );

    if (missing.length > 0) {
      res.status(403).json({
        error: "Legal acceptance required",
        code: "LEGAL_ACCEPTANCE_REQUIRED",
        missing: missing.map(([documentType, documentVersion]) => ({ documentType, documentVersion })),
      });
      return;
    }

    next();
  } catch (err) {
    logger.error({ err }, "[legal] requireLegalAcceptance middleware error");
    // Fail closed: if we can't verify acceptance, deny access.
    res.status(503).json({ error: "Could not verify legal acceptance status. Please try again." });
  }
};
