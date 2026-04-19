// tenant-scope: district-join (all queries scoped to student_id, guarded by studentIdParamGuard)
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable,
  medicalAlertsTable,
  emergencyContactsTable,
  behaviorInterventionPlansTable,
  studentReinforcersTable,
  programTargetsTable,
  iepAccommodationsTable,
  studentNotesTable,
} from "@workspace/db";
import { eq, and, asc, desc, ne } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/auth";
import { studentIdParamGuard } from "./students/idGuard";

const HANDOFF_ROLES = ["admin", "case_manager", "sped_teacher", "para", "provider", "bcba", "coordinator"] as const;

const router: IRouter = Router();
router.param("id", studentIdParamGuard);

router.get("/students/:id/handoff", async (req, res): Promise<void> => {
  const role = (req as unknown as AuthedRequest).trellisRole;
  if (!(HANDOFF_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const studentId = Number(req.params.id);

  const [
    medicalAlerts,
    emergencyContacts,
    activeBips,
    reinforcers,
    activePrograms,
    accommodations,
    pinnedNotes,
  ] = await Promise.all([
    db
      .select()
      .from(medicalAlertsTable)
      .where(eq(medicalAlertsTable.studentId, studentId))
      .orderBy(desc(medicalAlertsTable.severity)),

    db
      .select()
      .from(emergencyContactsTable)
      .where(eq(emergencyContactsTable.studentId, studentId))
      .orderBy(asc(emergencyContactsTable.priority))
      .limit(5),

    db
      .select()
      .from(behaviorInterventionPlansTable)
      .where(
        and(
          eq(behaviorInterventionPlansTable.studentId, studentId),
          eq(behaviorInterventionPlansTable.status, "active"),
        ),
      )
      .orderBy(desc(behaviorInterventionPlansTable.updatedAt)),

    db
      .select()
      .from(studentReinforcersTable)
      .where(
        and(
          eq(studentReinforcersTable.studentId, studentId),
          eq(studentReinforcersTable.active, true),
        ),
      )
      .orderBy(asc(studentReinforcersTable.category), asc(studentReinforcersTable.name)),

    db
      .select()
      .from(programTargetsTable)
      .where(
        and(
          eq(programTargetsTable.studentId, studentId),
          eq(programTargetsTable.active, true),
          ne(programTargetsTable.phase, "mastered"),
        ),
      )
      .orderBy(asc(programTargetsTable.domain), asc(programTargetsTable.name)),

    db
      .select()
      .from(iepAccommodationsTable)
      .where(
        and(
          eq(iepAccommodationsTable.studentId, studentId),
          eq(iepAccommodationsTable.active, true),
        ),
      )
      .orderBy(asc(iepAccommodationsTable.category)),

    db
      .select()
      .from(studentNotesTable)
      .where(
        and(
          eq(studentNotesTable.studentId, studentId),
          eq(studentNotesTable.pinned, true),
        ),
      )
      .orderBy(desc(studentNotesTable.createdAt))
      .limit(5),
  ]);

  res.json({
    medicalAlerts,
    emergencyContacts,
    activeBips,
    reinforcers,
    activePrograms,
    accommodations,
    pinnedNotes,
  });
});

export default router;
