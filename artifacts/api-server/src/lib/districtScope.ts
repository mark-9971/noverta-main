import type { Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getEnforcedDistrictId, type AuthedRequest } from "../middlewares/auth";

export async function studentInCallerDistrict(req: AuthedRequest, studentId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM students s JOIN schools sch ON sch.id = s.school_id
        WHERE s.id = ${studentId} AND sch.district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
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

export async function schoolInCallerDistrict(req: AuthedRequest, schoolId: number): Promise<boolean> {
  const did = getEnforcedDistrictId(req);
  if (did == null) return true;
  const r = await db.execute(
    sql`SELECT 1 FROM schools WHERE id = ${schoolId} AND district_id = ${did} LIMIT 1`,
  );
  return r.rows.length > 0;
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
