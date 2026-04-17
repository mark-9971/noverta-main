import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  transitionPlansTable, transitionGoalsTable, transitionAgencyReferralsTable,
  studentsTable, staffTable, iepDocumentsTable, schoolsTable,
} from "@workspace/db";
import { eq, and, desc, isNull, sql, lte, gte, or } from "drizzle-orm";
import { logAudit } from "../lib/auditLog";
import { requireRoles, type AuthedRequest } from "../middlewares/auth";
import { requireTierAccess } from "../middlewares/tierGate";
import { sendEmail, buildIncompleteTransitionEmail } from "../lib/email";
import {
  assertStudentInCallerDistrict, assertStaffInCallerDistrict,
  assertTransitionPlanInCallerDistrict,
} from "../lib/districtScope";

const router: IRouter = Router();
router.use("/transitions", requireTierAccess("compliance.transitions"));

const transitionAccess = requireRoles("admin", "coordinator", "case_manager", "sped_teacher");

const TRANSITION_AGE_THRESHOLD = 14;

function pick(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in obj) result[k] = obj[k];
  }
  return result;
}

const PLAN_PATCH_FIELDS = [
  "planDate", "iepDocumentId", "ageOfMajorityNotified", "ageOfMajorityDate", "graduationPathway",
  "expectedGraduationDate", "diplomaType", "creditsEarned", "creditsRequired",
  "assessmentsUsed", "studentVisionStatement", "coordinatorId", "status", "notes",
];
const GOAL_PATCH_FIELDS = [
  "domain", "goalStatement", "measurableCriteria", "activities",
  "responsibleParty", "targetDate", "status", "progressNotes",
];
const REFERRAL_PATCH_FIELDS = [
  "agencyName", "agencyType", "contactName", "contactPhone", "contactEmail",
  "referralDate", "status", "followUpDate", "outcome", "notes",
];

