import { type Request, type Response, type NextFunction, type IRouter } from "express";
import { db, restraintIncidentsTable, studentsTable, staffTable, schoolsTable } from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";

/**
 * Tenant guard for all incident /:id routes (GET, PATCH, DELETE, POST sub-actions).
 * Runs once per request when Express resolves the :id parameter.
 * Returns 403 if the incident's student belongs to a different district than the caller.
 *
 * Express param callbacks are local to the router they're registered on, so each
 * sub-router that uses :id must call this helper to install the guard.
 */
export function registerIncidentIdParam(router: IRouter): void {
  router.param("id", async (req: Request, res: Response, next: NextFunction, idStr: string) => {
    const id = Number(idStr);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid incident id" }); return; }

    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    if (districtId === null) { next(); return; }

    const [incident] = await db
      .select({ id: restraintIncidentsTable.id, studentId: restraintIncidentsTable.studentId })
      .from(restraintIncidentsTable)
      .where(eq(restraintIncidentsTable.id, id));

    if (!incident) { res.status(404).json({ error: "Not found" }); return; }

    const scopeRows = await db.execute(
      sql`SELECT sc.district_id FROM students s JOIN schools sc ON s.school_id = sc.id WHERE s.id = ${incident.studentId} LIMIT 1`
    );
    const incidentDistrictId = (scopeRows.rows[0] as { district_id: number | null } | undefined)?.district_id ?? null;
    if (incidentDistrictId === null || Number(incidentDistrictId) !== districtId) {
      res.status(403).json({ error: "Access denied: incident is outside your district" });
      return;
    }
    next();
  });
}

export async function getFullIncidentData(incidentId: number) {
  const [incident] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, incidentId));
  if (!incident) return null;

  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, incident.studentId));
  let school = null;
  if (student?.schoolId) {
    const [s] = await db.select().from(schoolsTable).where(eq(schoolsTable.id, student.schoolId));
    school = s || null;
  }

  const staffIds = new Set<number>();
  if (incident.primaryStaffId) staffIds.add(incident.primaryStaffId);
  if (incident.adminReviewedBy) staffIds.add(incident.adminReviewedBy);
  if (incident.parentNotifiedBy) staffIds.add(incident.parentNotifiedBy);
  if (incident.parentNotificationSentBy) staffIds.add(incident.parentNotificationSentBy);
  if (Array.isArray(incident.additionalStaffIds)) (incident.additionalStaffIds as number[]).forEach(id => staffIds.add(id));
  if (Array.isArray(incident.observerStaffIds)) (incident.observerStaffIds as number[]).forEach(id => staffIds.add(id));

  let staffMap: Record<number, any> = {};
  if (staffIds.size > 0) {
    const allStaff = await db.select().from(staffTable).where(inArray(staffTable.id, [...staffIds]));
    for (const s of allStaff) staffMap[s.id] = s;
  }

  let caseManager = null;
  if (student?.caseManagerId) {
    const [cm] = await db.select().from(staffTable).where(eq(staffTable.id, student.caseManagerId));
    caseManager = cm || null;
  }

  return {
    incident, student, school, staffMap, caseManager,
    primaryStaff: incident.primaryStaffId ? staffMap[incident.primaryStaffId] || null : null,
    adminReviewer: incident.adminReviewedBy ? staffMap[incident.adminReviewedBy] || null : null,
    additionalStaff: Array.isArray(incident.additionalStaffIds)
      ? (incident.additionalStaffIds as number[]).map(id => staffMap[id]).filter(Boolean) : [],
    observerStaff: Array.isArray(incident.observerStaffIds)
      ? (incident.observerStaffIds as number[]).map(id => staffMap[id]).filter(Boolean) : [],
  };
}

export const INCIDENT_TYPE_LABELS: Record<string, string> = {
  physical_restraint: "Physical Restraint",
  seclusion: "Seclusion",
  time_out: "Time-Out",
  physical_escort: "Physical Escort",
};

export const RESTRAINT_TYPE_LABELS: Record<string, string> = {
  floor: "Floor Restraint",
  seated: "Seated Restraint",
  standing: "Standing Restraint",
  escort: "Physical Escort",
  other: "Other",
};

export const BODY_POSITION_LABELS: Record<string, string> = {
  prone: "Prone (face down)",
  supine: "Supine (face up)",
  seated: "Seated",
  standing: "Standing",
  side_lying: "Side Lying",
  kneeling: "Kneeling",
};
