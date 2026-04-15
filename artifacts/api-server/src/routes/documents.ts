import { Router, type Request, type Response } from "express";
import { Readable } from "stream";
import { randomBytes } from "crypto";
import { z } from "zod";
import { db, documentsTable, signatureRequestsTable } from "@workspace/db";
import type { Document } from "@workspace/db";
import type { SignatureRequest } from "@workspace/db";
import { eq, and, isNull, desc, inArray } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/auth";
import { requireRoles } from "../middlewares/auth";
import { logAudit } from "../lib/auditLog";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

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
  try {
    const [doc] = await db
      .insert(documentsTable)
      .values({
        ...parsed.data,
        uploadedByUserId: authed.userId,
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

    const token = randomBytes(32).toString("hex");

    const [sigReq] = await db
      .insert(signatureRequestsTable)
      .values({
        documentId,
        recipientName: parsed.data.recipientName,
        recipientEmail: parsed.data.recipientEmail,
        token,
      })
      .returning();

    logAudit(req, {
      action: "create",
      targetTable: "signature_requests",
      targetId: sigReq.id,
      studentId: doc.studentId,
      summary: `Created signature request for "${doc.title}" to ${parsed.data.recipientEmail}`,
    });

    const base = `${req.protocol}://${req.get("host")}`;
    const { token: _t, signatureData: _s, ...safeFields } = sigReq;
    res.status(201).json({
      ...safeFields,
      signUrl: `${base}/sign/${token}`,
    });
  } catch (error) {
    console.error("Error creating signature request:", error);
    res.status(500).json({ error: "Failed to create signature request" });
  }
});

router.get("/signature-requests/:token", async (req: Request, res: Response) => {
  try {
    const [sigReq] = await db
      .select()
      .from(signatureRequestsTable)
      .where(eq(signatureRequestsTable.token, req.params.token));

    if (!sigReq) {
      res.status(404).json({ error: "Signature request not found" });
      return;
    }

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, sigReq.documentId));

    res.json({
      id: sigReq.id,
      status: sigReq.status,
      recipientName: sigReq.recipientName,
      document: doc ? {
        id: doc.id,
        title: doc.title,
        category: doc.category,
        fileName: doc.fileName,
        contentType: doc.contentType,
        fileSize: doc.fileSize,
      } : null,
      signedAt: sigReq.signedAt,
    });
  } catch (error) {
    console.error("Error fetching signature request:", error);
    res.status(500).json({ error: "Failed to fetch signature request" });
  }
});

router.get("/signature-requests/:token/document", async (req: Request, res: Response) => {
  try {
    const [sigReq] = await db
      .select()
      .from(signatureRequestsTable)
      .where(eq(signatureRequestsTable.token, req.params.token));

    if (!sigReq) {
      res.status(404).json({ error: "Signature request not found" });
      return;
    }

    if (sigReq.status === "signed") {
      res.status(403).json({ error: "This document has already been signed" });
      return;
    }

    const ageMs = Date.now() - new Date(sigReq.createdAt).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (ageMs > thirtyDaysMs) {
      res.status(410).json({ error: "This signature request has expired" });
      return;
    }

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, sigReq.documentId));
    if (!doc || doc.deletedAt) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    const objectFile = await objectStorageService.getObjectEntityFile(doc.objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

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

router.post("/signature-requests/:token/sign", async (req: Request, res: Response) => {
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
    const [sigReq] = await db
      .select()
      .from(signatureRequestsTable)
      .where(eq(signatureRequestsTable.token, req.params.token));

    if (!sigReq) {
      res.status(404).json({ error: "Signature request not found" });
      return;
    }

    if (sigReq.status === "signed") {
      res.status(400).json({ error: "This document has already been signed" });
      return;
    }

    const ageMs = Date.now() - new Date(sigReq.createdAt).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (ageMs > thirtyDaysMs) {
      res.status(410).json({ error: "This signature request has expired" });
      return;
    }

    const forwarded = req.headers["x-forwarded-for"];
    const ipAddress = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket?.remoteAddress || null;

    const [updated] = await db
      .update(signatureRequestsTable)
      .set({
        status: "signed",
        signedAt: new Date(),
        signatureData,
        ipAddress,
      })
      .where(eq(signatureRequestsTable.id, sigReq.id))
      .returning();

    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, sigReq.documentId));

    logAudit(req, {
      action: "update",
      targetTable: "signature_requests",
      targetId: sigReq.id,
      studentId: doc?.studentId ?? null,
      summary: `E-signature completed by "${sigReq.recipientName}" (${sigReq.recipientEmail}) for document "${doc?.title || sigReq.documentId}" from IP ${ipAddress}`,
    });

    res.json({ success: true, signedAt: updated.signedAt });
  } catch (error) {
    console.error("Error signing document:", error);
    res.status(500).json({ error: "Failed to sign document" });
  }
});

export default router;