function computeAge(dob: string): number {
  const birth = new Date(dob + "T00:00:00");
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

router.get("/transitions/plans", transitionAccess, async (req, res): Promise<void> => {
  try {
    const rows = await db.select({
      id: transitionPlansTable.id,
      studentId: transitionPlansTable.studentId,
      planDate: transitionPlansTable.planDate,
      graduationPathway: transitionPlansTable.graduationPathway,
      expectedGraduationDate: transitionPlansTable.expectedGraduationDate,
      diplomaType: transitionPlansTable.diplomaType,
      assessmentsUsed: transitionPlansTable.assessmentsUsed,
      studentVisionStatement: transitionPlansTable.studentVisionStatement,
      status: transitionPlansTable.status,
      coordinatorId: transitionPlansTable.coordinatorId,
      createdAt: transitionPlansTable.createdAt,
      updatedAt: transitionPlansTable.updatedAt,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      studentDateOfBirth: studentsTable.dateOfBirth,
      studentGrade: studentsTable.grade,
      coordinatorFirstName: staffTable.firstName,
      coordinatorLastName: staffTable.lastName,
    })
      .from(transitionPlansTable)
      .innerJoin(studentsTable, eq(transitionPlansTable.studentId, studentsTable.id))
      .leftJoin(staffTable, eq(transitionPlansTable.coordinatorId, staffTable.id))
      .where(isNull(transitionPlansTable.deletedAt))
      .orderBy(desc(transitionPlansTable.updatedAt));

    let goalCountMap = new Map<number, number>();
    let referralCountMap = new Map<number, number>();
    if (rows.length > 0) {
      const planIds = rows.map(r => r.id);
      const goalCounts = await db.select({
        transitionPlanId: transitionGoalsTable.transitionPlanId,
        count: sql<number>`count(*)::int`,
      }).from(transitionGoalsTable)
        .where(and(isNull(transitionGoalsTable.deletedAt), sql`${transitionGoalsTable.transitionPlanId} = ANY(${planIds})`))
        .groupBy(transitionGoalsTable.transitionPlanId);
      for (const g of goalCounts) goalCountMap.set(g.transitionPlanId, g.count);

      const referralCounts = await db.select({
        transitionPlanId: transitionAgencyReferralsTable.transitionPlanId,
        count: sql<number>`count(*)::int`,
      }).from(transitionAgencyReferralsTable)
        .where(and(isNull(transitionAgencyReferralsTable.deletedAt), sql`${transitionAgencyReferralsTable.transitionPlanId} = ANY(${planIds})`))
        .groupBy(transitionAgencyReferralsTable.transitionPlanId);
      for (const r of referralCounts) referralCountMap.set(r.transitionPlanId, r.count);
    }

    res.json(rows.map(r => ({
      ...r,
      studentName: `${r.studentFirstName} ${r.studentLastName}`,
      studentAge: r.studentDateOfBirth ? computeAge(r.studentDateOfBirth) : null,
      coordinatorName: r.coordinatorFirstName ? `${r.coordinatorFirstName} ${r.coordinatorLastName}` : null,
      goalsCount: goalCountMap.get(r.id) ?? 0,
      referralsCount: referralCountMap.get(r.id) ?? 0,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })));
  } catch (err) {
    console.error("list transition plans", err);
    res.status(500).json({ error: "Failed to list transition plans" });
  }
});

router.get("/transitions/plans/:id", transitionAccess, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [plan] = await db.select()
      .from(transitionPlansTable)
      .where(and(eq(transitionPlansTable.id, id), isNull(transitionPlansTable.deletedAt)));
    if (!plan) { res.status(404).json({ error: "Not found" }); return; }

    const goals = await db.select().from(transitionGoalsTable)
      .where(and(eq(transitionGoalsTable.transitionPlanId, id), isNull(transitionGoalsTable.deletedAt)))
      .orderBy(transitionGoalsTable.domain);

    const referrals = await db.select().from(transitionAgencyReferralsTable)
      .where(and(eq(transitionAgencyReferralsTable.transitionPlanId, id), isNull(transitionAgencyReferralsTable.deletedAt)))
      .orderBy(desc(transitionAgencyReferralsTable.referralDate));

    const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, plan.studentId));

    res.json({
      ...plan,
      studentName: student ? `${student.firstName} ${student.lastName}` : null,
      studentAge: student?.dateOfBirth ? computeAge(student.dateOfBirth) : null,
      studentGrade: student?.grade ?? null,
      goals: goals.map(g => ({ ...g, createdAt: g.createdAt.toISOString(), updatedAt: g.updatedAt.toISOString() })),
      agencyReferrals: referrals.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })),
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error("get transition plan", err);
    res.status(500).json({ error: "Failed to get transition plan" });
  }
});

