import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, generatedDocumentsTable, documentAcknowledgmentsTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireRoles, getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import { logAudit } from "../lib/auditLog";
import { sql } from "drizzle-orm";
import { getPublicMeta } from "../lib/clerkClaims";
import sanitizeHtml from "sanitize-html";

const ALLOWED_ROLES = ["admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider"] as const;

const ALLOWED_HTML_TAGS = [
  "html", "head", "body", "title", "style", "meta",
  "div", "p", "span", "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "th", "td",
  "strong", "em", "b", "i", "u", "br", "hr",
  "ul", "ol", "li", "small", "pre", "blockquote",
];

const ALLOWED_HTML_ATTRS: sanitizeHtml.IOptions["allowedAttributes"] = {
  "*": ["style", "class"],
  "th": ["colspan", "rowspan", "style", "class"],
  "td": ["colspan", "rowspan", "style", "class"],
  "meta": ["charset", "name", "content", "http-equiv"],
  "html": ["lang"],
};

function sanitizeHtmlSnapshot(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_HTML_TAGS,
    allowedAttributes: ALLOWED_HTML_ATTRS,
    allowedSchemes: ["data"],
    disallowedTagsMode: "discard",
  });
}

const CreateBody = z.object({
  studentId: z.number().int().positive(),
  type: z.enum(["incident_report", "progress_report", "iep_draft"]),
  title: z.string().min(1).max(500),
  htmlSnapshot: z.string().max(2_000_000).optional(),
  linkedRecordId: z.number().int().positive().optional(),
  status: z.enum(["draft", "finalized"]).default("draft"),
});

const UpdateBody = z.object({
  status: z.enum(["draft", "finalized", "archived"]).optional(),
  title: z.string().min(1).max(500).optional(),
});

const router: IRouter = Router();

async function assertStudentInDistrict(req: Request, studentId: number): Promise<boolean> {
  const authed = req as AuthedRequest;
  const { platformAdmin } = getPublicMeta(authed);
  if (platformAdmin) return true;
  const districtId = getEnforcedDistrictId(authed);
  if (!districtId) return false;
  const rows = await db.execute(sql`
    SELECT 1 FROM students s
    JOIN schools sc ON sc.id = s.school_id
    WHERE s.id = ${studentId} AND sc.district_id = ${districtId}
    LIMIT 1
  `);
  return rows.rows.length > 0;
}

