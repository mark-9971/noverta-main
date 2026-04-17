import { Router, type IRouter } from "express";
import { db, importsTable, studentsTable, staffTable, schoolsTable } from "@workspace/db";
import { and, ilike, eq, isNull } from "drizzle-orm";
import { parseCsvRows, requireAdmin, normalizeDate } from "./shared";

const router: IRouter = Router();

async function findSchoolId(name: string): Promise<number | null> {
  if (!name) return null;
  const schools = await db.select().from(schoolsTable).where(isNull(schoolsTable.deletedAt));
  const n = name.toLowerCase().trim();
  const exact = schools.find(s => s.name.toLowerCase() === n);
  if (exact) return exact.id;
  const partial = schools.find(s => n.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(n));
  if (partial) return partial.id;
  return null;
}

async function findCaseManagerId(name: string): Promise<number | null> {
  if (!name) return null;
  const parts = name.split(",").map(s => s.trim());
  let first = "", last = "";
  if (parts.length === 2) { last = parts[0]; first = parts[1]; }
  else {
    const spaceParts = name.trim().split(/\s+/);
    if (spaceParts.length >= 2) { first = spaceParts[0]; last = spaceParts.slice(1).join(" "); }
    else return null;
  }
  if (!first || !last) return null;
  const found = await db.select({ id: staffTable.id }).from(staffTable)
    .where(and(ilike(staffTable.firstName, first), ilike(staffTable.lastName, last), isNull(staffTable.deletedAt)))
    .limit(1);
  return found.length > 0 ? found[0].id : null;
}

router.post("/imports/students", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { csvData, fileName, duplicateHandling = "skip" } = req.body;
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
    let updated = 0;
    let skipped = 0;
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
          .where(and(ilike(studentsTable.firstName, firstName), ilike(studentsTable.lastName, lastName), isNull(studentsTable.deletedAt)))
          .limit(1);

        const dobRaw = row.date_of_birth || row.dob || row.birth_date || "";
        const dob = normalizeDate(dobRaw);
        const schoolId = await findSchoolId(row.school || row.school_name || row.building || "");
        const caseManagerId = await findCaseManagerId(row.case_manager || row.liaison || row.sped_liaison || "");

        if (existing.length > 0) {
          if (duplicateHandling === "update") {
            await db.update(studentsTable).set({
              externalId: row.external_id || row.student_id || existing[0].externalId,
              grade: row.grade || row.grade_level || existing[0].grade,
              placementType: row.placement_type || row.placement || existing[0].placementType,
              dateOfBirth: dob || existing[0].dateOfBirth,
              disabilityCategory: row.disability_category || row.disability || row.primary_disability || existing[0].disabilityCategory,
              parentGuardianName: row.parent_guardian_name || row.parent_name || row.guardian_name || existing[0].parentGuardianName,
              parentEmail: row.parent_email || row.guardian_email || existing[0].parentEmail,
              parentPhone: row.parent_phone || row.guardian_phone || existing[0].parentPhone,
              medicaidId: row.medicaid_id || existing[0].medicaidId,
              notes: row.notes || existing[0].notes,
              ...(schoolId ? { schoolId } : {}),
              ...(caseManagerId ? { caseManagerId } : {}),
              updatedAt: new Date(),
            }).where(eq(studentsTable.id, existing[0].id));
            updated++;
          } else {
            errors.push(`Row ${i + 2}: Student "${firstName} ${lastName}" already exists (id=${existing[0].id}), skipped`);
            skipped++;
          }
          continue;
        }

        await db.insert(studentsTable).values({
          firstName,
          lastName,
          externalId: row.external_id || row.student_id || null,
          grade: row.grade || row.grade_level || null,
          placementType: row.placement_type || row.placement || null,
          dateOfBirth: dob || null,
          disabilityCategory: row.disability_category || row.disability || row.primary_disability || null,
          parentGuardianName: row.parent_guardian_name || row.parent_name || row.guardian_name || null,
          parentEmail: row.parent_email || row.guardian_email || null,
          parentPhone: row.parent_phone || row.guardian_phone || null,
          medicaidId: row.medicaid_id || null,
          notes: row.notes || null,
          status: "active",
          ...(schoolId ? { schoolId } : {}),
          ...(caseManagerId ? { caseManagerId } : {}),
        });
        imported++;
      } catch (e: any) {
        console.error(`Student import row ${i + 2} error:`, e);
        errors.push(`Row ${i + 2}: Failed to import — ${e.message || "unknown error"}`);
        errored++;
      }
    }

    const [importRecord] = await db.insert(importsTable).values({
      importType: "students",
      fileName: fileName ?? null,
      status: errored === rows.length ? "failed" : "completed",
      rowsProcessed: rows.length,
      rowsImported: imported + updated,
      rowsErrored: errored,
      errorSummary: errors.length > 0 ? errors.slice(0, 50).join("\n") : null,
    }).returning();

    res.status(201).json({
      ...importRecord,
      createdAt: importRecord.createdAt.toISOString(),
      updatedAt: importRecord.updatedAt.toISOString(),
      rowsUpdated: updated,
      rowsSkipped: skipped,
      errors: errors.slice(0, 50),
    });
  } catch (e: any) {
    console.error("POST /imports/students error:", e);
    res.status(500).json({ error: "Failed to process student import" });
  }
});

export default router;