router.post("/transitions/plans", transitionAccess, async (req, res): Promise<void> => {
  try {
    const body = req.body;
    if (!body.studentId || !body.planDate) {
      res.status(400).json({ error: "studentId and planDate are required" });
      return;
    }

    // Body-IDOR defense: studentId + coordinatorId must be in caller's district.
    // (iepDocumentId ownership is already enforced via studentId match below.)
    const authed = req as AuthedRequest;
    if (!(await assertStudentInCallerDistrict(authed, Number(body.studentId), res))) return;
    if (body.coordinatorId != null
      && !(await assertStaffInCallerDistrict(authed, Number(body.coordinatorId), res))) return;

    const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, body.studentId));
    if (!student) {
      res.status(404).json({ error: "Student not found" });
      return;
    }
    if (student.dateOfBirth) {
      const age = computeAge(student.dateOfBirth);
      if (age < TRANSITION_AGE_THRESHOLD) {
        res.status(400).json({ error: `Student is ${age} years old. Transition plans require students to be at least ${TRANSITION_AGE_THRESHOLD}.` });
        return;
      }
    }

    let iepDocumentId = body.iepDocumentId ?? null;
    if (iepDocumentId) {
      const [iepDoc] = await db.select({ id: iepDocumentsTable.id, studentId: iepDocumentsTable.studentId })
        .from(iepDocumentsTable)
        .where(eq(iepDocumentsTable.id, iepDocumentId));
      if (!iepDoc) {
        res.status(400).json({ error: "IEP document not found" });
        return;
      }
      if (iepDoc.studentId !== body.studentId) {
        res.status(400).json({ error: "IEP document does not belong to this student" });
        return;
      }
    } else {
      const [activeIep] = await db.select({ id: iepDocumentsTable.id })
        .from(iepDocumentsTable)
        .where(and(eq(iepDocumentsTable.studentId, body.studentId), eq(iepDocumentsTable.active, true)))
        .orderBy(desc(iepDocumentsTable.updatedAt))
        .limit(1);
      if (activeIep) iepDocumentId = activeIep.id;
    }

    const [row] = await db.insert(transitionPlansTable).values({
      studentId: body.studentId,
      iepDocumentId,
      planDate: body.planDate,
      ageOfMajorityNotified: body.ageOfMajorityNotified ?? false,
      ageOfMajorityDate: body.ageOfMajorityDate ?? null,
      graduationPathway: body.graduationPathway ?? null,
      expectedGraduationDate: body.expectedGraduationDate ?? null,
      diplomaType: body.diplomaType ?? null,
      creditsEarned: body.creditsEarned ?? null,
      creditsRequired: body.creditsRequired ?? null,
      assessmentsUsed: body.assessmentsUsed ?? null,
      studentVisionStatement: body.studentVisionStatement ?? null,
      coordinatorId: body.coordinatorId ?? null,
      status: body.status ?? "draft",
      notes: body.notes ?? null,
    }).returning();

    logAudit(req, { action: "create", targetTable: "transition_plans", targetId: row.id, studentId: body.studentId, summary: `Created transition plan for student #${body.studentId}` });
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });

    if (row.coordinatorId && (row.status === "draft" || !row.status)) {
      (async () => {
        try {
          const [coordinator] = await db.select().from(staffTable).where(eq(staffTable.id, row.coordinatorId!));
          if (!coordinator?.email) return;
          const [school] = student?.schoolId
            ? await db.select().from(schoolsTable).where(eq(schoolsTable.id, student.schoolId))
            : [null];
          const planDateStr = row.planDate ?? new Date().toISOString().substring(0, 10);
          const emailContent = buildIncompleteTransitionEmail({
            coordinatorName: `${coordinator.firstName} ${coordinator.lastName}`,
            studentName: `${student.firstName} ${student.lastName}`,
            planDate: planDateStr,
            schoolName: school?.name ?? "the school",
          });
          await sendEmail({
            studentId: row.studentId,
            type: "incomplete_transition_reminder",
            subject: emailContent.subject,
            bodyHtml: emailContent.html,
            bodyText: emailContent.text,
            toEmail: coordinator.email,
            toName: `${coordinator.firstName} ${coordinator.lastName}`,
            staffId: row.coordinatorId ?? undefined,
            metadata: { transitionPlanId: row.id, triggeredBy: "transition_plan_created_draft" },
          });
        } catch (emailErr) {
          console.error("Transition plan reminder email error:", emailErr);
        }
      })();
    }
  } catch (err) {
    console.error("create transition plan", err);
    res.status(500).json({ error: "Failed to create transition plan" });
  }
});

router.patch("/transitions/plans/:id", transitionAccess, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid plan id" }); return; }

    // Tenant guard on the plan itself, plus any body-supplied coordinator swap.
    const authed = req as AuthedRequest;
    if (!(await assertTransitionPlanInCallerDistrict(authed, id, res))) return;
    const updates = pick(req.body, PLAN_PATCH_FIELDS);
    if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid fields" }); return; }
    if (updates.coordinatorId != null
      && !(await assertStaffInCallerDistrict(authed, Number(updates.coordinatorId), res))) return;
    const [row] = await db.update(transitionPlansTable).set(updates).where(and(eq(transitionPlansTable.id, id), isNull(transitionPlansTable.deletedAt))).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, { action: "update", targetTable: "transition_plans", targetId: id, studentId: row.studentId, summary: `Updated transition plan #${id}` });
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (err) {
    console.error("update transition plan", err);
    res.status(500).json({ error: "Failed to update transition plan" });
  }
});

