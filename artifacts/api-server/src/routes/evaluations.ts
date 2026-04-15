import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  evaluationReferralsTable, evaluationsTable, eligibilityDeterminationsTable,
  studentsTable, staffTable, schoolsTable,
} from "@workspace/db";
import { eq, and, desc, asc, isNull, lte, sql, or } from "drizzle-orm";
import { logAudit } from "../lib/auditLog";
import { requireRoles } from "../middlewares/auth";

const router: IRouter = Router();

const evalAccess = requireRoles("admin", "coordinator", "case_manager", "sped_teacher", "bcba");

function calcDeadline(consentDate: string, schoolDays: number = 30): string {
  const d = new Date(consentDate + "T12:00:00");
  const calendarDays = Math.ceil(schoolDays * 1.5);
  d.setDate(d.getDate() + calendarDays);
  return d.toISOString().slice(0, 10);
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T12:00:00");
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

router.get("/evaluations/referrals", evalAccess, async (req, res): Promise<void> => {
  try {
    const rows = await db.select({
      referral: evaluationReferralsTable,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      studentGrade: studentsTable.grade,
      evaluatorFirstName: staffTable.firstName,
      evaluatorLastName: staffTable.lastName,
      schoolName: schoolsTable.name,
    }).from(evaluationReferralsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, evaluationReferralsTable.studentId))
      .leftJoin(staffTable, eq(staffTable.id, evaluationReferralsTable.assignedEvaluatorId))
      .leftJoin(schoolsTable, eq(schoolsTable.id, evaluationReferralsTable.schoolId))
      .where(isNull(evaluationReferralsTable.deletedAt))
      .orderBy(desc(evaluationReferralsTable.createdAt));

    const result = rows.map(r => ({
      ...r.referral,
      studentName: r.studentFirstName ? `${r.studentFirstName} ${r.studentLastName}` : null,
      studentGrade: r.studentGrade,
      evaluatorName: r.evaluatorFirstName ? `${r.evaluatorFirstName} ${r.evaluatorLastName}` : null,
      schoolName: r.schoolName,
      daysUntilDeadline: r.referral.evaluationDeadline ? daysUntil(r.referral.evaluationDeadline) : null,
      createdAt: r.referral.createdAt.toISOString(),
      updatedAt: r.referral.updatedAt.toISOString(),
    }));
    res.json(result);
  } catch (e: any) {
    console.error("GET /evaluations/referrals error:", e);
    res.status(500).json({ error: "Failed to list referrals" });
  }
});

router.post("/evaluations/referrals", evalAccess, async (req, res): Promise<void> => {
  try {
    const body = req.body;
    let evaluationDeadline = body.evaluationDeadline ?? null;
    if (body.consentReceivedDate && !evaluationDeadline) {
      evaluationDeadline = calcDeadline(body.consentReceivedDate, 30);
    }

    const [row] = await db.insert(evaluationReferralsTable).values({
      studentId: body.studentId,
      referralDate: body.referralDate,
      referralSource: body.referralSource,
      referralSourceName: body.referralSourceName ?? null,
      reason: body.reason,
      areasOfConcern: body.areasOfConcern ?? [],
      parentNotifiedDate: body.parentNotifiedDate ?? null,
      consentRequestedDate: body.consentRequestedDate ?? null,
      consentReceivedDate: body.consentReceivedDate ?? null,
      consentStatus: body.consentStatus ?? "pending",
      evaluationDeadline,
      assignedEvaluatorId: body.assignedEvaluatorId ?? null,
      schoolId: body.schoolId ?? null,
      status: body.status ?? "open",
      notes: body.notes ?? null,
    }).returning();

    logAudit(req, { action: "create", targetTable: "evaluation_referrals", targetId: row.id, studentId: body.studentId, summary: `Created referral for student #${body.studentId}` });
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("POST /evaluations/referrals error:", e);
    res.status(500).json({ error: "Failed to create referral" });
  }
});

router.patch("/evaluations/referrals/:id", evalAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body;

    if (body.consentReceivedDate && !body.evaluationDeadline) {
      body.evaluationDeadline = calcDeadline(body.consentReceivedDate, 30);
      if (body.consentStatus === "pending") body.consentStatus = "obtained";
    }

    const [row] = await db.update(evaluationReferralsTable).set(body).where(eq(evaluationReferralsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Referral not found" }); return; }

    logAudit(req, { action: "update", targetTable: "evaluation_referrals", targetId: id, studentId: row.studentId, summary: `Updated referral #${id}` });
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("PATCH /evaluations/referrals error:", e);
    res.status(500).json({ error: "Failed to update referral" });
  }
});

