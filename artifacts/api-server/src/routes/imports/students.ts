import { Router, type IRouter } from "express";
import { db, importsTable, studentsTable } from "@workspace/db";
import { and, ilike } from "drizzle-orm";
import { parseCsvRows, requireAdmin } from "./shared";

const router: IRouter = Router();

router.post("/imports/students", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { csvData, fileName } = req.body;
    if (!csvData || typeof csvData !== "string") {
      res.status(400).json({ error: "csvData is required" });
      return;
    }

    const { rows } = parseCsvRows(csvData);
    if (rows.length === 0) {
      res.status(400).json({ error: "No data rows found in CSV" });
      return;
    }

    let imported = 0;
    let errored = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const firstName = row.first_name || row.first || row.firstname || "";
        const lastName = row.last_name || row.last || row.lastname || "";

        if (!firstName || !lastName) {
          errors.push(`Row ${i + 2}: Missing first_name or last_name`);
          errored++;
          continue;
        }

        const existing = await db.select().from(studentsTable)
          .where(and(ilike(studentsTable.firstName, firstName), ilike(studentsTable.lastName, lastName)))
          .limit(1);
        if (existing.length > 0) {
          errors.push(`Row ${i + 2}: Student "${firstName} ${lastName}" already exists (id=${existing[0].id})`);
          errored++;
          continue;
        }

        await db.insert(studentsTable).values({
          firstName,
          lastName,
          externalId: row.external_id || row.student_id || null,
          grade: row.grade || row.grade_level || null,
          placementType: row.placement_type || null,
          notes: row.notes || null,
          status: "active",
        });
        imported++;
      } catch (e: any) {
        console.error(`Student import row ${i + 2} error:`, e);
        errors.push(`Row ${i + 2}: Failed to import row`);
        errored++;
      }
    }

    const [importRecord] = await db.insert(importsTable).values({
      importType: "students",
      fileName: fileName ?? null,
      status: errored === rows.length ? "failed" : "completed",
      rowsProcessed: rows.length,
      rowsImported: imported,
      rowsErrored: errored,
      errorSummary: errors.length > 0 ? errors.slice(0, 20).join("\n") : null,
    }).returning();

    res.status(201).json({
      ...importRecord,
      createdAt: importRecord.createdAt.toISOString(),
      updatedAt: importRecord.updatedAt.toISOString(),
      errors: errors.slice(0, 20),
    });
  } catch (e: any) {
    console.error("POST /imports/students error:", e);
    res.status(500).json({ error: "Failed to process student import" });
  }
});

export default router;