router.delete("/transitions/plans/:id", transitionAccess, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid plan id" }); return; }
    if (!(await assertTransitionPlanInCallerDistrict(req as AuthedRequest, id, res))) return;
    const [row] = await db.update(transitionPlansTable).set({ deletedAt: new Date() }).where(and(eq(transitionPlansTable.id, id), isNull(transitionPlansTable.deletedAt))).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, { action: "delete", targetTable: "transition_plans", targetId: id, studentId: row.studentId, summary: `Soft-deleted transition plan #${id}` });
    res.json({ success: true });
  } catch (err) {
    console.error("delete transition plan", err);
    res.status(500).json({ error: "Failed to delete transition plan" });
  }
});

router.post("/transitions/goals", transitionAccess, async (req, res): Promise<void> => {
  try {
    const body = req.body;
    if (!body.transitionPlanId || !body.domain || !body.goalStatement) {
      res.status(400).json({ error: "transitionPlanId, domain, and goalStatement are required" });
      return;
    }
    const validDomains = ["education", "employment", "independent_living"];
    if (!validDomains.includes(body.domain)) {
      res.status(400).json({ error: `domain must be one of: ${validDomains.join(", ")}` });
      return;
    }
    // Body-IDOR defense: parent plan must be in caller's district.
    if (!(await assertTransitionPlanInCallerDistrict(req as AuthedRequest, Number(body.transitionPlanId), res))) return;
    const [parentPlan] = await db.select({ id: transitionPlansTable.id })
      .from(transitionPlansTable)
      .where(and(eq(transitionPlansTable.id, body.transitionPlanId), isNull(transitionPlansTable.deletedAt)));
    if (!parentPlan) {
      res.status(404).json({ error: "Transition plan not found or has been deleted" });
      return;
    }
    const [row] = await db.insert(transitionGoalsTable).values({
      transitionPlanId: body.transitionPlanId,
      domain: body.domain,
      goalStatement: body.goalStatement,
      measurableCriteria: body.measurableCriteria ?? null,
      activities: body.activities ?? null,
      responsibleParty: body.responsibleParty ?? null,
      targetDate: body.targetDate ?? null,
      status: body.status ?? "active",
      progressNotes: body.progressNotes ?? null,
    }).returning();

    logAudit(req, { action: "create", targetTable: "transition_goals", targetId: row.id, summary: `Created ${body.domain} transition goal for plan #${body.transitionPlanId}` });
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (err) {
    console.error("create transition goal", err);
    res.status(500).json({ error: "Failed to create transition goal" });
  }
});

router.patch("/transitions/goals/:id", transitionAccess, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid goal id" }); return; }

    // Tenant guard: resolve parent plan, then assert it's in caller's district.
    const [goalRow] = await db.select({ transitionPlanId: transitionGoalsTable.transitionPlanId })
      .from(transitionGoalsTable)
      .where(and(eq(transitionGoalsTable.id, id), isNull(transitionGoalsTable.deletedAt)));
    if (!goalRow) { res.status(404).json({ error: "Not found" }); return; }
    if (!(await assertTransitionPlanInCallerDistrict(req as AuthedRequest, goalRow.transitionPlanId, res))) return;

    const updates = pick(req.body, GOAL_PATCH_FIELDS);
    if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid fields" }); return; }
    const [row] = await db.update(transitionGoalsTable).set(updates).where(and(eq(transitionGoalsTable.id, id), isNull(transitionGoalsTable.deletedAt))).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, { action: "update", targetTable: "transition_goals", targetId: id, summary: `Updated transition goal #${id}` });
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (err) {
    console.error("update transition goal", err);
    res.status(500).json({ error: "Failed to update transition goal" });
  }
});

