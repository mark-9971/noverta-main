import { Router, type IRouter } from "express";
import { db, importsTable, behaviorDataTable, programDataTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRoles } from "../../middlewares/auth";
import {
  detectGoalType,
  findOrCreateBehaviorTarget,
  findOrCreateIepGoal,
  findOrCreateProgramTarget,
  findOrGuessStudentId,
  getOrCreateVagueSession,
  isDateLikeHeader,
  META_HEADERS,
  normalizeDate,
  parseCsvRows,
  parseTsvRows,
} from "./shared";

const router: IRouter = Router();

router.post("/imports/goals-data", requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  try {
    const { csvData, fileName } = req.body;
    if (!csvData || typeof csvData !== "string") {
      res.status(400).json({ error: "csvData is required" });
      return;
    }

    const isTsv = csvData.includes("\t");
    const { headers, rows } = isTsv ? parseTsvRows(csvData) : parseCsvRows(csvData);

    if (rows.length === 0) {
      res.status(400).json({ error: "No data rows found" });
      return;
    }

    const dateColumns = headers.filter(h => !META_HEADERS.has(h) && isDateLikeHeader(h));
    const isTallFormat = headers.includes("date") && headers.includes("value");
    const isWideFormat = dateColumns.length >= 1 && !isTallFormat;

    let imported = 0;
    let errored = 0;
    const errors: string[] = [];

    const processDataPoint = async (
      studentId: number,
      goalType: "behavior" | "skill",
      targetId: number,
      dateStr: string,
      rawValue: string,
      notes: string | null
    ) => {
      const date = normalizeDate(dateStr);
      if (!date) throw new Error(`Invalid date: ${dateStr}`);
      const numValue = parseFloat(rawValue);
      if (isNaN(numValue)) throw new Error(`Invalid value: ${rawValue}`);

      const dataSessionId = await getOrCreateVagueSession(studentId, date);

      if (goalType === "behavior") {
        const existing = await db.select().from(behaviorDataTable)
          .where(and(eq(behaviorDataTable.dataSessionId, dataSessionId), eq(behaviorDataTable.behaviorTargetId, targetId)))
          .limit(1);
        if (existing.length === 0) {
          await db.insert(behaviorDataTable).values({
            dataSessionId,
            behaviorTargetId: targetId,
            value: rawValue,
            notes: notes || null,
          });
        }
      } else {
        const existing = await db.select().from(programDataTable)
          .where(and(eq(programDataTable.dataSessionId, dataSessionId), eq(programDataTable.programTargetId, targetId)))
          .limit(1);
        if (existing.length === 0) {
          const pct = numValue <= 1 ? numValue * 100 : numValue;
          const total = 10;
          const correct = Math.round((pct / 100) * total);
          await db.insert(programDataTable).values({
            dataSessionId,
            programTargetId: targetId,
            trialsTotal: total,
            trialsCorrect: correct,
            percentCorrect: String(pct),
            notes: notes || null,
          });
        }
      }
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const studentId = await findOrGuessStudentId(row);
        if (!studentId) {
          errors.push(`Row ${i + 2}: Could not find student`);
          errored++;
          continue;
        }

        const rawGoalName = row.goal_name || row.goal || row.target_name || row.behavior_name || row.program_name || "";
        if (!rawGoalName) {
          errors.push(`Row ${i + 2}: Missing goal_name`);
          errored++;
          continue;
        }

        const rawType = row.goal_type || row.type || "";
        const goalType = detectGoalType(rawType, rawGoalName);
        const measurementType = row.measurement_type || row.measurement || (goalType === "behavior" ? "frequency" : "percent");
        const targetDirection = row.target_direction || row.direction || (goalType === "behavior" ? "decrease" : "increase");
        const baseline = row.baseline || null;
        const domain = row.goal_area || row.domain || row.service_area || null;

        let targetId: number;
        if (goalType === "behavior") {
          targetId = await findOrCreateBehaviorTarget(studentId, rawGoalName, measurementType, targetDirection, baseline);
        } else {
          targetId = await findOrCreateProgramTarget(studentId, rawGoalName, domain);
        }

        const annualGoal = row.annual_goal || row.goal_description || rawGoalName;
        await findOrCreateIepGoal(studentId, rawGoalName, goalType, targetId, domain || goalType, annualGoal, baseline, domain);

        if (isTallFormat) {
          const dateStr = row.date || row.session_date || "";
          const rawValue = row.value || row.score || "";
          const notes = row.notes || null;
          if (!dateStr || !rawValue) {
            errors.push(`Row ${i + 2}: Missing date or value`);
            errored++;
            continue;
          }
          await processDataPoint(studentId, goalType, targetId, dateStr, rawValue, notes);
          imported++;
        } else if (isWideFormat) {
          let atLeastOne = false;
          for (const col of dateColumns) {
            const rawValue = row[col];
            if (!rawValue || rawValue.trim() === "" || rawValue.trim() === "-" || rawValue.trim().toLowerCase() === "n/a") continue;
            const originalHeader = headers[headers.indexOf(col)];
            try {
              await processDataPoint(studentId, goalType, targetId, originalHeader, rawValue, null);
              atLeastOne = true;
            } catch {
              errors.push(`Row ${i + 2}, date "${originalHeader}": Invalid data`);
            }
          }
          if (atLeastOne) imported++;
          else {
            errors.push(`Row ${i + 2}: No valid data points found`);
            errored++;
          }
        } else {
          errors.push(`Row ${i + 2}: Could not detect data format (needs date+value columns or wide date columns)`);
          errored++;
        }
      } catch (e: any) {
        console.error(`goals-data import row ${i + 2}:`, e?.message);
        errors.push(`Row ${i + 2}: ${e?.message || "Failed"}`);
        errored++;
      }
    }

    const [importRecord] = await db.insert(importsTable).values({
      importType: "goals_data",
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
    console.error("POST /imports/goals-data error:", e);
    res.status(500).json({ error: "Failed to process goals data import" });
  }
});

export default router;