router.get("/evaluations", evalAccess, async (req, res): Promise<void> => {
  try {
    const rows = await db.select({
      evaluation: evaluationsTable,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      studentGrade: studentsTable.grade,
      leadFirstName: staffTable.firstName,
      leadLastName: staffTable.lastName,
    }).from(evaluationsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, evaluationsTable.studentId))
      .leftJoin(staffTable, eq(staffTable.id, evaluationsTable.leadEvaluatorId))
      .where(isNull(evaluationsTable.deletedAt))
      .orderBy(desc(evaluationsTable.createdAt));

    const result = rows.map(r => ({
      ...r.evaluation,
      studentName: r.studentFirstName ? `${r.studentFirstName} ${r.studentLastName}` : null,
      studentGrade: r.studentGrade,
      leadEvaluatorName: r.leadFirstName ? `${r.leadFirstName} ${r.leadLastName}` : null,
      daysUntilDue: r.evaluation.dueDate ? daysUntil(r.evaluation.dueDate) : null,
      createdAt: r.evaluation.createdAt.toISOString(),
      updatedAt: r.evaluation.updatedAt.toISOString(),
    }));
    res.json(result);
  } catch (e: any) {
    console.error("GET /evaluations error:", e);
    res.status(500).json({ error: "Failed to list evaluations" });
  }
});

router.post("/evaluations", evalAccess, async (req, res): Promise<void> => {
  try {
    const body = req.body;
    const [row] = await db.insert(evaluationsTable).values({
      studentId: body.studentId,
      referralId: body.referralId ?? null,
      evaluationType: body.evaluationType ?? "initial",
      evaluationAreas: body.evaluationAreas ?? [],
      teamMembers: body.teamMembers ?? [],
      leadEvaluatorId: body.leadEvaluatorId ?? null,
      startDate: body.startDate ?? null,
      dueDate: body.dueDate ?? null,
      completionDate: body.completionDate ?? null,
      meetingDate: body.meetingDate ?? null,
      reportSummary: body.reportSummary ?? null,
      status: body.status ?? "pending",
      notes: body.notes ?? null,
    }).returning();

    if (body.referralId) {
      await db.update(evaluationReferralsTable).set({ status: "evaluation_in_progress" }).where(eq(evaluationReferralsTable.id, body.referralId));
    }

    logAudit(req, { action: "create", targetTable: "evaluations", targetId: row.id, studentId: body.studentId, summary: `Created evaluation for student #${body.studentId}` });
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("POST /evaluations error:", e);
    res.status(500).json({ error: "Failed to create evaluation" });
  }
});

router.patch("/evaluations/:id", evalAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.update(evaluationsTable).set(req.body).where(eq(evaluationsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Evaluation not found" }); return; }

    logAudit(req, { action: "update", targetTable: "evaluations", targetId: id, studentId: row.studentId, summary: `Updated evaluation #${id}` });
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("PATCH /evaluations error:", e);
    res.status(500).json({ error: "Failed to update evaluation" });
  }
});

router.get("/evaluations/eligibility", evalAccess, async (req, res): Promise<void> => {
  try {
    const rows = await db.select({
      determination: eligibilityDeterminationsTable,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      studentGrade: studentsTable.grade,
    }).from(eligibilityDeterminationsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, eligibilityDeterminationsTable.studentId))
      .where(isNull(eligibilityDeterminationsTable.deletedAt))
      .orderBy(desc(eligibilityDeterminationsTable.createdAt));

    const result = rows.map(r => ({
      ...r.determination,
      studentName: r.studentFirstName ? `${r.studentFirstName} ${r.studentLastName}` : null,
      studentGrade: r.studentGrade,
      daysUntilReEval: r.determination.nextReEvalDate ? daysUntil(r.determination.nextReEvalDate) : null,
      createdAt: r.determination.createdAt.toISOString(),
      updatedAt: r.determination.updatedAt.toISOString(),
    }));
    res.json(result);
  } catch (e: any) {
    console.error("GET /evaluations/eligibility error:", e);
    res.status(500).json({ error: "Failed to list eligibility determinations" });
  }
});