router.delete("/transitions/goals/:id", transitionAccess, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid goal id" }); return; }

    const [goalRow] = await db.select({ transitionPlanId: transitionGoalsTable.transitionPlanId })
      .from(transitionGoalsTable)
      .where(and(eq(transitionGoalsTable.id, id), isNull(transitionGoalsTable.deletedAt)));
    if (!goalRow) { res.status(404).json({ error: "Not found" }); return; }
    if (!(await assertTransitionPlanInCallerDistrict(req as AuthedRequest, goalRow.transitionPlanId, res))) return;

    const [row] = await db.update(transitionGoalsTable).set({ deletedAt: new Date() }).where(and(eq(transitionGoalsTable.id, id), isNull(transitionGoalsTable.deletedAt))).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, { action: "delete", targetTable: "transition_goals", targetId: id, summary: `Soft-deleted transition goal #${id}` });
    res.json({ success: true });
  } catch (err) {
    console.error("delete transition goal", err);
    res.status(500).json({ error: "Failed to delete transition goal" });
  }
});

router.post("/transitions/agency-referrals", transitionAccess, async (req, res): Promise<void> => {
  try {
    const body = req.body;
    if (!body.transitionPlanId || !body.agencyName || !body.referralDate) {
      res.status(400).json({ error: "transitionPlanId, agencyName, and referralDate are required" });
      return;
    }
    if (!(await assertTransitionPlanInCallerDistrict(req as AuthedRequest, Number(body.transitionPlanId), res))) return;
    const [parentPlan] = await db.select({ id: transitionPlansTable.id })
      .from(transitionPlansTable)
      .where(and(eq(transitionPlansTable.id, body.transitionPlanId), isNull(transitionPlansTable.deletedAt)));
    if (!parentPlan) {
      res.status(404).json({ error: "Transition plan not found or has been deleted" });
      return;
    }
    const [row] = await db.insert(transitionAgencyReferralsTable).values({
      transitionPlanId: body.transitionPlanId,
      agencyName: body.agencyName,
      agencyType: body.agencyType ?? null,
      contactName: body.contactName ?? null,
      contactPhone: body.contactPhone ?? null,
      contactEmail: body.contactEmail ?? null,
      referralDate: body.referralDate,
      status: body.status ?? "pending",
      followUpDate: body.followUpDate ?? null,
      outcome: body.outcome ?? null,
      notes: body.notes ?? null,
    }).returning();

    logAudit(req, { action: "create", targetTable: "transition_agency_referrals", targetId: row.id, summary: `Created agency referral to ${body.agencyName} for plan #${body.transitionPlanId}` });
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (err) {
    console.error("create agency referral", err);
    res.status(500).json({ error: "Failed to create agency referral" });
  }
});

router.patch("/transitions/agency-referrals/:id", transitionAccess, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid referral id" }); return; }

    const [refRow] = await db.select({ transitionPlanId: transitionAgencyReferralsTable.transitionPlanId })
      .from(transitionAgencyReferralsTable)
      .where(and(eq(transitionAgencyReferralsTable.id, id), isNull(transitionAgencyReferralsTable.deletedAt)));
    if (!refRow) { res.status(404).json({ error: "Not found" }); return; }
    if (!(await assertTransitionPlanInCallerDistrict(req as AuthedRequest, refRow.transitionPlanId, res))) return;

    const updates = pick(req.body, REFERRAL_PATCH_FIELDS);
    if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid fields" }); return; }
    const [row] = await db.update(transitionAgencyReferralsTable).set(updates).where(and(eq(transitionAgencyReferralsTable.id, id), isNull(transitionAgencyReferralsTable.deletedAt))).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, { action: "update", targetTable: "transition_agency_referrals", targetId: id, summary: `Updated agency referral #${id}` });
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (err) {
    console.error("update agency referral", err);
    res.status(500).json({ error: "Failed to update agency referral" });
  }
});

