import { Router, type IRouter } from "express";
import { requireRoles, getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import { runDataHealthChecks } from "../lib/dataHealthChecks";
import {
  db,
  migrationReportServiceRequirementsTable,
  serviceRequirementsTable,
  studentsTable,
  schoolsTable,
} from "@workspace/db";
import { and, eq, isNull, inArray, sql } from "drizzle-orm";

const router: IRouter = Router();

const requireAdmin = requireRoles("admin", "coordinator");

router.get("/data-health", requireAdmin, async (req, res): Promise<void> => {
  try {
    const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
    if (!districtId) {
      res.status(403).json({ error: "District scope required" });
      return;
    }
    const report = await runDataHealthChecks(districtId);
    res.json(report);
  } catch (err) {
    console.error("[DataHealth] Error:", err);
    res.status(500).json({ error: "Failed to run data health check" });
  }
});

/**
 * Mark one migration_report_service_requirements row as resolved. Used by
 * the Data Health "Service Requirements needing review" card after an
 * admin fixes the underlying data (link via supersede / end-date older /
 * delete duplicate). District-scoped: the row must belong to a service
 * requirement on a student in one of the caller's district's schools so
 * one district can never close another district's report rows.
 *
 * Idempotent: re-resolving an already-resolved row returns the existing
 * row unchanged.
 */
router.post("/data-health/migration-report/:id/resolve", requireAdmin, async (req, res): Promise<void> => {
  try {
    const authed = req as unknown as AuthedRequest;
    const districtId = getEnforcedDistrictId(authed);
    if (!districtId) {
      res.status(403).json({ error: "District scope required" });
      return;
    }
    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      res.status(400).json({ error: "Invalid report id" });
      return;
    }

    const districtSchools = await db
      .select({ id: schoolsTable.id })
      .from(schoolsTable)
      .where(eq(schoolsTable.districtId, districtId));
    const schoolIds = districtSchools.map((s) => s.id);
    if (schoolIds.length === 0) {
      res.status(404).json({ error: "Report row not found" });
      return;
    }

    const [row] = await db
      .select({
        id: migrationReportServiceRequirementsTable.id,
        resolvedAt: migrationReportServiceRequirementsTable.resolvedAt,
        studentSchoolId: studentsTable.schoolId,
      })
      .from(migrationReportServiceRequirementsTable)
      .innerJoin(
        serviceRequirementsTable,
        eq(serviceRequirementsTable.id, migrationReportServiceRequirementsTable.requirementId),
      )
      .innerJoin(studentsTable, eq(studentsTable.id, serviceRequirementsTable.studentId))
      .where(
        and(
          eq(migrationReportServiceRequirementsTable.id, reportId),
          inArray(studentsTable.schoolId, schoolIds),
        ),
      )
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Report row not found" });
      return;
    }

    if (row.resolvedAt) {
      res.json({ id: row.id, resolvedAt: row.resolvedAt.toISOString(), alreadyResolved: true });
      return;
    }

    const staffId = authed.tenantStaffId ?? null;
    const [updated] = await db
      .update(migrationReportServiceRequirementsTable)
      .set({ resolvedAt: new Date(), resolvedBy: staffId })
      .where(
        and(
          eq(migrationReportServiceRequirementsTable.id, reportId),
          isNull(migrationReportServiceRequirementsTable.resolvedAt),
        ),
      )
      .returning({
        id: migrationReportServiceRequirementsTable.id,
        resolvedAt: migrationReportServiceRequirementsTable.resolvedAt,
      });

    if (!updated) {
      res.json({ id: row.id, alreadyResolved: true });
      return;
    }

    res.json({
      id: updated.id,
      resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
      alreadyResolved: false,
    });
  } catch (err) {
    console.error("[DataHealth] resolve migration report row failed:", err);
    res.status(500).json({ error: "Failed to mark report row resolved" });
  }
});

/**
 * Restore (unresolve) a previously-resolved migration_report_service_requirements
 * row. Used by the Data Health "Show resolved" list when an admin realizes
 * the underlying fix was wrong and wants the row back in the review queue.
 *
 * Same district scoping as resolve: the row must belong to a service
 * requirement on a student in one of the caller's district's schools.
 *
 * Idempotent: unresolving an already-unresolved row returns the existing
 * row unchanged with `alreadyUnresolved: true`.
 */
router.post("/data-health/migration-report/:id/unresolve", requireAdmin, async (req, res): Promise<void> => {
  try {
    const authed = req as unknown as AuthedRequest;
    const districtId = getEnforcedDistrictId(authed);
    if (!districtId) {
      res.status(403).json({ error: "District scope required" });
      return;
    }
    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      res.status(400).json({ error: "Invalid report id" });
      return;
    }

    const districtSchools = await db
      .select({ id: schoolsTable.id })
      .from(schoolsTable)
      .where(eq(schoolsTable.districtId, districtId));
    const schoolIds = districtSchools.map((s) => s.id);
    if (schoolIds.length === 0) {
      res.status(404).json({ error: "Report row not found" });
      return;
    }

    const [row] = await db
      .select({
        id: migrationReportServiceRequirementsTable.id,
        resolvedAt: migrationReportServiceRequirementsTable.resolvedAt,
      })
      .from(migrationReportServiceRequirementsTable)
      .innerJoin(
        serviceRequirementsTable,
        eq(serviceRequirementsTable.id, migrationReportServiceRequirementsTable.requirementId),
      )
      .innerJoin(studentsTable, eq(studentsTable.id, serviceRequirementsTable.studentId))
      .where(
        and(
          eq(migrationReportServiceRequirementsTable.id, reportId),
          inArray(studentsTable.schoolId, schoolIds),
        ),
      )
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Report row not found" });
      return;
    }

    if (!row.resolvedAt) {
      res.json({ id: row.id, alreadyUnresolved: true });
      return;
    }

    // Guard the UPDATE with `resolved_at IS NOT NULL` so a concurrent
    // unresolve from another admin doesn't double-write nulls; matches the
    // shape of the resolve handler's `IS NULL` guard.
    const [updated] = await db
      .update(migrationReportServiceRequirementsTable)
      .set({ resolvedAt: null, resolvedBy: null })
      .where(
        and(
          eq(migrationReportServiceRequirementsTable.id, reportId),
          sql`${migrationReportServiceRequirementsTable.resolvedAt} IS NOT NULL`,
        ),
      )
      .returning({ id: migrationReportServiceRequirementsTable.id });

    if (!updated) {
      res.json({ id: row.id, alreadyUnresolved: true });
      return;
    }

    res.json({ id: updated.id, alreadyUnresolved: false });
  } catch (err) {
    console.error("[DataHealth] unresolve migration report row failed:", err);
    res.status(500).json({ error: "Failed to unresolve report row" });
  }
});

export default router;
