import { Router, type IRouter } from "express";
import { db, importsTable, staffTable, schoolsTable } from "@workspace/db";
import { and, ilike, eq, isNull } from "drizzle-orm";
import { parseCsvRows, requireAdmin, normalizeDate } from "./shared";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

const VALID_ROLES = new Set([
  "admin", "bcba", "provider", "para", "coordinator",
  "case_manager", "teacher", "slp", "ot", "pt", "counselor",
]);

const ROLE_ALIASES: Record<string, string> = {
  "speech_language_pathologist": "slp",
  "speech_pathologist": "slp",
  "speech_therapist": "slp",
  "speech": "slp",
  "occupational_therapist": "ot",
  "physical_therapist": "pt",
  "paraprofessional": "para",
  "paraeducator": "para",
  "aide": "para",
  "board_certified_behavior_analyst": "bcba",
  "behavior_analyst": "bcba",
  "administrator": "admin",
  "special_education_coordinator": "coordinator",
  "sped_coordinator": "coordinator",
  "teacher_of_record": "teacher",
  "school_counselor": "counselor",
  "school_psychologist": "counselor",
  "social_worker": "counselor",
};

function normalizeRole(raw: string): string | null {
  const r = raw.toLowerCase().trim().replace(/[\s\-]+/g, "_").replace(/[^a-z_]/g, "").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (VALID_ROLES.has(r)) return r;
  if (ROLE_ALIASES[r]) return ROLE_ALIASES[r];
  for (const [key, val] of Object.entries(ROLE_ALIASES)) {
    if (r.includes(key) || key.includes(r)) return val;
  }
  return null;
}

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

router.post("/imports/staff", requireAdmin, async (req, res): Promise<void> => {
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
        const email = row.email || row.email_address || "";
        const roleRaw = row.role || row.position || row.title || "";

        if (!firstName || !lastName) {
          errors.push(`Row ${i + 2}: Missing first_name or last_name`);
          errored++;
          continue;
        }

        const role = normalizeRole(roleRaw);
        if (!role) {
          errors.push(`Row ${i + 2}: Unknown role "${roleRaw}" — expected: slp, ot, pt, bcba, para, counselor, case_manager, teacher, coordinator, admin, provider`);
          errored++;
          continue;
        }

        const existingByEmail = email
          ? await db.select().from(staffTable).where(and(ilike(staffTable.email, email), isNull(staffTable.deletedAt))).limit(1)
          : [];
        const existingByName = existingByEmail.length === 0
          ? await db.select().from(staffTable).where(and(ilike(staffTable.firstName, firstName), ilike(staffTable.lastName, lastName), isNull(staffTable.deletedAt))).limit(1)
          : [];
        const existing = existingByEmail[0] || existingByName[0];

        if (existing) {
          if (duplicateHandling === "update") {
            const schoolId = await findSchoolId(row.school || row.school_name || "");
            await db.update(staffTable).set({
              email: email || existing.email,
              role: role || existing.role,
              title: row.title || row.job_title || existing.title,
              qualifications: row.qualifications || row.credentials || row.license || existing.qualifications,
              hourlyRate: row.hourly_rate ? String(parseFloat(row.hourly_rate)) : existing.hourlyRate,
              npiNumber: row.npi || row.npi_number || existing.npiNumber,
              ...(schoolId ? { schoolId } : {}),
              updatedAt: new Date(),
            }).where(eq(staffTable.id, existing.id));
            updated++;
          } else {
            errors.push(`Row ${i + 2}: Staff "${firstName} ${lastName}" already exists (id=${existing.id}), skipped`);
            skipped++;
          }
          continue;
        }

        const schoolId = await findSchoolId(row.school || row.school_name || "");

        await db.insert(staffTable).values({
          firstName,
          lastName,
          email: email || null,
          role,
          title: row.title || row.job_title || null,
          qualifications: row.qualifications || row.credentials || row.license || null,
          hourlyRate: row.hourly_rate ? String(parseFloat(row.hourly_rate)) : null,
          npiNumber: row.npi || row.npi_number || null,
          schoolId: schoolId ?? undefined,
          status: "active",
        });
        imported++;
      } catch (e: any) {
        console.error(`Staff import row ${i + 2} error:`, e);
        errors.push(`Row ${i + 2}: Failed to import — ${e.message || "unknown error"}`);
        errored++;
      }
    }

    const [importRecord] = await db.insert(importsTable).values({
      districtId: getEnforcedDistrictId(req as AuthedRequest),
      importType: "staff",
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
    console.error("POST /imports/staff error:", e);
    res.status(500).json({ error: "Failed to process staff import" });
  }
});

export default router;
