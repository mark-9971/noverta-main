// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  compensatoryObligationsTable,
  studentsTable,
  serviceRequirementsTable,
  serviceTypesTable,
} from "@workspace/db";
import { eq, and, inArray, asc, sql } from "drizzle-orm";
import { parseSchoolDistrictFilters, buildStudentSubquery } from "./shared";

const router: IRouter = Router();

/**
 * GET /dashboard/makeup-obligations
 *
 * Returns students with open (pending | in_progress) compensatory obligations,
 * including how many days the obligation has been open (aging), sorted oldest-first.
 *
 * Response shape:
 *   Array<{
 *     obligationId:  number
 *     studentId:     number
 *     studentName:   string
 *     serviceType:   string | null
 *     minutesOwed:   number
 *     minutesDelivered: number
 *     minutesRemaining: number
 *     daysOpen:      number   — floor(NOW() - createdAt) in days
 *     createdAt:     string   — ISO timestamp
 *   }>
 */
router.get("/dashboard/makeup-obligations", async (req, res): Promise<void> => {
  try {
    const sdFilters = parseSchoolDistrictFilters(req, req.query);
    const studentScopeFilter = buildStudentSubquery(sdFilters);

    const conditions: any[] = [
      inArray(compensatoryObligationsTable.status, ["pending", "in_progress"]),
    ];

    if (studentScopeFilter) {
      conditions.push(
        sql`${compensatoryObligationsTable.studentId} IN (
          SELECT id FROM students WHERE ${studentScopeFilter}
        )`
      );
    }

    const rows = await db
      .select({
        obligationId: compensatoryObligationsTable.id,
        studentId: compensatoryObligationsTable.studentId,
        studentFirst: studentsTable.firstName,
        studentLast: studentsTable.lastName,
        serviceTypeName: serviceTypesTable.name,
        minutesOwed: compensatoryObligationsTable.minutesOwed,
        minutesDelivered: compensatoryObligationsTable.minutesDelivered,
        createdAt: compensatoryObligationsTable.createdAt,
      })
      .from(compensatoryObligationsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, compensatoryObligationsTable.studentId))
      .leftJoin(
        serviceRequirementsTable,
        eq(serviceRequirementsTable.id, compensatoryObligationsTable.serviceRequirementId)
      )
      .leftJoin(
        serviceTypesTable,
        eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId)
      )
      .where(and(...conditions))
      .orderBy(asc(compensatoryObligationsTable.createdAt));

    const now = Date.now();

    const result = rows.map((r) => {
      const createdMs =
        r.createdAt instanceof Date
          ? r.createdAt.getTime()
          : new Date(r.createdAt as string).getTime();
      const daysOpen = Math.floor((now - createdMs) / (1000 * 60 * 60 * 24));

      return {
        obligationId: r.obligationId,
        studentId: r.studentId,
        studentName:
          r.studentFirst && r.studentLast
            ? `${r.studentFirst} ${r.studentLast}`
            : r.studentFirst ?? r.studentLast ?? "Unknown Student",
        serviceType: r.serviceTypeName ?? null,
        minutesOwed: r.minutesOwed,
        minutesDelivered: r.minutesDelivered ?? 0,
        minutesRemaining: Math.max(0, r.minutesOwed - (r.minutesDelivered ?? 0)),
        daysOpen,
        createdAt:
          r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : (r.createdAt as string),
      };
    });

    res.json(result);
  } catch (err) {
    console.error("[dashboard/makeup-obligations]", err);
    res.status(500).json({ error: "Failed to load makeup obligations" });
  }
});

export default router;
