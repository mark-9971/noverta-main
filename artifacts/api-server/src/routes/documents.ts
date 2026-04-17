import { Router, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { db, documentsTable, signatureRequestsTable } from "@workspace/db";
import type { Document } from "@workspace/db";
import type { SignatureRequest } from "@workspace/db";
import { eq, and, isNull, or, desc, inArray, sql } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/auth";
import { requireRoles } from "../middlewares/auth";
import { logAudit } from "../lib/auditLog";
import { assertStudentAccess, getStudentSchoolId, tenantObjectPrefix } from "../lib/tenantAccess";
import { assertStudentInCallerDistrict } from "../lib/districtScope";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { getClientIp } from "../lib/clientIp";
import { SlidingWindowLimiter } from "../lib/rateLimiter";

// tenant-scope: param-guard
/**
 * Rate limiters for the public, unauthenticated signature-request routes.
 *
 * Process-local — see lib/shareLinks.ts for the same caveat: a multi-instance
 * deployment should swap to a Redis-backed store. Both per-token and per-IP
 * keys are enforced; per-IP catches token enumeration, per-token catches
 * brute force against a single (already-known) URL.
 */
const SIG_RATE_PER_TOKEN_WINDOW_MS = 60_000;
const SIG_RATE_PER_TOKEN_MAX = 30;
const SIG_RATE_PER_IP_WINDOW_MS = 60_000;
const SIG_RATE_PER_IP_MAX = 60;
const sigTokenLimiter = new SlidingWindowLimiter(SIG_RATE_PER_TOKEN_WINDOW_MS, SIG_RATE_PER_TOKEN_MAX);
const sigIpLimiter = new SlidingWindowLimiter(SIG_RATE_PER_IP_WINDOW_MS, SIG_RATE_PER_IP_MAX);

/** TTL is configurable via env; defaults to 30 days, cap at 90. */
function getSignatureTtlMs(): number {
  const raw = parseInt(process.env.SIGNATURE_REQUEST_TTL_DAYS ?? "", 10);
  const days = Number.isFinite(raw) ? Math.max(1, Math.min(raw, 90)) : 30;
  return days * 24 * 60 * 60 * 1000;
}

function hashSignatureToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Look up a signature request by token. Prefers the new hashed column;
 * falls back to the legacy plaintext `token` column for rows issued before
 * the hashing migration. Once all legacy rows have expired this fallback
 * can be removed.
 */
async function findSignatureRequestByToken(token: string): Promise<SignatureRequest | undefined> {
  if (!token || token.length < 16) return undefined;
  const tokenHash = hashSignatureToken(token);
  const [row] = await db
    .select()
    .from(signatureRequestsTable)
    .where(or(
      eq(signatureRequestsTable.tokenHash, tokenHash),
      eq(signatureRequestsTable.token, token),
    ))
    .limit(1);
  return row;
}

/** Express middleware applied to every public /signature-requests/:token route. */
function signatureRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const token = String(req.params.token ?? "");
  if (ip && !sigIpLimiter.allow(ip)) {
    res.status(429).json({ error: "Too many requests, please try again later.", code: "rate_limited" });
    return;
  }
  if (token && !sigTokenLimiter.allow(token)) {
    res.status(429).json({ error: "Too many requests for this link.", code: "rate_limited" });
    return;
  }
  next();
}

export function __resetSignatureLimiters(): void {
  sigTokenLimiter.reset();
  sigIpLimiter.reset();
}

const PRIVILEGED_ROLES = ["admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider"] as const;

const DOCUMENT_CATEGORIES = [
  "iep",
  "evaluation",
  "consent",
  "progress_report",
  "prior_written_notice",
  "meeting_notes",
  "medical",
  "transition",
  "behavior",
  "correspondence",
  "other",
] as const;

const CreateDocumentBody = z.object({
  studentId: z.number().int().positive(),
  category: z.enum(DOCUMENT_CATEGORIES),
  title: z.string().min(1).max(500),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  fileSize: z.number().int().positive(),
  objectPath: z.string().min(1),
  notes: z.string().max(2000).optional(),
});

