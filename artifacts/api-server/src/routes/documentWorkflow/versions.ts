import { Router } from "express";
import { db, documentVersionsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";
import { logAudit } from "../../lib/auditLog";
import { buildVersionLockKey } from "../../lib/documentVersioning";
import { assertStudentInDistrict, getUserInfo, parsePositiveInt, VALID_DOC_TYPES } from "./shared";

const router = Router();

router.get("/document-workflow/versions/:documentType/:documentId", async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!districtId) { res.status(403).json({ error: "No district scope" }); return; }
  const { documentType } = req.params;
  const docId = parsePositiveInt(req.params.documentId);
  if (!docId) { res.status(400).json({ error: "Invalid document ID" }); return; }

  const versions = await db.select().from(documentVersionsTable)
    .where(and(
      eq(documentVersionsTable.documentType, documentType),
      eq(documentVersionsTable.documentId, docId),
      eq(documentVersionsTable.districtId, districtId),
    ))
    .orderBy(desc(documentVersionsTable.versionNumber));

  res.json(versions);
});

router.post("/document-workflow/versions", async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!districtId) { res.status(403).json({ error: "No district scope" }); return; }
  const user = getUserInfo(req as unknown as AuthedRequest);
  const { documentType, title, changeDescription, snapshotData } = req.body;
  const documentId = parsePositiveInt(req.body.documentId);
  const studentId = parsePositiveInt(req.body.studentId);

  if (!documentType || !documentId || !studentId || !title) {
    res.status(400).json({ error: "Missing required fields: documentType, documentId, studentId, title" });
    return;
  }
  if (!VALID_DOC_TYPES.includes(documentType)) {
    res.status(400).json({ error: `Invalid documentType. Must be one of: ${VALID_DOC_TYPES.join(", ")}` });
    return;
  }
  if (typeof title !== "string" || title.length > 500) {
    res.status(400).json({ error: "Title must be a string under 500 characters" });
    return;
  }

  const student = await assertStudentInDistrict(studentId, districtId);
  if (!student) { res.status(404).json({ error: "Student not found in your district" }); return; }

  const version = await db.transaction(async (tx) => {
    const lockKey = buildVersionLockKey(documentType, documentId, districtId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

    const existing = await tx.select({ max: sql<number>`COALESCE(MAX(${documentVersionsTable.versionNumber}), 0)` })
      .from(documentVersionsTable)
      .where(and(
        eq(documentVersionsTable.documentType, documentType),
        eq(documentVersionsTable.documentId, documentId),
        eq(documentVersionsTable.districtId, districtId),
      ));

    const nextVersion = (existing[0]?.max ?? 0) + 1;

    const [inserted] = await tx.insert(documentVersionsTable).values({
      documentType,
      documentId,
      studentId,
      districtId,
      versionNumber: nextVersion,
      title,
      changeDescription: typeof changeDescription === "string" ? changeDescription.slice(0, 2000) : null,
      snapshotData: typeof snapshotData === "string" ? snapshotData : null,
      authorUserId: user.userId,
      authorName: user.name,
    }).returning();
    return inserted;
  });

  if (!version) {
    res.status(500).json({ error: "Failed to create document version" });
    return;
  }

  logAudit(req, {
    action: "create",
    targetTable: "document_versions",
    targetId: version.id,
    studentId,
    summary: `Created version ${version.versionNumber} for ${documentType} #${documentId}`,
  });

  res.status(201).json(version);
});

export default router;