router.get("/generated-documents", requireRoles(...ALLOWED_ROLES), async (req: Request, res: Response): Promise<void> => {
  const studentId = Number(req.query.studentId);
  if (!studentId) { res.status(400).json({ error: "studentId is required" }); return; }
  if (!await assertStudentInDistrict(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const type = req.query.type as string | undefined;
  const conditions = [eq(generatedDocumentsTable.studentId, studentId)];
  if (type) conditions.push(eq(generatedDocumentsTable.type, type));

  const docs = await db
    .select({
      id: generatedDocumentsTable.id,
      studentId: generatedDocumentsTable.studentId,
      type: generatedDocumentsTable.type,
      status: generatedDocumentsTable.status,
      title: generatedDocumentsTable.title,
      linkedRecordId: generatedDocumentsTable.linkedRecordId,
      createdByName: generatedDocumentsTable.createdByName,
      guardianVisible: generatedDocumentsTable.guardianVisible,
      sharedAt: generatedDocumentsTable.sharedAt,
      sharedByName: generatedDocumentsTable.sharedByName,
      createdAt: generatedDocumentsTable.createdAt,
      updatedAt: generatedDocumentsTable.updatedAt,
    })
    .from(generatedDocumentsTable)
    .where(and(...conditions))
    .orderBy(desc(generatedDocumentsTable.createdAt));

  // Batch-fetch acknowledgment counts for shared docs
  const docIds = docs.map(d => d.id);
  const ackRows = docIds.length > 0
    ? await db
        .select({
          documentId: documentAcknowledgmentsTable.documentId,
          count: sql<number>`count(*)::int`,
        })
        .from(documentAcknowledgmentsTable)
        .where(inArray(documentAcknowledgmentsTable.documentId, docIds))
        .groupBy(documentAcknowledgmentsTable.documentId)
    : [];
  const ackMap = new Map(ackRows.map(r => [r.documentId, r.count]));

  res.json(docs.map(d => ({ ...d, acknowledgedCount: ackMap.get(d.id) ?? 0 })));
});

router.get("/generated-documents/:id", requireRoles(...ALLOWED_ROLES), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [doc] = await db.select().from(generatedDocumentsTable).where(eq(generatedDocumentsTable.id, id));
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  if (!await assertStudentInDistrict(req, doc.studentId)) { res.status(403).json({ error: "Access denied" }); return; }
  res.json(doc);
});

router.post("/generated-documents", requireRoles(...ALLOWED_ROLES), async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const authed = req as AuthedRequest;
  if (!await assertStudentInDistrict(req, parsed.data.studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const sanitizedHtml = parsed.data.htmlSnapshot
    ? sanitizeHtmlSnapshot(parsed.data.htmlSnapshot)
    : undefined;

  const [doc] = await db
    .insert(generatedDocumentsTable)
    .values({
      studentId: parsed.data.studentId,
      type: parsed.data.type,
      status: parsed.data.status,
      title: parsed.data.title,
      htmlSnapshot: sanitizedHtml,
      linkedRecordId: parsed.data.linkedRecordId,
      createdByName: authed.displayName || null,
    })
    .returning();

  logAudit(req, {
    action: "create",
    targetTable: "generated_documents",
    targetId: doc.id,
    studentId: doc.studentId,
    summary: `Generated document "${doc.title}" (${doc.type})`,
  });

  res.status(201).json({ id: doc.id, status: doc.status, title: doc.title, type: doc.type, createdAt: doc.createdAt });
});

router.patch("/generated-documents/:id", requireRoles(...ALLOWED_ROLES), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(generatedDocumentsTable).where(eq(generatedDocumentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!await assertStudentInDistrict(req, existing.studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const [updated] = await db
    .update(generatedDocumentsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(generatedDocumentsTable.id, id))
    .returning();

  logAudit(req, {
    action: "update",
    targetTable: "generated_documents",
    targetId: id,
    studentId: existing.studentId,
    summary: `Updated generated document "${updated.title}" → ${updated.status}`,
  });

  res.json(updated);
});

/**
 * PATCH /generated-documents/:id/share
 * Toggles guardian visibility for a document. Staff-only.
 * Body: { guardianVisible: boolean }
 */
router.patch("/generated-documents/:id/share", requireRoles(...ALLOWED_ROLES), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid document id" }); return; }

  const authed = req as AuthedRequest;
  const guardianVisible = req.body?.guardianVisible;
  if (typeof guardianVisible !== "boolean") {
    res.status(400).json({ error: "guardianVisible (boolean) is required" });
    return;
  }

  const [existing] = await db.select().from(generatedDocumentsTable).where(eq(generatedDocumentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!await assertStudentInDistrict(req, existing.studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const now = new Date();
  const [updated] = await db
    .update(generatedDocumentsTable)
    .set({
      guardianVisible,
      sharedAt: guardianVisible ? (existing.sharedAt ?? now) : null,
      sharedByName: guardianVisible ? (authed.displayName || null) : null,
      updatedAt: now,
    })
    .where(eq(generatedDocumentsTable.id, id))
    .returning();

  logAudit(req, {
    action: "update",
    targetTable: "generated_documents",
    targetId: id,
    studentId: existing.studentId,
    summary: guardianVisible
      ? `Shared document "${existing.title}" with guardian portal`
      : `Removed document "${existing.title}" from guardian portal`,
  });

  res.json({
    id: updated.id,
    guardianVisible: updated.guardianVisible,
    sharedAt: updated.sharedAt,
    sharedByName: updated.sharedByName,
  });
});

export default router;
