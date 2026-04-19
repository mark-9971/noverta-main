import { db, staffAssignmentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

/**
 * Idempotently make sure a (staff, student, assignmentType) row exists in
 * `staff_assignments`. The student-detail UI ("Assigned Providers" / "Care
 * Team") is driven by this junction table, so any code path that establishes
 * a working relationship between a staff member and a student — adding a
 * provider to a service requirement, or naming a case manager on a student
 * record — must call this so the student doesn't appear unassigned.
 *
 * Safe to call from concurrent requests: a duplicate row is a no-op.
 * Returns true when a new row was inserted, false when a matching row already
 * existed (or the inputs were nullish).
 */
export async function ensureStaffAssignment(args: {
  staffId: number | null | undefined;
  studentId: number | null | undefined;
  assignmentType: "service_provider" | "case_manager";
  startDate?: string | null;
  notes?: string | null;
}): Promise<boolean> {
  const staffId = args.staffId ? Number(args.staffId) : null;
  const studentId = args.studentId ? Number(args.studentId) : null;
  if (!staffId || !studentId) return false;

  const existing = await db
    .select({ id: staffAssignmentsTable.id })
    .from(staffAssignmentsTable)
    .where(
      and(
        eq(staffAssignmentsTable.staffId, staffId),
        eq(staffAssignmentsTable.studentId, studentId),
        eq(staffAssignmentsTable.assignmentType, args.assignmentType),
      ),
    )
    .limit(1);
  if (existing.length > 0) return false;

  try {
    await db.insert(staffAssignmentsTable).values({
      staffId,
      studentId,
      assignmentType: args.assignmentType,
      startDate: args.startDate ?? new Date().toISOString().split("T")[0],
      notes: args.notes ?? null,
    });
    return true;
  } catch {
    // Race with another concurrent caller — treat as already-existing.
    return false;
  }
}
