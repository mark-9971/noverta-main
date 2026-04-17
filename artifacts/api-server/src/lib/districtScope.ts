import type { Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getEnforcedDistrictId, type AuthedRequest } from "../middlewares/auth";

/**
 * Per-resource district-scope helpers.
 *
 * Convention:
 *   - `<resource>InCallerDistrict(req, id) -> Promise<boolean>`
 *     Returns true when the resource belongs to the caller's enforced district,
 *     or the caller is a platform admin (enforcedDid == null).
 *   - `assert<Resource>InCallerDistrict(req, id, res) -> Promise<boolean>`
 *     Returns true on success, otherwise sends 404 (intentionally not 403, to
 *     avoid leaking the existence of out-of-tenant rows) and returns false.
 *
 * All routes that accept a body-supplied ID belonging to a tenant-scoped
 * resource MUST validate it through one of these helpers BEFORE using it
 * in a write (insert/update). This prevents body-IDOR attacks where a
 * caller in District A passes a District B foreign-key id.
 */

export async function studentInCallerDistrict(req: AuthedRequest, studentId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM students s JOIN schools sch ON sch.id = s.school_id
        WHERE s.id = ${studentId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function assertStudentInCallerDistrict(req: AuthedRequest, studentId: number, res: Response): Promise<boolean> {
  if (await studentInCallerDistrict(req, studentId)) return true;
  res.status(404).json({ error: "Student not found" });
  return false;
}

export async function staffInCallerDistrict(req: AuthedRequest, staffId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM staff st JOIN schools sch ON sch.id = st.school_id
        WHERE st.id = ${staffId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function assertStaffInCallerDistrict(req: AuthedRequest, staffId: number, res: Response): Promise<boolean> {
  if (await staffInCallerDistrict(req, staffId)) return true;
  res.status(404).json({ error: "Staff member not found" });
  return false;
}

/** Bulk variant: returns true only if EVERY staff id is in the caller's district. */
export async function allStaffInCallerDistrict(req: AuthedRequest, staffIds: number[]): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  if (staffIds.length === 0) return true;
  const r = await db.execute(
    sql`SELECT COUNT(*)::int AS cnt FROM staff st JOIN schools sch ON sch.id = st.school_id
        WHERE st.id = ANY(${staffIds}) AND sch.district_id = ${did}`,
  );
  const cnt = Number((r.rows[0] as { cnt: number } | undefined)?.cnt ?? 0);
  return cnt === staffIds.length;
}

export async function schoolInCallerDistrict(req: AuthedRequest, schoolId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM schools WHERE id = ${schoolId} AND district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function assertSchoolInCallerDistrict(req: AuthedRequest, schoolId: number, res: Response): Promise<boolean> {
  if (await schoolInCallerDistrict(req, schoolId)) return true;
  res.status(404).json({ error: "School not found" });
  return false;
}

export async function classInCallerDistrict(req: AuthedRequest, classId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM classes c JOIN schools sch ON sch.id = c.school_id
        WHERE c.id = ${classId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function assertClassInCallerDistrict(req: AuthedRequest, classId: number, res: Response): Promise<boolean> {
  if (await classInCallerDistrict(req, classId)) return true;
  res.status(404).json({ error: "Class not found" });
  return false;
}

export async function assignmentInCallerDistrict(req: AuthedRequest, assignmentId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM assignments a
        JOIN classes c ON c.id = a.class_id
        JOIN schools sch ON sch.id = c.school_id
        WHERE a.id = ${assignmentId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function assertAssignmentInCallerDistrict(req: AuthedRequest, assignmentId: number, res: Response): Promise<boolean> {
  if (await assignmentInCallerDistrict(req, assignmentId)) return true;
  res.status(404).json({ error: "Assignment not found" });
  return false;
}

export async function submissionInCallerDistrict(req: AuthedRequest, submissionId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM submissions sub
        JOIN assignments a ON a.id = sub.assignment_id
        JOIN classes c ON c.id = a.class_id
        JOIN schools sch ON sch.id = c.school_id
        WHERE sub.id = ${submissionId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function assertSubmissionInCallerDistrict(req: AuthedRequest, submissionId: number, res: Response): Promise<boolean> {
  if (await submissionInCallerDistrict(req, submissionId)) return true;
  res.status(404).json({ error: "Submission not found" });
  return false;
}

// ---------------------------------------------------------------------------
// Evaluations / referrals / eligibility (route-lockdown 2026-04-17 P1)
// ---------------------------------------------------------------------------

/** True if the evaluation_referrals row's student belongs to caller's district. */
export async function referralInCallerDistrict(req: AuthedRequest, referralId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM evaluation_referrals r
        JOIN students s ON s.id = r.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE r.id = ${referralId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function assertReferralInCallerDistrict(req: AuthedRequest, referralId: number, res: Response): Promise<boolean> {
  if (await referralInCallerDistrict(req, referralId)) return true;
  res.status(404).json({ error: "Referral not found" });
  return false;
}

export async function evaluationInCallerDistrict(req: AuthedRequest, evaluationId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM evaluations e
        JOIN students s ON s.id = e.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE e.id = ${evaluationId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function assertEvaluationInCallerDistrict(req: AuthedRequest, evaluationId: number, res: Response): Promise<boolean> {
  if (await evaluationInCallerDistrict(req, evaluationId)) return true;
  res.status(404).json({ error: "Evaluation not found" });
  return false;
}

export async function eligibilityInCallerDistrict(req: AuthedRequest, eligibilityId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM eligibility_determinations d
        JOIN students s ON s.id = d.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE d.id = ${eligibilityId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function assertEligibilityInCallerDistrict(req: AuthedRequest, eligibilityId: number, res: Response): Promise<boolean> {
  if (await eligibilityInCallerDistrict(req, eligibilityId)) return true;
  res.status(404).json({ error: "Eligibility determination not found" });
  return false;
}

// ---------------------------------------------------------------------------
// Schedule blocks / coverage instances
// ---------------------------------------------------------------------------

/**
 * A schedule block belongs to caller's district when its assigned staff (or the
 * staff on the related coverage instance) belongs to a school in the district.
 */
export async function scheduleBlockInCallerDistrict(req: AuthedRequest, scheduleBlockId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM schedule_blocks sb
        JOIN staff st ON st.id = sb.staff_id
        JOIN schools sch ON sch.id = st.school_id
        WHERE sb.id = ${scheduleBlockId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function assertScheduleBlockInCallerDistrict(req: AuthedRequest, scheduleBlockId: number, res: Response): Promise<boolean> {
  if (await scheduleBlockInCallerDistrict(req, scheduleBlockId)) return true;
  res.status(404).json({ error: "Schedule block not found" });
  return false;
}

// ---------------------------------------------------------------------------
// IEP meetings, transitions, compensatory obligations
// ---------------------------------------------------------------------------

export async function teamMeetingInCallerDistrict(req: AuthedRequest, meetingId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM team_meetings m
        JOIN students s ON s.id = m.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE m.id = ${meetingId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function assertTeamMeetingInCallerDistrict(req: AuthedRequest, meetingId: number, res: Response): Promise<boolean> {
  if (await teamMeetingInCallerDistrict(req, meetingId)) return true;
  res.status(404).json({ error: "Meeting not found" });
  return false;
}

export async function transitionPlanInCallerDistrict(req: AuthedRequest, planId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM transition_plans p
        JOIN students s ON s.id = p.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE p.id = ${planId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function assertTransitionPlanInCallerDistrict(req: AuthedRequest, planId: number, res: Response): Promise<boolean> {
  if (await transitionPlanInCallerDistrict(req, planId)) return true;
  res.status(404).json({ error: "Transition plan not found" });
  return false;
}

export async function compensatoryObligationInCallerDistrict(req: AuthedRequest, obligationId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM compensatory_obligations o
        JOIN students s ON s.id = o.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE o.id = ${obligationId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function assertCompensatoryObligationInCallerDistrict(req: AuthedRequest, obligationId: number, res: Response): Promise<boolean> {
  if (await compensatoryObligationInCallerDistrict(req, obligationId)) return true;
  res.status(404).json({ error: "Compensatory obligation not found" });
  return false;
}

/** True if the IEP document belongs to a student in the caller's district. */
export async function iepDocumentInCallerDistrict(req: AuthedRequest, iepDocumentId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM iep_documents d
        JOIN students s ON s.id = d.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE d.id = ${iepDocumentId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function assertIepDocumentInCallerDistrict(req: AuthedRequest, iepDocumentId: number, res: Response): Promise<boolean> {
  if (await iepDocumentInCallerDistrict(req, iepDocumentId)) return true;
  res.status(404).json({ error: "IEP document not found" });
  return false;
}

/** True if a service_requirements row belongs to a student in caller's district. */
export async function serviceRequirementInCallerDistrict(req: AuthedRequest, serviceRequirementId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM service_requirements sr
        JOIN students s ON s.id = sr.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE sr.id = ${serviceRequirementId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function assertServiceRequirementInCallerDistrict(req: AuthedRequest, serviceRequirementId: number, res: Response): Promise<boolean> {
  if (await serviceRequirementInCallerDistrict(req, serviceRequirementId)) return true;
  res.status(404).json({ error: "Service requirement not found" });
  return false;
}
