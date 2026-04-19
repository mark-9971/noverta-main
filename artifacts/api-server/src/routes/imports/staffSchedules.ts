import { Router, type IRouter } from "express";
import { db, importsTable, staffSchedulesTable, staffTable, schoolsTable } from "@workspace/db";
import { and, eq, ilike, isNull, sql } from "drizzle-orm";
import { parseCsvRows, requireAdmin, normalizeDate, findServiceTypeId } from "./shared";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

const DAY_ALIASES: Record<string, string> = {
  mon: "monday", monday: "monday", m: "monday", "1": "monday",
  tue: "tuesday", tues: "tuesday", tuesday: "tuesday", t: "tuesday", "2": "tuesday",
  wed: "wednesday", weds: "wednesday", wednesday: "wednesday", w: "wednesday", "3": "wednesday",
  thu: "thursday", thur: "thursday", thurs: "thursday", thursday: "thursday", th: "thursday", "4": "thursday",
  fri: "friday", friday: "friday", f: "friday", "5": "friday",
  sat: "saturday", saturday: "saturday", "6": "saturday",
  sun: "sunday", sunday: "sunday", "7": "sunday",
};

function normalizeDay(raw: string): string | null {
  const r = raw.trim().toLowerCase();
  return DAY_ALIASES[r] ?? null;
}

function normalizeTime(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // Accept HH:MM, H:MM, HH:MM AM/PM, HHMM
  const ampm = /^(\d{1,2}):?(\d{2})\s*(am|pm)$/i.exec(s);
  if (ampm) {
    let hh = parseInt(ampm[1]);
    const mm = ampm[2];
    if (ampm[3].toLowerCase() === "pm" && hh < 12) hh += 12;
    if (ampm[3].toLowerCase() === "am" && hh === 12) hh = 0;
    return `${String(hh).padStart(2, "0")}:${mm}`;
  }
  const hhmm = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (hhmm) return `${hhmm[1].padStart(2, "0")}:${hhmm[2]}`;
  const four = /^(\d{2})(\d{2})$/.exec(s);
  if (four) return `${four[1]}:${four[2]}`;
  return null;
}

