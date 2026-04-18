import { Router } from "express";
import { db, documentVersionsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";
import { logAudit } from "../../lib/auditLog";
import { assertStudentInDistrict, getUserInfo, parsePositiveInt, VALID_DOC_TYPES } from "./shared";

const router = Router();

router.get("/document-workflow/versions/:documentType/:documentId", async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!districtId) return void res.status(403).json({ error: "No district scope" });
  const { documentType } = req.params;
  const docId = parsePositiveInt(req.params.documentId);
  if (!docId) return void res.status(400).json({ error: "Invalid document ID" });

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
  if (!districtId) return void res.status(403).json({ error: "No district scope" });
  const user = getUserInfo(req as unknown as AuthedRequest);
  const { documentType, title, changeDescription, snapshotData } = req.body;
  const documentId = parsePositiveInt(req.body.documentId);
  const studentId = parsePositiveInt(req.body.studentId);

  if (!documentType || !documentId || !studentId || !title) {
    return void res.status(400).json({ error: "Missing required fields: documentType, documentId, studentId, title" });
  }
  if (!VALID_DOC_TYPES.includes(documentType)) {
    return void res.status(400).json({ error: `Invalid documentType. Must be one of: ${VALID_DOC_TYPES.join(", ")}` });
  }
  if (typeof title !== "string" || title.length > 500) {
    return void res.status(400).json({ error: "Title must be a string under 500 characters" });
  }

  const student = await assertStudentInDistrict(studentId, districtId);
  if (!student) return void res.status(404).json({ error: "Student not found in your district" });

  const MAX_RETRIES = 5;
  let version: typeof documentVersionsTable.$inferSelect | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const existing = await db.select({ max: sql<number>`COALESCE(MAX(${documentVersionsTable.versionNumber}), 0)` })
      .from(documentVersionsTable)
      .where(and(
        eq(documentVersionsTable.documentType, documentType),
        eq(documentVersionsTable.documentId, documentId),
        eq(documentVersionsTable.districtId, districtId),
      ));

    const nextVersion = (existing[0]?.max ?? 0) + 1;

    try {
      [version] = await db.insert(documentVersionsTable).values({
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
      break;
    } catch (err: any) {
      if (err?.code === "23505" && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }

  if (!version) {
    return void res.status(409).json({ error: "Could not allocate a unique version number. Please try again." });
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
