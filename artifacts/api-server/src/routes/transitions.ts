import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  transitionPlansTable, transitionGoalsTable, transitionAgencyReferralsTable,
  studentsTable, staffTable,
} from "@workspace/db";
import { eq, and, desc, isNull, sql, lte, gte, or } from "drizzle-orm";
import { logAudit } from "../lib/auditLog";
import { requireRoles } from "../middlewares/auth";

const router: IRouter = Router();

const transitionAccess = requireRoles("admin", "coordinator", "case_manager", "sped_teacher");

const TRANSITION_AGE_THRESHOLD = 14;

function pick<T extends Record<string, unknown>>(obj: T, keys: string[]): Partial<T> {
  const result: Partial<T> = {};
  for (const k of keys) {
    if (k in obj) (result as any)[k] = obj[k];
  }
  return result;
}

const PLAN_PATCH_FIELDS = [
  "planDate", "ageOfMajorityNotified", "ageOfMajorityDate", "graduationPathway",
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

    res.json(rows.map(r => ({
      ...r,
      studentName: `${r.studentFirstName} ${r.studentLastName}`,
      studentAge: r.studentDateOfBirth ? computeAge(r.studentDateOfBirth) : null,
      coordinatorName: r.coordinatorFirstName ? `${r.coordinatorFirstName} ${r.coordinatorLastName}` : null,
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
    const [row] = await db.insert(transitionPlansTable).values({
      studentId: body.studentId,
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
  } catch (err) {
    console.error("create transition plan", err);
    res.status(500).json({ error: "Failed to create transition plan" });
  }
});

router.patch("/transitions/plans/:id", transitionAccess, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const updates = pick(req.body, PLAN_PATCH_FIELDS);
    if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid fields" }); return; }
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
      studentId: transitionPlansTable.studentId,
    })
      .from(transitionPlansTable)
      .where(isNull(transitionPlansTable.deletedAt));

    const studentIdsWithPlans = new Set(existingPlans.map(p => p.studentId));

    const missingPlans = transitionAgeStudents.filter(s => !studentIdsWithPlans.has(s.id));

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
      missingPlanStudents: missingPlans.map(s => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        age: s.dateOfBirth ? computeAge(s.dateOfBirth) : null,
        grade: s.grade,
      })),
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
