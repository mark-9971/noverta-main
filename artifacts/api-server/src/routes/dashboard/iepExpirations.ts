// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { studentsTable, iepDocumentsTable } from "@workspace/db";
import { eq, and, sql, isNull } from "drizzle-orm";
import { parseSchoolDistrictFilters } from "./shared";

const router: IRouter = Router();

router.get("/dashboard/iep-expirations", async (req, res): Promise<void> => {
  try {
    const sdFilters = parseSchoolDistrictFilters(req, req.query);

    const today = new Date().toISOString().split("T")[0];
    const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const conditions: ReturnType<typeof sql>[] = [
      eq(iepDocumentsTable.active, true),
      sql`${iepDocumentsTable.iepEndDate} >= ${today}`,
      sql`${iepDocumentsTable.iepEndDate} <= ${in90Days}`,
      isNull(studentsTable.deletedAt),
      sql`${studentsTable.status} = 'active'`,
    ];

    if (sdFilters.schoolId) {
      conditions.push(sql`${studentsTable.schoolId} = ${sdFilters.schoolId}`);
    } else if (sdFilters.districtId) {
      conditions.push(
        sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId})`
      );
    }

    const rows = await db
      .select({
        studentId: studentsTable.id,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
        iepEndDate: iepDocumentsTable.iepEndDate,
      })
      .from(iepDocumentsTable)
      .innerJoin(studentsTable, eq(studentsTable.id, iepDocumentsTable.studentId))
      .where(and(...(conditions as any[])))
      .orderBy(sql`${iepDocumentsTable.iepEndDate} ASC`);

    const result = rows.map((r) => {
      const endMs = new Date(r.iepEndDate).getTime();
      const todayMs = new Date(today).getTime();
      const daysRemaining = Math.ceil((endMs - todayMs) / (1000 * 60 * 60 * 24));
      return {
        studentId: r.studentId,
        studentName: `${r.firstName} ${r.lastName}`,
        iepEndDate: r.iepEndDate,
        daysRemaining,
      };
    });

    res.json(result);
  } catch (e: any) {
    console.error("GET /dashboard/iep-expirations error:", e);
    res.status(500).json({ error: "Failed to fetch IEP expirations" });
  }
});

export default router;
