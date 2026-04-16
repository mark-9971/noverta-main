import { db, documentVersionsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

export interface AutoVersionParams {
  documentType: string;
  documentId: number;
  studentId: number;
  districtId: number;
  authorUserId: string;
  authorName: string;
  title: string;
  changeDescription?: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

function computeChangedFields(
  oldValues: Record<string, unknown> | null | undefined,
  newValues: Record<string, unknown> | null | undefined,
): { summary: string; diff: Record<string, { old: unknown; new: unknown }> } | null {
  if (!oldValues || !newValues) return null;

  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(newValues)) {
    const oldVal = oldValues[key];
    const newVal = newValues[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { old: oldVal, new: newVal };
    }
  }

  if (Object.keys(diff).length === 0) return null;

  const fieldNames = Object.keys(diff).map(k => k.replace(/([A-Z])/g, " $1").toLowerCase().trim());
  const summary = `Changed: ${fieldNames.join(", ")}`;
  return { summary, diff };
}

export async function createAutoVersion(params: AutoVersionParams): Promise<void> {
  const { documentType, documentId, studentId, districtId, authorUserId, authorName, title, changeDescription, oldValues, newValues } = params;

  try {
    const existing = await db.select({ max: sql<number>`COALESCE(MAX(${documentVersionsTable.versionNumber}), 0)` })
      .from(documentVersionsTable)
      .where(and(
        eq(documentVersionsTable.documentType, documentType),
        eq(documentVersionsTable.documentId, documentId),
        eq(documentVersionsTable.districtId, districtId),
      ));

    const nextVersion = (existing[0]?.max ?? 0) + 1;

    const changes = computeChangedFields(oldValues, newValues);
    const description = changeDescription || changes?.summary || "Document updated";
    const snapshotData = changes?.diff ? JSON.stringify(changes.diff) : null;

    await db.insert(documentVersionsTable).values({
      documentType,
      documentId,
      studentId,
      districtId,
      versionNumber: nextVersion,
      title,
      changeDescription: description.slice(0, 2000),
      snapshotData,
      authorUserId,
      authorName,
    });
  } catch (err) {
    console.error("[DocumentVersioning] Failed to create auto-version:", err);
  }
}