const UpdateDocumentBody = z.object({
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  title: z.string().min(1).max(500).optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

const CreateSignatureRequestBody = z.object({
  recipientName: z.string().min(1).max(200),
  recipientEmail: z.string().email(),
});

const router = Router();
const objectStorageService = new ObjectStorageService();


router.get("/documents", requireRoles(...PRIVILEGED_ROLES), async (req: Request, res: Response) => {
  const studentId = Number(req.query.studentId);
  if (!studentId) {
    res.status(400).json({ error: "studentId query parameter is required" });
    return;
  }

  if (!await assertStudentAccess(req, studentId)) {
    res.status(403).json({ error: "You don't have access to this student's records" });
    return;
  }

  try {
    const docs = await db
      .select()
      .from(documentsTable)
      .where(and(eq(documentsTable.studentId, studentId), isNull(documentsTable.deletedAt)))
      .orderBy(desc(documentsTable.createdAt));

    const docIds = docs.map((d) => d.id);
    let sigRequests: SignatureRequest[] = [];
    if (docIds.length > 0) {
      sigRequests = await db
        .select()
        .from(signatureRequestsTable)
        .where(inArray(signatureRequestsTable.documentId, docIds));
    }

    const docsWithSigs = docs.map((doc) => ({
      ...doc,
      signatureRequests: sigRequests
        .filter((sr) => sr.documentId === doc.id)
        .map(({ token, signatureData, ...rest }) => rest),
    }));

    logAudit(req, {
      action: "read",
      targetTable: "documents",
      targetId: studentId,
      studentId,
      summary: `Listed ${docs.length} documents for student ${studentId}`,
    });

    res.json(docsWithSigs);
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

router.post("/documents", requireRoles(...PRIVILEGED_ROLES), async (req: Request, res: Response) => {
  const parsed = CreateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const authed = req as AuthedRequest;

  if (!parsed.data.objectPath.startsWith("/objects/uploads/")) {
    res.status(400).json({ error: "Invalid object path" });
    return;
  }

  if (!await assertStudentAccess(req, parsed.data.studentId)) {
    res.status(403).json({ error: "You don't have access to this student's records" });
    return;
  }

  // Enforce tenant-scoped object path: the uploaded file must live under the
  // path segment that was issued for this exact student (schools/{s}/students/{id}).
  // Admins (district-wide access) are exempt. In dev mode, skip if schoolId missing.
  if (authed.trellisRole !== "admin") {
    const studentSchoolId = await getStudentSchoolId(parsed.data.studentId);
    if (studentSchoolId !== null) {
      const expectedPrefix = tenantObjectPrefix(studentSchoolId, parsed.data.studentId);
      if (!parsed.data.objectPath.startsWith(expectedPrefix + "/")) {
        res.status(400).json({ error: "Object path does not match expected tenant scope" });
        return;
      }
    }
  }

  try {
    const [doc] = await db
      .insert(documentsTable)
      .values({
        ...parsed.data,
        uploadedByUserId: authed.userId,
        uploadedByName: authed.displayName || null,
      })
      .returning();

    logAudit(req, {
      action: "create",
      targetTable: "documents",
      targetId: doc.id,
      studentId: doc.studentId,
      summary: `Uploaded document "${doc.title}" (${doc.category})`,
    });

    res.status(201).json(doc);
  } catch (error) {
    console.error("Error creating document:", error);
    res.status(500).json({ error: "Failed to create document" });
  }
});

router.get("/documents/:id/download", requireRoles(...PRIVILEGED_ROLES), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc || doc.deletedAt) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    if (!await assertStudentAccess(req, doc.studentId)) {
      res.status(403).json({ error: "You don't have access to this student's records" });
      return;
    }

    const objectFile = await objectStorageService.getObjectEntityFile(doc.objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

    logAudit(req, {
      action: "read",
      targetTable: "documents",
      targetId: id,
      studentId: doc.studentId,
      summary: `Downloaded document "${doc.title}"`,
    });

    res.status(response.status);
    if (doc.contentType) res.setHeader("Content-Type", doc.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.fileName)}"`);
    response.headers.forEach((value: string, key: string) => {
      if (key.toLowerCase() !== "content-type" && key.toLowerCase() !== "content-disposition") {
        res.setHeader(key, value);
      }
    });

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Document file not found in storage" });
      return;
    }
    console.error("Error downloading document:", error);
    res.status(500).json({ error: "Failed to download document" });
  }
});

router.patch("/documents/:id", requireRoles(...PRIVILEGED_ROLES), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const parsed = UpdateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!existing || existing.deletedAt) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    if (!await assertStudentAccess(req, existing.studentId)) {
      res.status(403).json({ error: "You don't have access to this student's records" });
      return;
    }
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, existing.studentId, res))) return;

    const [updated] = await db
      .update(documentsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(documentsTable.id, id))
      .returning();

    logAudit(req, {
      action: "update",
      targetTable: "documents",
      targetId: id,
      studentId: existing.studentId,
      summary: `Updated document "${updated.title}"`,
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating document:", error);
    res.status(500).json({ error: "Failed to update document" });
  }
});

