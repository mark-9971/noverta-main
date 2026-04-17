import { Router, type IRouter } from "express";
import { db, importsTable, sessionLogsTable } from "@workspace/db";
import { findOrGuessStudentId, findServiceTypeId, parseCsvRows, requireAdmin } from "./shared";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

router.post("/imports/sessions", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { csvData, fileName } = req.body;
    if (!csvData || typeof csvData !== "string") {
      res.status(400).json({ error: "csvData is required" });
      return;
    }

    const { rows } = parseCsvRows(csvData);
    if (rows.length === 0) {
      res.status(400).json({ error: "No data rows found" });
      return;
    }

    let imported = 0;
    let errored = 0;
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

        const serviceTypeName = row.service_type || row.service || "";
        const serviceTypeId = serviceTypeName ? await findServiceTypeId(serviceTypeName) : null;

        const sessionDate = row.session_date || row.date || "";
        if (!sessionDate) {
          errors.push(`Row ${i + 2}: Missing session_date`);
          errored++;
          continue;
        }

        const dateNormalized = sessionDate.includes("/")
          ? (() => {
              const parts = sessionDate.split("/");
              return parts.length === 3 ? `${parts[2].padStart(4, "20")}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}` : sessionDate;
            })()
          : sessionDate;

        const duration = parseInt(row.duration_minutes || row.duration || row.minutes || "0");
        if (!duration || duration <= 0) {
          errors.push(`Row ${i + 2}: Invalid duration_minutes`);
          errored++;
          continue;
        }

        const statusRaw = (row.status || "completed").toLowerCase();
        const status = statusRaw.includes("miss") ? "missed" : statusRaw.includes("partial") ? "partial" : "completed";
        const isMakeup = (row.is_makeup || "").toLowerCase() === "true" || (row.is_makeup || "") === "1";

        await db.insert(sessionLogsTable).values({
          studentId,
          serviceTypeId,
          sessionDate: dateNormalized,
          startTime: row.start_time || null,
          endTime: row.end_time || null,
          durationMinutes: duration,
          status,
          isMakeup,
          notes: row.notes || null,
        });
        imported++;
      } catch (e: any) {
        console.error(`Session import row ${i + 2} error:`, e);
        errors.push(`Row ${i + 2}: Failed to import row`);
        errored++;
      }
    }

    const [importRecord] = await db.insert(importsTable).values({
      districtId: getEnforcedDistrictId(req as AuthedRequest),
      importType: "sessions",
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
    console.error("POST /imports/sessions error:", e);
    res.status(500).json({ error: "Failed to process session import" });
  }
});

export default router;
