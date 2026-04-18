// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { staffTable, staffCredentialsTable } from "@workspace/db";
import { eq, and, lte, gte, sql, isNull } from "drizzle-orm";
import { parseSchoolDistrictFilters } from "./shared";

const router: IRouter = Router();

router.get("/dashboard/credential-expiration", async (req, res): Promise<void> => {
  try {
    const sdFilters = parseSchoolDistrictFilters(req, req.query);

    const today = new Date();
    const in60Days = new Date(today);
    in60Days.setDate(today.getDate() + 60);

    const todayStr = today.toISOString().substring(0, 10);
    const in60DaysStr = in60Days.toISOString().substring(0, 10);

    const staffConditions: any[] = [
      eq(staffTable.status, "active"),
      isNull(staffTable.deletedAt),
    ];

    if (sdFilters.districtId) {
      staffConditions.push(
        sql`${staffTable.schoolId} IN (
          SELECT id FROM schools WHERE district_id = ${sdFilters.districtId}
        )`
      );
    } else if (sdFilters.schoolId) {
      staffConditions.push(eq(staffTable.schoolId, sdFilters.schoolId));
    }

    const rows = await db
      .select({
        credentialId: staffCredentialsTable.id,
        staffId: staffTable.id,
        firstName: staffTable.firstName,
        lastName: staffTable.lastName,
        credentialType: staffCredentialsTable.credentialType,
        issuingBody: staffCredentialsTable.issuingBody,
        licenseNumber: staffCredentialsTable.licenseNumber,
        expirationDate: staffCredentialsTable.expirationDate,
      })
      .from(staffCredentialsTable)
      .innerJoin(staffTable, eq(staffCredentialsTable.staffId, staffTable.id))
      .where(
        and(
          gte(staffCredentialsTable.expirationDate, todayStr),
          lte(staffCredentialsTable.expirationDate, in60DaysStr),
          ...staffConditions
        )
      )
      .orderBy(staffCredentialsTable.expirationDate);

    const result = rows.map((row) => {
      const expDate = new Date(row.expirationDate);
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysUntilExpiration = Math.ceil(
        (expDate.getTime() - today.getTime()) / msPerDay
      );
      return {
        credentialId: row.credentialId,
        staffId: row.staffId,
        staffName: `${row.firstName} ${row.lastName}`,
        credentialType: row.credentialType,
        issuingBody: row.issuingBody ?? null,
        licenseNumber: row.licenseNumber ?? null,
        expirationDate: row.expirationDate,
        daysUntilExpiration,
        urgency: daysUntilExpiration <= 14 ? "critical" : "warning",
      };
    });

    res.json(result);
  } catch (err) {
    console.error("[credential-expiration]", err);
    res.status(500).json({ error: "Failed to load credential expiration data" });
  }
});

export default router;