router.delete("/documents/:id", requireRoles(...PRIVILEGED_ROLES), async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  try {
    const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!existing || existing.deletedAt) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    if (!await assertStudentAccess(req, existing.studentId)) {
      res.status(403).json({ error: "You don't have access to this student's records" });
      return;
    }
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, existing.studentId, res))) return;

    await db
      .update(documentsTable)
      .set({ deletedAt: new Date(), status: "deleted" })
      .where(eq(documentsTable.id, id));

    logAudit(req, {
      action: "delete",
      targetTable: "documents",
      targetId: id,
      studentId: existing.studentId,
      summary: `Deleted document "${existing.title}"`,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

router.post("/documents/:id/signature-requests", requireRoles(...PRIVILEGED_ROLES), async (req: Request, res: Response) => {
  const documentId = Number(req.params.id);
  const parsed = CreateSignatureRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, documentId));
    if (!doc || doc.deletedAt) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    if (!await assertStudentAccess(req, doc.studentId)) {
      res.status(403).json({ error: "You don't have access to this student's records" });
      return;
    }
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, doc.studentId, res))) return;

    // 256-bit random token. Only the SHA-256 hash is persisted, so a DB
    // dump does not yield working URLs.
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashSignatureToken(token);
    const expiresAt = new Date(Date.now() + getSignatureTtlMs());

    const [sigReq] = await db
      .insert(signatureRequestsTable)
      .values({
        documentId,
        recipientName: parsed.data.recipientName,
        recipientEmail: parsed.data.recipientEmail,
        tokenHash,
        expiresAt,
      })
      .returning();

    logAudit(req, {
      action: "create",
      targetTable: "signature_requests",
      targetId: sigReq.id,
      studentId: doc.studentId,
      summary: `Created signature request for "${doc.title}" to ${parsed.data.recipientEmail} (expires ${expiresAt.toISOString()})`,
    });

    const base = `${req.protocol}://${req.get("host")}`;
    const { token: _t, tokenHash: _th, signatureData: _s, ...safeFields } = sigReq;
    res.status(201).json({
      ...safeFields,
      expiresAt: expiresAt.toISOString(),
      signUrl: `${base}/sign/${token}`,
    });
  } catch (error) {
    console.error("Error creating signature request:", error);
    res.status(500).json({ error: "Failed to create signature request" });
  }
});

/**
 * Helper: returns ({sigReq, code}) — `code` is null when the link is usable,
 * otherwise one of the public-facing reason codes.
 */
function classifySignatureRequest(sigReq: SignatureRequest | undefined): { code: string | null; status: number } {
  if (!sigReq) return { code: "not_found", status: 404 };
  if (sigReq.revokedAt) return { code: "revoked", status: 410 };
  if (sigReq.status === "signed") return { code: "signed", status: 410 };
  // Prefer the explicit expiresAt column when set, fall back to the legacy
  // 30-day-from-createdAt rule for rows issued before the migration.
  const exp = sigReq.expiresAt
    ? new Date(sigReq.expiresAt)
    : new Date(new Date(sigReq.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
  if (exp <= new Date()) return { code: "expired", status: 410 };
  return { code: null, status: 200 };
}

router.get("/signature-requests/:token", signatureRateLimit, async (req: Request, res: Response) => {
  try {
    const sigReq = await findSignatureRequestByToken(String(req.params.token ?? ""));
    const { code, status } = classifySignatureRequest(sigReq);
    if (code) { res.status(status).json({ error: code, code }); return; }

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, sigReq!.documentId));

    res.json({
      id: sigReq!.id,
      status: sigReq!.status,
      recipientName: sigReq!.recipientName,
      expiresAt: sigReq!.expiresAt ?? null,
      document: doc ? {
        id: doc.id,
        title: doc.title,
        category: doc.category,
        fileName: doc.fileName,
        contentType: doc.contentType,
        fileSize: doc.fileSize,
      } : null,
      signedAt: sigReq!.signedAt,
    });
  } catch (error) {
    console.error("Error fetching signature request:", error);
    res.status(500).json({ error: "Failed to fetch signature request" });
  }
});

router.get("/signature-requests/:token/document", signatureRateLimit, async (req: Request, res: Response) => {
  try {
    const sigReq = await findSignatureRequestByToken(String(req.params.token ?? ""));
    const { code, status } = classifySignatureRequest(sigReq);
    if (code) { res.status(status).json({ error: code, code }); return; }

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, sigReq!.documentId));
    if (!doc || doc.deletedAt) {
      res.status(404).json({ error: "Document not found", code: "not_found" });
      return;
    }

    const objectFile = await objectStorageService.getObjectEntityFile(doc.objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

    const ipAddress = getClientIp(req);
    // Best-effort view-counter increment + audit. We don't gate on the
    // increment because viewing is allowed multiple times before signing;
    // the column lets ops see if a link is being scraped.
    await db
      .update(signatureRequestsTable)
      .set({
        viewCount: sql`${signatureRequestsTable.viewCount} + 1`,
        lastViewedAt: new Date(),
        lastViewedIp: ipAddress,
      })
      .where(eq(signatureRequestsTable.id, sigReq!.id));
    logAudit(req, {
      action: "read",
      targetTable: "documents",
      targetId: doc.id,
      studentId: doc.studentId,
      summary: `Signer "${sigReq!.recipientName}" viewed document "${doc.title}" via signing token from IP ${ipAddress}`,
    });

    if (doc.contentType) res.setHeader("Content-Type", doc.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.fileName)}"`);
    response.headers.forEach((value: string, key: string) => {
      if (key.toLowerCase() !== "content-type" && key.toLowerCase() !== "content-disposition") {
        res.setHeader(key, value);
      }
    });

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Document file not found" });
      return;
    }
    console.error("Error serving document for signing:", error);
    res.status(500).json({ error: "Failed to load document" });
  }
});

