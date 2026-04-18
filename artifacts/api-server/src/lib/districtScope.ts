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

// ---------------------------------------------------------------------------
// Sessions, alerts, behaviour data, FBA/BIP, supervision, absences
// (route-lockdown 2026-04-17 P2)
// ---------------------------------------------------------------------------

/** session_logs.student_id -> students -> schools.district_id */
export async function sessionLogInCallerDistrict(req: AuthedRequest, sessionId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM session_logs sl
        JOIN students s ON s.id = sl.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE sl.id = ${sessionId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertSessionLogInCallerDistrict(req: AuthedRequest, sessionId: number, res: Response): Promise<boolean> {
  if (await sessionLogInCallerDistrict(req, sessionId)) return true;
  res.status(404).json({ error: "Session not found" });
  return false;
}

/**
 * alerts may be scoped by student_id, staff_id, or both (and rarely neither).
 * An alert "belongs" to caller's district if either FK resolves into a school
 * in the district. If both are NULL we treat it as platform-only (deny when
 * caller is district-bound).
 */
export async function alertInCallerDistrict(req: AuthedRequest, alertId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM alerts a
        LEFT JOIN students s ON s.id = a.student_id
        LEFT JOIN schools ssch ON ssch.id = s.school_id
        LEFT JOIN staff st ON st.id = a.staff_id
        LEFT JOIN schools tsch ON tsch.id = st.school_id
        WHERE a.id = ${alertId}
          AND (ssch.district_id = ${did} OR tsch.district_id = ${did})
        LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertAlertInCallerDistrict(req: AuthedRequest, alertId: number, res: Response): Promise<boolean> {
  if (await alertInCallerDistrict(req, alertId)) return true;
  res.status(404).json({ error: "Alert not found" });
  return false;
}

/** Filter a list of alert ids to just those in caller's district. */
export async function filterAlertIdsInCallerDistrict(req: AuthedRequest, alertIds: number[]): Promise<number[]> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return alertIds;
  if (alertIds.length === 0) return [];
  const r = await db.execute(
    sql`SELECT a.id FROM alerts a
        LEFT JOIN students s ON s.id = a.student_id
        LEFT JOIN schools ssch ON ssch.id = s.school_id
        LEFT JOIN staff st ON st.id = a.staff_id
        LEFT JOIN schools tsch ON tsch.id = st.school_id
        WHERE a.id = ANY(${alertIds})
          AND (ssch.district_id = ${did} OR tsch.district_id = ${did})`,
  );
  return r.rows.map(row => Number((row as { id: number }).id));
}

/** compliance_events.student_id -> students -> schools.district_id */
export async function complianceEventInCallerDistrict(req: AuthedRequest, eventId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM compliance_events ce
        JOIN students s ON s.id = ce.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE ce.id = ${eventId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertComplianceEventInCallerDistrict(req: AuthedRequest, eventId: number, res: Response): Promise<boolean> {
  if (await complianceEventInCallerDistrict(req, eventId)) return true;
  res.status(404).json({ error: "Compliance event not found" });
  return false;
}

/** behavior_targets.student_id -> students -> schools.district_id */
export async function behaviorTargetInCallerDistrict(req: AuthedRequest, targetId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM behavior_targets bt
        JOIN students s ON s.id = bt.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE bt.id = ${targetId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertBehaviorTargetInCallerDistrict(req: AuthedRequest, targetId: number, res: Response): Promise<boolean> {
  if (await behaviorTargetInCallerDistrict(req, targetId)) return true;
  res.status(404).json({ error: "Behavior target not found" });
  return false;
}

/** program_targets.student_id -> students -> schools.district_id */
export async function programTargetInCallerDistrict(req: AuthedRequest, targetId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM program_targets pt
        JOIN students s ON s.id = pt.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE pt.id = ${targetId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertProgramTargetInCallerDistrict(req: AuthedRequest, targetId: number, res: Response): Promise<boolean> {
  if (await programTargetInCallerDistrict(req, targetId)) return true;
  res.status(404).json({ error: "Program target not found" });
  return false;
}

/** program_steps -> program_targets -> students -> schools.district_id */
export async function programStepInCallerDistrict(req: AuthedRequest, stepId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM program_steps ps
        JOIN program_targets pt ON pt.id = ps.program_target_id
        JOIN students s ON s.id = pt.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE ps.id = ${stepId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertProgramStepInCallerDistrict(req: AuthedRequest, stepId: number, res: Response): Promise<boolean> {
  if (await programStepInCallerDistrict(req, stepId)) return true;
  res.status(404).json({ error: "Program step not found" });
  return false;
}

/** fbas.student_id -> students -> schools.district_id */
export async function fbaInCallerDistrict(req: AuthedRequest, fbaId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM fbas f
        JOIN students s ON s.id = f.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE f.id = ${fbaId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertFbaInCallerDistrict(req: AuthedRequest, fbaId: number, res: Response): Promise<boolean> {
  if (await fbaInCallerDistrict(req, fbaId)) return true;
  res.status(404).json({ error: "FBA not found" });
  return false;
}

/** fba_observations -> fbas -> students -> schools.district_id */
export async function fbaObservationInCallerDistrict(req: AuthedRequest, obsId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM fba_observations o
        JOIN fbas f ON f.id = o.fba_id
        JOIN students s ON s.id = f.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE o.id = ${obsId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertFbaObservationInCallerDistrict(req: AuthedRequest, obsId: number, res: Response): Promise<boolean> {
  if (await fbaObservationInCallerDistrict(req, obsId)) return true;
  res.status(404).json({ error: "Observation not found" });
  return false;
}

/** functional_analyses (fa_sessions) -> fbas -> students -> schools.district_id */
export async function functionalAnalysisInCallerDistrict(req: AuthedRequest, faId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM functional_analyses fa
        JOIN fbas f ON f.id = fa.fba_id
        JOIN students s ON s.id = f.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE fa.id = ${faId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertFunctionalAnalysisInCallerDistrict(req: AuthedRequest, faId: number, res: Response): Promise<boolean> {
  if (await functionalAnalysisInCallerDistrict(req, faId)) return true;
  res.status(404).json({ error: "FA session not found" });
  return false;
}

/** behavior_intervention_plans.student_id -> students -> schools.district_id */
export async function bipInCallerDistrict(req: AuthedRequest, bipId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM behavior_intervention_plans bip
        JOIN students s ON s.id = bip.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE bip.id = ${bipId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertBipInCallerDistrict(req: AuthedRequest, bipId: number, res: Response): Promise<boolean> {
  if (await bipInCallerDistrict(req, bipId)) return true;
  res.status(404).json({ error: "BIP not found" });
  return false;
}

/** bip_implementers -> bip -> student -> school.district_id */
export async function bipImplementerInCallerDistrict(req: AuthedRequest, implementerId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM bip_implementers bi
        JOIN behavior_intervention_plans bip ON bip.id = bi.bip_id
        JOIN students s ON s.id = bip.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE bi.id = ${implementerId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertBipImplementerInCallerDistrict(req: AuthedRequest, implementerId: number, res: Response): Promise<boolean> {
  if (await bipImplementerInCallerDistrict(req, implementerId)) return true;
  res.status(404).json({ error: "Implementer not found" });
  return false;
}

/** bip_fidelity_logs -> bip -> student -> school.district_id */
export async function bipFidelityLogInCallerDistrict(req: AuthedRequest, logId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM bip_fidelity_logs bfl
        JOIN behavior_intervention_plans bip ON bip.id = bfl.bip_id
        JOIN students s ON s.id = bip.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE bfl.id = ${logId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertBipFidelityLogInCallerDistrict(req: AuthedRequest, logId: number, res: Response): Promise<boolean> {
  if (await bipFidelityLogInCallerDistrict(req, logId)) return true;
  res.status(404).json({ error: "Fidelity log not found" });
  return false;
}

/**
 * supervision_sessions has supervisor_id and supervisee_id (both staff).
 * The session belongs to caller's district when either staff member is in
 * a school in the district.
 */
export async function supervisionSessionInCallerDistrict(req: AuthedRequest, sessionId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM supervision_sessions ss
        LEFT JOIN staff sv ON sv.id = ss.supervisor_id
        LEFT JOIN schools svsch ON svsch.id = sv.school_id
        LEFT JOIN staff sup ON sup.id = ss.supervisee_id
        LEFT JOIN schools supsch ON supsch.id = sup.school_id
        WHERE ss.id = ${sessionId}
          AND (svsch.district_id = ${did} OR supsch.district_id = ${did})
        LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertSupervisionSessionInCallerDistrict(req: AuthedRequest, sessionId: number, res: Response): Promise<boolean> {
  if (await supervisionSessionInCallerDistrict(req, sessionId)) return true;
  res.status(404).json({ error: "Supervision session not found" });
  return false;
}

/** iep_goals.student_id -> student.school -> school.district_id */
export async function iepGoalInCallerDistrict(req: AuthedRequest, goalId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM iep_goals g
        JOIN students s ON s.id = g.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE g.id = ${goalId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertIepGoalInCallerDistrict(req: AuthedRequest, goalId: number, res: Response): Promise<boolean> {
  if (await iepGoalInCallerDistrict(req, goalId)) return true;
  res.status(404).json({ error: "IEP goal not found" });
  return false;
}

/** data_sessions.student_id -> student.school -> school.district_id */
export async function dataSessionInCallerDistrict(req: AuthedRequest, sessionId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM data_sessions ds
        JOIN students s ON s.id = ds.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE ds.id = ${sessionId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertDataSessionInCallerDistrict(req: AuthedRequest, sessionId: number, res: Response): Promise<boolean> {
  if (await dataSessionInCallerDistrict(req, sessionId)) return true;
  res.status(404).json({ error: "Data session not found" });
  return false;
}

/** phase_changes.behavior_target_id -> behavior_target.student -> student.school.district_id */
export async function phaseChangeInCallerDistrict(req: AuthedRequest, phaseChangeId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM phase_changes pc
        JOIN behavior_targets bt ON bt.id = pc.behavior_target_id
        JOIN students s ON s.id = bt.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE pc.id = ${phaseChangeId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertPhaseChangeInCallerDistrict(req: AuthedRequest, phaseChangeId: number, res: Response): Promise<boolean> {
  if (await phaseChangeInCallerDistrict(req, phaseChangeId)) return true;
  res.status(404).json({ error: "Phase change not found" });
  return false;
}

/** iep_meeting_attendees.meeting_id -> team_meetings.student -> school.district_id */
export async function iepMeetingAttendeeInCallerDistrict(req: AuthedRequest, attendeeId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM iep_meeting_attendees a
        JOIN team_meetings tm ON tm.id = a.meeting_id
        JOIN students s ON s.id = tm.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE a.id = ${attendeeId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertIepMeetingAttendeeInCallerDistrict(req: AuthedRequest, attendeeId: number, res: Response): Promise<boolean> {
  if (await iepMeetingAttendeeInCallerDistrict(req, attendeeId)) return true;
  res.status(404).json({ error: "Attendee not found" });
  return false;
}

/** prior_written_notices.meeting_id -> team_meetings.student.school.district_id */
export async function priorWrittenNoticeInCallerDistrict(req: AuthedRequest, noticeId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM prior_written_notices pwn
        JOIN team_meetings tm ON tm.id = pwn.meeting_id
        JOIN students s ON s.id = tm.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE pwn.id = ${noticeId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertPriorWrittenNoticeInCallerDistrict(req: AuthedRequest, noticeId: number, res: Response): Promise<boolean> {
  if (await priorWrittenNoticeInCallerDistrict(req, noticeId)) return true;
  res.status(404).json({ error: "Notice not found" });
  return false;
}

/** meeting_consent_records.meeting_id -> team_meetings.student.school.district_id */
export async function meetingConsentRecordInCallerDistrict(req: AuthedRequest, consentId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM meeting_consent_records mcr
        JOIN team_meetings tm ON tm.id = mcr.meeting_id
        JOIN students s ON s.id = tm.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE mcr.id = ${consentId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertMeetingConsentRecordInCallerDistrict(req: AuthedRequest, consentId: number, res: Response): Promise<boolean> {
  if (await meetingConsentRecordInCallerDistrict(req, consentId)) return true;
  res.status(404).json({ error: "Consent record not found" });
  return false;
}

/** meeting_prep_items.meeting_id -> team_meetings.student.school.district_id */
export async function meetingPrepItemInCallerDistrict(req: AuthedRequest, itemId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM meeting_prep_items mpi
        JOIN team_meetings tm ON tm.id = mpi.meeting_id
        JOIN students s ON s.id = tm.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE mpi.id = ${itemId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertMeetingPrepItemInCallerDistrict(req: AuthedRequest, itemId: number, res: Response): Promise<boolean> {
  if (await meetingPrepItemInCallerDistrict(req, itemId)) return true;
  res.status(404).json({ error: "Prep item not found" });
  return false;
}

/** staff_absences.staff_id -> staff -> schools.district_id */
export async function staffAbsenceInCallerDistrict(req: AuthedRequest, absenceId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM staff_absences sa
        JOIN staff st ON st.id = sa.staff_id
        JOIN schools sch ON sch.id = st.school_id
        WHERE sa.id = ${absenceId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertStaffAbsenceInCallerDistrict(req: AuthedRequest, absenceId: number, res: Response): Promise<boolean> {
  if (await staffAbsenceInCallerDistrict(req, absenceId)) return true;
  res.status(404).json({ error: "Absence not found" });
  return false;
}

/** goal_annotations.goal_id -> iep_goals.student_id -> student.school.district_id */
export async function goalAnnotationInCallerDistrict(req: AuthedRequest, annotationId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM goal_annotations ga
        JOIN iep_goals g ON g.id = ga.goal_id
        JOIN students s ON s.id = g.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE ga.id = ${annotationId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
}
export async function assertGoalAnnotationInCallerDistrict(req: AuthedRequest, annotationId: number, res: Response): Promise<boolean> {
  if (await goalAnnotationInCallerDistrict(req, annotationId)) return true;
  res.status(404).json({ error: "Goal annotation not found" });
  return false;
}