async function findStaffId(row: Record<string, string>, districtId: number | null): Promise<number | null> {
  // Scope strictly by staff's primary school's district. Staff with no school
  // assignment cannot be matched here — the admin must first import that staff
  // member with a school in their district before scheduling them.
  const districtCond = districtId !== null
    ? sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${districtId})`
    : sql`true`;

  const email = row.email || row.staff_email || row.provider_email || "";
  if (email) {
    const [hit] = await db.select().from(staffTable)
      .where(and(ilike(staffTable.email, email), isNull(staffTable.deletedAt), districtCond)).limit(1);
    if (hit) return hit.id;
  }
  const ext = row.staff_external_id || row.external_id || row.staff_id || "";
  if (ext) {
    const [hit] = await db.select().from(staffTable)
      .where(and(ilike(staffTable.externalId, ext), isNull(staffTable.deletedAt), districtCond)).limit(1);
    if (hit) return hit.id;
  }
  const first = row.staff_first_name || row.first_name || "";
  const last = row.staff_last_name || row.last_name || "";
  const fullName = row.staff_name || row.provider || row.provider_name || "";
  let f = first, l = last;
  if (!f && !l && fullName) {
    const parts = fullName.split(",").map(s => s.trim());
    if (parts.length === 2) { l = parts[0]; f = parts[1]; }
    else {
      const sp = fullName.trim().split(/\s+/);
      if (sp.length >= 2) { f = sp[0]; l = sp.slice(1).join(" "); }
    }
  }
  if (f && l) {
    const [hit] = await db.select().from(staffTable)
      .where(and(ilike(staffTable.firstName, f), ilike(staffTable.lastName, l), isNull(staffTable.deletedAt), districtCond)).limit(1);
    if (hit) return hit.id;
  }
  return null;
}

async function findSchoolId(name: string, districtId: number | null): Promise<number | null> {
  if (!name) return null;
  const conds = [isNull(schoolsTable.deletedAt)];
  if (districtId !== null) conds.push(eq(schoolsTable.districtId, districtId));
  const schools = await db.select().from(schoolsTable).where(and(...conds));
  const n = name.toLowerCase().trim();
  const exact = schools.find(s => s.name.toLowerCase() === n);
  if (exact) return exact.id;
  const partial = schools.find(s => n.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(n));
  return partial?.id ?? null;
}

router.post("/imports/staff-schedules", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { csvData, fileName, source } = req.body;
    const importSource = source === "pilot_csv" ? "pilot_csv" : null;
    if (!csvData || typeof csvData !== "string") {
      res.status(400).json({ error: "csvData is required" });
      return;
    }

    const { rows } = parseCsvRows(csvData);
    if (rows.length === 0) {
      res.status(400).json({ error: "No data rows found in CSV" });
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
        const staffId = await findStaffId(row, enforcedDistrictId);
        if (!staffId) {
          errors.push(`Row ${i + 2}: Could not find staff member in your district — make sure they were imported in step 2 (use email or first+last name to match)`);
          errored++;
          continue;
        }

        const schoolName = row.school || row.school_name || row.building || "";
        const schoolId = await findSchoolId(schoolName, enforcedDistrictId);
        if (!schoolId) {
          errors.push(`Row ${i + 2}: School "${schoolName}" not found — must match an existing school name`);
          errored++;
          continue;
        }

        const day = normalizeDay(row.day_of_week || row.day || "");
        if (!day) {
          errors.push(`Row ${i + 2}: Invalid day_of_week "${row.day_of_week || row.day || ""}" — expected Mon..Sun`);
          errored++;
          continue;
        }

        const startTime = normalizeTime(row.start_time || row.start || "");
        const endTime = normalizeTime(row.end_time || row.end || "");
        if (!startTime || !endTime) {
          errors.push(`Row ${i + 2}: Missing or invalid start_time/end_time (use HH:MM, e.g. 09:00 or 1:30 PM)`);
          errored++;
          continue;
        }
        if (endTime <= startTime) {
          errors.push(`Row ${i + 2}: end_time must be after start_time`);
          errored++;
          continue;
        }

        const serviceTypeName = row.service_type || row.service || "";
        const serviceTypeId = serviceTypeName ? await findServiceTypeId(serviceTypeName) : null;

        const effFrom = normalizeDate(row.effective_from || row.start_date || "");
        const effTo = normalizeDate(row.effective_to || row.end_date || "");

        const [dup] = await db
          .select({ id: staffSchedulesTable.id })
          .from(staffSchedulesTable)
          .where(and(
            eq(staffSchedulesTable.staffId, staffId),
            eq(staffSchedulesTable.schoolId, schoolId),
            eq(staffSchedulesTable.dayOfWeek, day),
            eq(staffSchedulesTable.startTime, startTime),
            eq(staffSchedulesTable.endTime, endTime),
          ))
          .limit(1);
        if (dup) {
          skipped++;
          continue;
        }

        await db.insert(staffSchedulesTable).values({
          staffId,
          schoolId,
          serviceTypeId: serviceTypeId ?? null,
          dayOfWeek: day,
          startTime,
          endTime,
          label: row.label || row.block_name || null,
          notes: row.notes || null,
          effectiveFrom: effFrom,
          effectiveTo: effTo,
          source: importSource,
        });
        imported++;
      } catch (e: any) {
        console.error(`Staff schedule import row ${i + 2} error:`, e);
        errors.push(`Row ${i + 2}: Failed to import — ${e.message || "unknown error"}`);
        errored++;
      }
    }

    const [importRecord] = await db.insert(importsTable).values({
      districtId: getEnforcedDistrictId(req as unknown as AuthedRequest) as number,
      importType: "staff_schedules",
      fileName: fileName ?? null,
      status: errored === rows.length ? "failed" : "completed",
      rowsProcessed: rows.length,
      rowsImported: imported,
      rowsErrored: errored,
      errorSummary: errors.length > 0 ? errors.slice(0, 50).join("\n") : null,
    }).returning();

    res.status(201).json({
      ...importRecord,
      createdAt: importRecord.createdAt.toISOString(),
      updatedAt: importRecord.updatedAt.toISOString(),
      rowsSkipped: skipped,
      errors: errors.slice(0, 50),
    });
  } catch (e: any) {
    console.error("POST /imports/staff-schedules error:", e);
    res.status(500).json({ error: "Failed to process staff schedules import" });
  }
});

export default router;