router.post("/signature-requests/:token/sign", signatureRateLimit, async (req: Request, res: Response) => {
  const { signatureData } = req.body;
  if (!signatureData || typeof signatureData !== "string") {
    res.status(400).json({ error: "signatureData is required" });
    return;
  }
  if (signatureData.length > 500_000) {
    res.status(400).json({ error: "signatureData exceeds maximum size" });
    return;
  }
  if (!signatureData.startsWith("data:image/")) {
    res.status(400).json({ error: "signatureData must be a data URI image" });
    return;
  }

  try {
    const sigReq = await findSignatureRequestByToken(String(req.params.token ?? ""));
    const { code, status } = classifySignatureRequest(sigReq);
    if (code) { res.status(status).json({ error: code, code }); return; }

    const ipAddress = getClientIp(req);

    // Atomic claim: only one concurrent sign request can win. The WHERE
    // predicate checks status='pending' and revokedAt IS NULL so neither a
    // double-sign nor a sign-after-revoke race is possible.
    const claimed = await db
      .update(signatureRequestsTable)
      .set({
        status: "signed",
        signedAt: new Date(),
        signatureData,
        ipAddress,
      })
      .where(and(
        eq(signatureRequestsTable.id, sigReq!.id),
        eq(signatureRequestsTable.status, "pending"),
        isNull(signatureRequestsTable.revokedAt),
      ))
      .returning();

    if (claimed.length === 0) {
      // Lost the race or the link was revoked between classification and
      // claim. Re-classify so the response code matches reality.
      const fresh = await findSignatureRequestByToken(String(req.params.token ?? ""));
      const reclass = classifySignatureRequest(fresh);
      res.status(reclass.status || 410).json({ error: reclass.code ?? "signed", code: reclass.code ?? "signed" });
      return;
    }
    const updated = claimed[0]!;
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, sigReq!.documentId));

    logAudit(req, {
      action: "update",
      targetTable: "signature_requests",
      targetId: sigReq!.id,
      studentId: doc?.studentId ?? null,
      summary: `E-signature completed by "${sigReq!.recipientName}" (${sigReq!.recipientEmail}) for document "${doc?.title || sigReq!.documentId}" from IP ${ipAddress}`,
    });

    res.json({ success: true, signedAt: updated.signedAt });
  } catch (error) {
    console.error("Error signing document:", error);
    res.status(500).json({ error: "Failed to sign document" });
  }
});

/**
 * Revoke a pending signature request. Authenticated, district-scoped — only
 * a privileged user from the document's district can do this. After revoke
 * the public token returns 410 with code=revoked.
 */
router.post("/signature-requests/:id/revoke", requireRoles(...PRIVILEGED_ROLES), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [sigReq] = await db.select().from(signatureRequestsTable).where(eq(signatureRequestsTable.id, id));
    if (!sigReq) { res.status(404).json({ error: "Signature request not found" }); return; }

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, sigReq.documentId));
    if (!doc) { res.status(404).json({ error: "Signature request not found" }); return; }

    if (!await assertStudentAccess(req, doc.studentId)) {
      res.status(404).json({ error: "Signature request not found" });
      return;
    }
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, doc.studentId, res))) return;

    const authed = req as AuthedRequest;
    const [updated] = await db
      .update(signatureRequestsTable)
      .set({ revokedAt: new Date(), revokedByUserId: authed.userId ?? null })
      .where(and(eq(signatureRequestsTable.id, id), isNull(signatureRequestsTable.revokedAt)))
      .returning({ id: signatureRequestsTable.id });

    if (!updated) { res.status(409).json({ error: "Already revoked" }); return; }

    logAudit(req, {
      action: "delete",
      targetTable: "signature_requests",
      targetId: id,
      studentId: doc.studentId,
      summary: `Revoked signature request for "${doc.title}"`,
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("Error revoking signature request:", error);
    res.status(500).json({ error: "Failed to revoke signature request" });
  }
});

export default router;