router.post("/evaluations/eligibility", evalAccess, async (req, res): Promise<void> => {
  try {
    const body = req.body;
    let nextReEvalDate = body.nextReEvalDate ?? null;
    if (body.eligible && body.meetingDate && !nextReEvalDate) {
      const d = new Date(body.meetingDate + "T12:00:00");
      d.setMonth(d.getMonth() + (body.reEvalCycleMonths ?? 36));
      nextReEvalDate = d.toISOString().slice(0, 10);
    }

    const [row] = await db.insert(eligibilityDeterminationsTable).values({
      studentId: body.studentId,
      evaluationId: body.evaluationId ?? null,
      meetingDate: body.meetingDate,
      teamMembers: body.teamMembers ?? [],
      primaryDisability: body.primaryDisability ?? null,
      secondaryDisability: body.secondaryDisability ?? null,
      eligible: body.eligible ?? null,
      determinationBasis: body.determinationBasis ?? null,
      determinationNotes: body.determinationNotes ?? null,
      iepRequired: body.iepRequired ?? false,
      nextReEvalDate,
      reEvalCycleMonths: body.reEvalCycleMonths ?? 36,
      status: body.status ?? "draft",
    }).returning();

    if (body.evaluationId) {
      await db.update(evaluationsTable).set({ status: "completed" }).where(eq(evaluationsTable.id, body.evaluationId));
    }

    logAudit(req, { action: "create", targetTable: "eligibility_determinations", targetId: row.id, studentId: body.studentId, summary: `Created eligibility determination for student #${body.studentId}` });
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("POST /evaluations/eligibility error:", e);
    res.status(500).json({ error: "Failed to create eligibility determination" });
  }
});

router.patch("/evaluations/eligibility/:id", evalAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.update(eligibilityDeterminationsTable).set(req.body).where(eq(eligibilityDeterminationsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Eligibility determination not found" }); return; }

    logAudit(req, { action: "update", targetTable: "eligibility_determinations", targetId: id, studentId: row.studentId, summary: `Updated eligibility determination #${id}` });
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("PATCH /evaluations/eligibility error:", e);
    res.status(500).json({ error: "Failed to update eligibility determination" });
  }
});

router.get("/evaluations/dashboard", evalAccess, async (req, res): Promise<void> => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysOut = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const [openReferrals] = await db.select({ count: sql<number>`count(*)::int` }).from(evaluationReferralsTable)
      .where(and(isNull(evaluationReferralsTable.deletedAt), eq(evaluationReferralsTable.status, "open")));

    const [pendingConsent] = await db.select({ count: sql<number>`count(*)::int` }).from(evaluationReferralsTable)
      .where(and(isNull(evaluationReferralsTable.deletedAt), eq(evaluationReferralsTable.consentStatus, "pending")));

    const [overdueEvals] = await db.select({ count: sql<number>`count(*)::int` }).from(evaluationsTable)
      .where(and(
        isNull(evaluationsTable.deletedAt),
        or(eq(evaluationsTable.status, "pending"), eq(evaluationsTable.status, "in_progress")),
        lte(evaluationsTable.dueDate, today)
      ));

    const [activeEvals] = await db.select({ count: sql<number>`count(*)::int` }).from(evaluationsTable)
      .where(and(
        isNull(evaluationsTable.deletedAt),
        or(eq(evaluationsTable.status, "pending"), eq(evaluationsTable.status, "in_progress"))
      ));

    const [upcomingReEvals] = await db.select({ count: sql<number>`count(*)::int` }).from(eligibilityDeterminationsTable)
      .where(and(
        isNull(eligibilityDeterminationsTable.deletedAt),
        lte(eligibilityDeterminationsTable.nextReEvalDate, thirtyDaysOut)
      ));

    const [overdueReEvals] = await db.select({ count: sql<number>`count(*)::int` }).from(eligibilityDeterminationsTable)
      .where(and(
        isNull(eligibilityDeterminationsTable.deletedAt),
        lte(eligibilityDeterminationsTable.nextReEvalDate, today)
      ));

    const overdueReferralDeadlines = await db.select({
      referral: evaluationReferralsTable,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
    }).from(evaluationReferralsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, evaluationReferralsTable.studentId))
      .where(and(
        isNull(evaluationReferralsTable.deletedAt),
        lte(evaluationReferralsTable.evaluationDeadline, today),
        or(eq(evaluationReferralsTable.status, "open"), eq(evaluationReferralsTable.status, "evaluation_in_progress"))
      ))
      .orderBy(asc(evaluationReferralsTable.evaluationDeadline))
      .limit(10);

    res.json({
      openReferrals: openReferrals.count,
      pendingConsent: pendingConsent.count,
      overdueEvaluations: overdueEvals.count,
      activeEvaluations: activeEvals.count,
      upcomingReEvaluations: upcomingReEvals.count,
      overdueReEvaluations: overdueReEvals.count,
      overdueReferralDeadlines: overdueReferralDeadlines.map(r => ({
        id: r.referral.id,
        studentName: r.studentFirstName ? `${r.studentFirstName} ${r.studentLastName}` : "—",
        deadline: r.referral.evaluationDeadline,
        daysOverdue: -daysUntil(r.referral.evaluationDeadline!),
        status: r.referral.status,
      })),
    });
  } catch (e: any) {
    console.error("GET /evaluations/dashboard error:", e);
    res.status(500).json({ error: "Failed to generate evaluations dashboard" });
  }
});

export default router;