router.delete("/transitions/agency-referrals/:id", transitionAccess, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid referral id" }); return; }

    const [refRow] = await db.select({ transitionPlanId: transitionAgencyReferralsTable.transitionPlanId })
      .from(transitionAgencyReferralsTable)
      .where(and(eq(transitionAgencyReferralsTable.id, id), isNull(transitionAgencyReferralsTable.deletedAt)));
    if (!refRow) { res.status(404).json({ error: "Not found" }); return; }
    if (!(await assertTransitionPlanInCallerDistrict(req as AuthedRequest, refRow.transitionPlanId, res))) return;

    const [row] = await db.update(transitionAgencyReferralsTable).set({ deletedAt: new Date() }).where(and(eq(transitionAgencyReferralsTable.id, id), isNull(transitionAgencyReferralsTable.deletedAt))).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, { action: "delete", targetTable: "transition_agency_referrals", targetId: id, summary: `Soft-deleted agency referral #${id}` });
    res.json({ success: true });
  } catch (err) {
    console.error("delete agency referral", err);
    res.status(500).json({ error: "Failed to delete agency referral" });
  }
});

router.get("/transitions/student/:studentId", transitionAccess, async (req, res): Promise<void> => {
  try {
    const studentId = Number(req.params.studentId);
    const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    if (!student) { res.status(404).json({ error: "Student not found" }); return; }

    const age = student.dateOfBirth ? computeAge(student.dateOfBirth) : null;
    const isTransitionAge = age !== null && age >= TRANSITION_AGE_THRESHOLD;

    const plans = await db.select()
      .from(transitionPlansTable)
      .where(and(eq(transitionPlansTable.studentId, studentId), isNull(transitionPlansTable.deletedAt)))
      .orderBy(desc(transitionPlansTable.planDate));

    const plansWithDetails = await Promise.all(plans.map(async (plan) => {
      const goals = await db.select().from(transitionGoalsTable)
        .where(and(eq(transitionGoalsTable.transitionPlanId, plan.id), isNull(transitionGoalsTable.deletedAt)));
      const referrals = await db.select().from(transitionAgencyReferralsTable)
        .where(and(eq(transitionAgencyReferralsTable.transitionPlanId, plan.id), isNull(transitionAgencyReferralsTable.deletedAt)));
      return {
        ...plan,
        goals: goals.map(g => ({ ...g, createdAt: g.createdAt.toISOString(), updatedAt: g.updatedAt.toISOString() })),
        agencyReferrals: referrals.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })),
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
      };
    }));

    res.json({
      studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      dateOfBirth: student.dateOfBirth,
      age,
      isTransitionAge,
      grade: student.grade,
      plans: plansWithDetails,
    });
  } catch (err) {
    console.error("get student transition", err);
    res.status(500).json({ error: "Failed to get student transition data" });
  }
});

