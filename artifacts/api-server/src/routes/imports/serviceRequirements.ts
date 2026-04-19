import { Router, type IRouter } from "express";
import { db, importsTable, serviceRequirementsTable, studentsTable, schoolsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { findOrGuessStudentId, findServiceTypeId, parseCsvRows, requireAdmin } from "./shared";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

router.post("/imports/service-requirements", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { csvData, fileName, source } = req.body;
    const importSource = source === "pilot_csv" ? "pilot_csv" : null;
    if (!csvData || typeof csvData !== "string") {
      res.status(400).json({ error: "csvData is required" });
      return;
    }

    const { rows } = parseCsvRows(csvData);
    if (rows.length === 0) {
      res.status(400).json({ error: "No data rows found" });
      return;
    }

    const enforcedDistrictId = getEnforcedDistrictId(req as unknown as AuthedRequest);

    let imported = 0;
    let errored = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const studentId = await findOrGuessStudentId(row);
        if (!studentId) {
          errors.push(`Row ${i + 2}: Could not find student`);
          errored++;
          continue;
        }

        if (enforcedDistrictId !== null) {
          const [studentDist] = await db
            .select({ districtId: schoolsTable.districtId })
            .from(studentsTable)
            .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
            .where(eq(studentsTable.id, studentId))
            .limit(1);
          if (!studentDist || studentDist.districtId !== enforcedDistrictId) {
            errors.push(`Row ${i + 2}: Student does not belong to your district`);
            errored++;
            continue;
          }
        }

        const serviceTypeName = row.service_type || row.service_area || row.service || "";
        const serviceTypeId = await findServiceTypeId(serviceTypeName);
        if (!serviceTypeId) {
          errors.push(`Row ${i + 2}: Unknown service type "${serviceTypeName}"`);
          errored++;
          continue;
        }

        const minutes = parseInt(row.required_minutes || row.duration_min || row.duration || "0");
        if (!minutes || minutes <= 0) {
          errors.push(`Row ${i + 2}: Invalid required_minutes`);
          errored++;
          continue;
        }

        const interval = (row.interval_type || row.frequency || "monthly").toLowerCase();
        let intervalType = "monthly";
        if (interval.includes("week")) intervalType = "weekly";
        else if (interval.includes("day") || interval.includes("daily")) intervalType = "daily";
        else if (interval.includes("quarter")) intervalType = "quarterly";

        const startDate = row.start_date || new Date().toISOString().split("T")[0];
        const endDate = row.end_date || null;

        const [dup] = await db
          .select({ id: serviceRequirementsTable.id })
          .from(serviceRequirementsTable)
          .where(and(
            eq(serviceRequirementsTable.studentId, studentId),
            eq(serviceRequirementsTable.serviceTypeId, serviceTypeId),
            eq(serviceRequirementsTable.active, true),
          ))
          .limit(1);
        if (dup) {
          const studentLabel = row.student_external_id || row.student_name ||
            `${row.student_first_name || ""} ${row.student_last_name || ""}`.trim() ||
            `student id=${studentId}`;
          errors.push(`Row ${i + 2}: ${studentLabel} already has an active "${serviceTypeName}" requirement — skipped (re-upload won't duplicate it)`);
          skipped++;
          continue;
        }

        await db.insert(serviceRequirementsTable).values({
          studentId,
          serviceTypeId,
          deliveryType: (row.delivery_type || row.service_type_col || "direct").toLowerCase().includes("consult") ? "consult" : "direct",
          requiredMinutes: minutes,
          intervalType,
          startDate,
          endDate,
          notes: row.notes || null,
          active: true,
          source: importSource,
        });
        imported++;
      } catch (e: any) {
        console.error(`Service req import row ${i + 2} error:`, e);
        errors.push(`Row ${i + 2}: Failed to import row`);
        errored++;
      }
    }

    const [importRecord] = await db.insert(importsTable).values({
      districtId: getEnforcedDistrictId(req as unknown as AuthedRequest) as number,
      importType: "service_requirements",
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
      rowsSkipped: skipped,
      errors: errors.slice(0, 20),
    });
  } catch (e: any) {
    console.error("POST /imports/service-requirements error:", e);
    res.status(500).json({ error: "Failed to process service requirements import" });
  }
});

export default router;