router.get("/transitions/dashboard", transitionAccess, async (req, res): Promise<void> => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const ninetyDaysFromNow = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

    const allStudents = await db.select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      dateOfBirth: studentsTable.dateOfBirth,
      grade: studentsTable.grade,
      status: studentsTable.status,
    })
      .from(studentsTable)
      .where(eq(studentsTable.status, "active"));

    const transitionAgeStudents = allStudents.filter(s =>
      s.dateOfBirth && computeAge(s.dateOfBirth) >= TRANSITION_AGE_THRESHOLD
    );

    const approachingStudents = allStudents.filter(s => {
      if (!s.dateOfBirth) return false;
      const age = computeAge(s.dateOfBirth);
      return age >= (TRANSITION_AGE_THRESHOLD - 1) && age < TRANSITION_AGE_THRESHOLD;
    });

    const existingPlans = await db.select({
      id: transitionPlansTable.id,
      studentId: transitionPlansTable.studentId,
      graduationPathway: transitionPlansTable.graduationPathway,
      status: transitionPlansTable.status,
    })
      .from(transitionPlansTable)
      .where(isNull(transitionPlansTable.deletedAt));

    const plansByStudent = new Map<number, typeof existingPlans>();
    for (const p of existingPlans) {
      if (!plansByStudent.has(p.studentId)) plansByStudent.set(p.studentId, []);
      plansByStudent.get(p.studentId)!.push(p);
    }

    const missingPlans = transitionAgeStudents.filter(s => !plansByStudent.has(s.id));

    const allPlanIds = existingPlans.map(p => p.id);
    let goalsByPlan = new Map<number, string[]>();
    if (allPlanIds.length > 0) {
      const goalRows = await db.select({
        transitionPlanId: transitionGoalsTable.transitionPlanId,
        domain: transitionGoalsTable.domain,
      }).from(transitionGoalsTable).where(isNull(transitionGoalsTable.deletedAt));
      for (const g of goalRows) {
        if (!goalsByPlan.has(g.transitionPlanId)) goalsByPlan.set(g.transitionPlanId, []);
        goalsByPlan.get(g.transitionPlanId)!.push(g.domain);
      }
    }

    const REQUIRED_DOMAINS = ["education", "employment", "independent_living"];
    const incompletePlanStudents: { id: number; name: string; age: number | null; grade: string | null; missingDomains: string[]; missingGraduationPathway: boolean }[] = [];
    for (const s of transitionAgeStudents) {
      const sPlans = plansByStudent.get(s.id);
      if (!sPlans) continue;
      const allDomains = new Set<string>();
      let hasPathway = false;
      for (const p of sPlans) {
        const pGoalDomains = goalsByPlan.get(p.id) ?? [];
        for (const d of pGoalDomains) allDomains.add(d);
        if (p.graduationPathway) hasPathway = true;
      }
      const missing = REQUIRED_DOMAINS.filter(d => !allDomains.has(d));
      if (missing.length > 0 || !hasPathway) {
        incompletePlanStudents.push({
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
          age: s.dateOfBirth ? computeAge(s.dateOfBirth) : null,
          grade: s.grade,
          missingDomains: missing,
          missingGraduationPathway: !hasPathway,
        });
      }
    }

    const pendingReferrals = await db.select({
      id: transitionAgencyReferralsTable.id,
      agencyName: transitionAgencyReferralsTable.agencyName,
      followUpDate: transitionAgencyReferralsTable.followUpDate,
      transitionPlanId: transitionAgencyReferralsTable.transitionPlanId,
    })
      .from(transitionAgencyReferralsTable)
      .where(and(
        isNull(transitionAgencyReferralsTable.deletedAt),
        eq(transitionAgencyReferralsTable.status, "pending"),
      ));

    const overdueFollowups = pendingReferrals.filter(r =>
      r.followUpDate && r.followUpDate < today
    );

    res.json({
      totalTransitionAge: transitionAgeStudents.length,
      approachingTransitionAge: approachingStudents.length,
      withPlan: transitionAgeStudents.length - missingPlans.length,
      missingPlan: missingPlans.length,
      incompletePlans: incompletePlanStudents.length,
      missingPlanStudents: missingPlans.map(s => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        age: s.dateOfBirth ? computeAge(s.dateOfBirth) : null,
        grade: s.grade,
      })),
      incompletePlanStudents,
      approachingStudents: approachingStudents.map(s => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        age: s.dateOfBirth ? computeAge(s.dateOfBirth) : null,
        grade: s.grade,
      })),
      pendingAgencyReferrals: pendingReferrals.length,
      overdueFollowups: overdueFollowups.length,
    });
  } catch (err) {
    console.error("transition dashboard", err);
    res.status(500).json({ error: "Failed to get transition dashboard" });
  }
});

export default router;
