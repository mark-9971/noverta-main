import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  evaluationReferralsTable, evaluationsTable, eligibilityDeterminationsTable,
  studentsTable, staffTable, schoolsTable,
} from "@workspace/db";
import { eq, and, desc, asc, isNull, lte, sql, or } from "drizzle-orm";
import { logAudit } from "../lib/auditLog";
import { requireRoles, getEnforcedDistrictId, type AuthedRequest } from "../middlewares/auth";
import { createAutoVersion } from "../lib/documentVersioning";
import { requireTierAccess } from "../middlewares/tierGate";
import { sendEmail, buildOverdueEvaluationEmail } from "../lib/email";
import {
  assertStudentInCallerDistrict, assertStaffInCallerDistrict,
  assertSchoolInCallerDistrict, assertReferralInCallerDistrict,
  assertEvaluationInCallerDistrict, assertEligibilityInCallerDistrict,
  allStaffInCallerDistrict,
} from "../lib/districtScope";

/**
 * Extract numeric staff ids from a teamMembers payload.
 * The teamMembers field is JSON; entries may be strings, numbers, or
 * `{ staffId, role, name }` objects. Only validate ids we recognize as numeric;
 * free-text member names (e.g. "Parent: Jane Doe") are allowed through.
 */
function extractTeamMemberStaffIds(teamMembers: unknown): number[] {
  if (!Array.isArray(teamMembers)) return [];
  const ids: number[] = [];
  for (const m of teamMembers) {
    if (typeof m === "number" && Number.isFinite(m)) {
      ids.push(m);
    } else if (m && typeof m === "object") {
      const candidate = (m as Record<string, unknown>).staffId;
      if (typeof candidate === "number" && Number.isFinite(candidate)) ids.push(candidate);
      else if (typeof candidate === "string" && /^\d+$/.test(candidate)) ids.push(Number(candidate));
    }
  }
  return ids;
}

const router: IRouter = Router();
router.use("/evaluations", requireTierAccess("compliance.evaluations"));

const evalAccess = requireRoles("admin", "coordinator", "case_manager", "sped_teacher", "bcba");

function parsePagination(query: any, defaultLimit = 100, maxLimit = 500) {
  const limit = Math.min(Math.max(parseInt(query.limit) || defaultLimit, 1), maxLimit);
  const offset = Math.max(parseInt(query.offset) || 0, 0);
  return { limit, offset };
}

interface TimelineRule {
  state: string;
  schoolDays: number;
  calendarMultiplier: number;
  label: string;
}

const TIMELINE_RULES: Record<string, TimelineRule> = {
  MA: { state: "Massachusetts", schoolDays: 30, calendarMultiplier: 1.5, label: "603 CMR 28.04 — 30 school days" },
  IDEA_FEDERAL: { state: "Federal (IDEA)", schoolDays: 60, calendarMultiplier: 1.0, label: "IDEA — 60 calendar days" },
  CA: { state: "California", schoolDays: 60, calendarMultiplier: 1.0, label: "CA Ed Code — 60 calendar days" },
  NY: { state: "New York", schoolDays: 60, calendarMultiplier: 1.0, label: "NY — 60 calendar days" },
  TX: { state: "Texas", schoolDays: 45, calendarMultiplier: 1.0, label: "TX — 45 calendar days" },
};

const DEFAULT_RULE_KEY = "MA";

function calcDeadline(consentDate: string, ruleKey?: string): string {
  const rule = TIMELINE_RULES[ruleKey ?? DEFAULT_RULE_KEY] ?? TIMELINE_RULES[DEFAULT_RULE_KEY];
  const d = new Date(consentDate + "T12:00:00");
  const calendarDays = Math.ceil(rule.schoolDays * rule.calendarMultiplier);
  d.setDate(d.getDate() + calendarDays);
  return d.toISOString().slice(0, 10);
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T12:00:00");
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function pick<T extends Record<string, unknown>>(obj: T, keys: string[]): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result as Partial<T>;
}

const REFERRAL_PATCH_FIELDS = [
  "referralDate", "referralSource", "referralSourceName", "reason",
  "areasOfConcern", "parentNotifiedDate", "consentRequestedDate",
  "consentReceivedDate", "consentStatus", "evaluationDeadline",
  "assignedEvaluatorId", "schoolId", "status", "notes",
];

const EVALUATION_PATCH_FIELDS = [
  "evaluationType", "evaluationAreas", "teamMembers", "leadEvaluatorId",
  "startDate", "dueDate", "completionDate", "meetingDate",
  "reportSummary", "status", "notes",
];

const ELIGIBILITY_PATCH_FIELDS = [
  "meetingDate", "teamMembers", "primaryDisability", "secondaryDisability",
  "eligible", "determinationBasis", "determinationNotes", "iepRequired",
  "nextReEvalDate", "reEvalCycleMonths", "status",
];

router.get("/evaluations/timeline-rules", evalAccess, async (_req, res): Promise<void> => {
  res.json({
    rules: Object.entries(TIMELINE_RULES).map(([key, rule]) => ({
      key,
      state: rule.state,
      schoolDays: rule.schoolDays,
      label: rule.label,
    })),
    defaultRule: DEFAULT_RULE_KEY,
  });
});

router.get("/evaluations/referrals", evalAccess, async (_req, res): Promise<void> => {
  try {
    const { limit, offset } = parsePagination(_req.query);
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
      .orderBy(desc(evaluationReferralsTable.createdAt))
      .limit(limit)
      .offset(offset);

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
  } catch (err) {
    console.error("GET /evaluations/referrals error:", err);
    res.status(500).json({ error: "Failed to list referrals" });
  }
});

router.post("/evaluations/referrals", evalAccess, async (req, res): Promise<void> => {
  try {
    const body = req.body;
    if (!body.studentId || !body.referralDate || !body.reason) {
      res.status(400).json({ error: "studentId, referralDate, and reason are required" });
      return;
    }
    // Body-IDOR defense: every body-supplied foreign key must belong to caller's district.
    const authed = req as AuthedRequest;
    if (!(await assertStudentInCallerDistrict(authed, Number(body.studentId), res))) return;
    if (body.assignedEvaluatorId != null
      && !(await assertStaffInCallerDistrict(authed, Number(body.assignedEvaluatorId), res))) return;
    if (body.schoolId != null
      && !(await assertSchoolInCallerDistrict(authed, Number(body.schoolId), res))) return;

    let evaluationDeadline = body.evaluationDeadline ?? null;
    if (body.consentReceivedDate && !evaluationDeadline) {
      evaluationDeadline = calcDeadline(body.consentReceivedDate, body.timelineRule ?? undefined);
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
  } catch (err) {
    console.error("POST /evaluations/referrals error:", err);
    res.status(500).json({ error: "Failed to create referral" });
  }
});

router.patch("/evaluations/referrals/:id", evalAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid referral id" }); return; }

    // Tenant guard on the referral itself, then on any body-supplied FK swap.
    const authed = req as AuthedRequest;
    if (!(await assertReferralInCallerDistrict(authed, id, res))) return;
    const updates = pick(req.body, REFERRAL_PATCH_FIELDS);
    if (updates.assignedEvaluatorId != null
      && !(await assertStaffInCallerDistrict(authed, Number(updates.assignedEvaluatorId), res))) return;
    if (updates.schoolId != null
      && !(await assertSchoolInCallerDistrict(authed, Number(updates.schoolId), res))) return;

    if (updates.consentReceivedDate && !updates.evaluationDeadline) {
      updates.evaluationDeadline = calcDeadline(
        updates.consentReceivedDate as string,
        req.body.timelineRule ?? undefined,
      );
      if (updates.consentStatus === "pending" || !updates.consentStatus) {
        updates.consentStatus = "obtained";
      }
    }

    const [oldRow] = await db.select().from(evaluationReferralsTable).where(eq(evaluationReferralsTable.id, id));
    const [row] = await db.update(evaluationReferralsTable)
      .set(updates)
      .where(eq(evaluationReferralsTable.id, id))
      .returning();
    if (!row) { res.status(404).json({ error: "Referral not found" }); return; }

    logAudit(req, { action: "update", targetTable: "evaluation_referrals", targetId: id, studentId: row.studentId, summary: `Updated referral #${id}` });
    const districtId = getEnforcedDistrictId(authed);
    if (districtId) {
      const oldVals = oldRow ? (Object.fromEntries(Object.keys(updates).map(k => [k, (oldRow as Record<string, unknown>)[k]]))) : null;
      createAutoVersion({
        documentType: "evaluation_referral",
        documentId: id,
        studentId: row.studentId,
        districtId,
        authorUserId: authed.userId || "system",
        authorName: authed.displayName || "System",
        title: `Evaluation Referral #${id} updated`,
        oldValues: oldVals,
        newValues: updates as Record<string, unknown>,
      });
    }
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (err) {
    console.error("PATCH /evaluations/referrals error:", err);
    res.status(500).json({ error: "Failed to update referral" });
  }
});

router.get("/evaluations", evalAccess, async (_req, res): Promise<void> => {
  try {
    const { limit, offset } = parsePagination(_req.query);
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
      .orderBy(desc(evaluationsTable.createdAt))
      .limit(limit)
      .offset(offset);

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
  } catch (err) {
    console.error("GET /evaluations error:", err);
    res.status(500).json({ error: "Failed to list evaluations" });
  }
});

router.post("/evaluations", evalAccess, async (req, res): Promise<void> => {
  try {
    const body = req.body;
    if (!body.studentId) {
      res.status(400).json({ error: "studentId is required" });
      return;
    }
    const validEvalTypes = ["initial", "reevaluation", "independent"];
    if (body.evaluationType && !validEvalTypes.includes(body.evaluationType)) {
      res.status(400).json({ error: `evaluationType must be one of: ${validEvalTypes.join(", ")}` });
      return;
    }

    // Body-IDOR defense: validate every cross-tenant FK before insert.
    const authed = req as AuthedRequest;
    if (!(await assertStudentInCallerDistrict(authed, Number(body.studentId), res))) return;
    if (body.referralId != null
      && !(await assertReferralInCallerDistrict(authed, Number(body.referralId), res))) return;
    if (body.leadEvaluatorId != null
      && !(await assertStaffInCallerDistrict(authed, Number(body.leadEvaluatorId), res))) return;
    const teamStaffIds = extractTeamMemberStaffIds(body.teamMembers);
    if (teamStaffIds.length > 0 && !(await allStaffInCallerDistrict(authed, teamStaffIds))) {
      res.status(403).json({ error: "One or more team members are not in your district" });
      return;
    }

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
      await db.update(evaluationReferralsTable)
        .set({ status: "evaluation_in_progress" })
        .where(eq(evaluationReferralsTable.id, body.referralId));
    }

    logAudit(req, { action: "create", targetTable: "evaluations", targetId: row.id, studentId: body.studentId, summary: `Created evaluation for student #${body.studentId}` });
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });

    if (row.dueDate && row.leadEvaluatorId) {
      (async () => {
        try {
          const dueMs = new Date(row.dueDate!).getTime();
          const daysOverdue = Math.floor((Date.now() - dueMs) / 86400000);
          if (daysOverdue < 0) return;
          const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, row.studentId));
          const [leadStaff] = await db.select().from(staffTable).where(eq(staffTable.id, row.leadEvaluatorId!));
          if (!leadStaff?.email) return;
          const [school] = student?.schoolId
            ? await db.select().from(schoolsTable).where(eq(schoolsTable.id, student.schoolId))
            : [null];
          const emailContent = buildOverdueEvaluationEmail({
            staffName: `${leadStaff.firstName} ${leadStaff.lastName}`,
            studentName: student ? `${student.firstName} ${student.lastName}` : "Student",
            evaluationType: row.evaluationType ?? "initial",
            dueDate: row.dueDate!,
            daysOverdue,
            schoolName: school?.name ?? "the school",
          });
          await sendEmail({
            studentId: row.studentId,
            type: "overdue_evaluation_reminder",
            subject: emailContent.subject,
            bodyHtml: emailContent.html,
            bodyText: emailContent.text,
            toEmail: leadStaff.email,
            toName: `${leadStaff.firstName} ${leadStaff.lastName}`,
            staffId: row.leadEvaluatorId ?? undefined,
            metadata: { evaluationId: row.id, daysOverdue, triggeredBy: "evaluation_created_overdue" },
          });
        } catch (emailErr) {
          console.error("Overdue evaluation alert email error:", emailErr);
        }
      })();
    }
  } catch (err) {
    console.error("POST /evaluations error:", err);
    res.status(500).json({ error: "Failed to create evaluation" });
  }
});

router.patch("/evaluations/:id", evalAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid evaluation id" }); return; }

    const authed = req as AuthedRequest;
    if (!(await assertEvaluationInCallerDistrict(authed, id, res))) return;
    const updates = pick(req.body, EVALUATION_PATCH_FIELDS);
    if (updates.leadEvaluatorId != null
      && !(await assertStaffInCallerDistrict(authed, Number(updates.leadEvaluatorId), res))) return;
    if (updates.teamMembers !== undefined) {
      const teamStaffIds = extractTeamMemberStaffIds(updates.teamMembers);
      if (teamStaffIds.length > 0 && !(await allStaffInCallerDistrict(authed, teamStaffIds))) {
        res.status(403).json({ error: "One or more team members are not in your district" });
        return;
      }
    }

    const [oldRow] = await db.select().from(evaluationsTable).where(eq(evaluationsTable.id, id));
    const [row] = await db.update(evaluationsTable)
      .set(updates)
      .where(eq(evaluationsTable.id, id))
      .returning();
    if (!row) { res.status(404).json({ error: "Evaluation not found" }); return; }

    logAudit(req, { action: "update", targetTable: "evaluations", targetId: id, studentId: row.studentId, summary: `Updated evaluation #${id}` });
    const districtId = getEnforcedDistrictId(authed);
    if (districtId) {
      const oldVals = oldRow ? (Object.fromEntries(Object.keys(updates).map(k => [k, (oldRow as Record<string, unknown>)[k]]))) : null;
      createAutoVersion({
        documentType: "evaluation",
        documentId: id,
        studentId: row.studentId,
        districtId,
        authorUserId: authed.userId || "system",
        authorName: authed.displayName || "System",
        title: `Evaluation #${id} updated`,
        oldValues: oldVals,
        newValues: updates as Record<string, unknown>,
      });
    }
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (err) {
    console.error("PATCH /evaluations error:", err);
    res.status(500).json({ error: "Failed to update evaluation" });
  }
});

router.get("/evaluations/eligibility", evalAccess, async (_req, res): Promise<void> => {
  try {
    const { limit, offset } = parsePagination(_req.query);
    const rows = await db.select({
      determination: eligibilityDeterminationsTable,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      studentGrade: studentsTable.grade,
    }).from(eligibilityDeterminationsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, eligibilityDeterminationsTable.studentId))
      .where(isNull(eligibilityDeterminationsTable.deletedAt))
      .orderBy(desc(eligibilityDeterminationsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const result = rows.map(r => ({
      ...r.determination,
      studentName: r.studentFirstName ? `${r.studentFirstName} ${r.studentLastName}` : null,
      studentGrade: r.studentGrade,
      daysUntilReEval: r.determination.nextReEvalDate ? daysUntil(r.determination.nextReEvalDate) : null,
      createdAt: r.determination.createdAt.toISOString(),
      updatedAt: r.determination.updatedAt.toISOString(),
    }));
    res.json(result);
  } catch (err) {
    console.error("GET /evaluations/eligibility error:", err);
    res.status(500).json({ error: "Failed to list eligibility determinations" });
  }
});

router.post("/evaluations/eligibility", evalAccess, async (req, res): Promise<void> => {
  try {
    const body = req.body;
    if (!body.studentId || !body.meetingDate) {
      res.status(400).json({ error: "studentId and meetingDate are required" });
      return;
    }

    // Body-IDOR defense: student/evaluation FK + team-member staff ids must be in district.
    const authed = req as AuthedRequest;
    if (!(await assertStudentInCallerDistrict(authed, Number(body.studentId), res))) return;
    if (body.evaluationId != null
      && !(await assertEvaluationInCallerDistrict(authed, Number(body.evaluationId), res))) return;
    const teamStaffIds = extractTeamMemberStaffIds(body.teamMembers);
    if (teamStaffIds.length > 0 && !(await allStaffInCallerDistrict(authed, teamStaffIds))) {
      res.status(403).json({ error: "One or more team members are not in your district" });
      return;
    }

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
      await db.update(evaluationsTable)
        .set({ status: "completed" })
        .where(eq(evaluationsTable.id, body.evaluationId));
    }

    logAudit(req, { action: "create", targetTable: "eligibility_determinations", targetId: row.id, studentId: body.studentId, summary: `Created eligibility determination for student #${body.studentId}` });
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (err) {
    console.error("POST /evaluations/eligibility error:", err);
    res.status(500).json({ error: "Failed to create eligibility determination" });
  }
});

router.patch("/evaluations/eligibility/:id", evalAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid eligibility id" }); return; }

    const authed = req as AuthedRequest;
    if (!(await assertEligibilityInCallerDistrict(authed, id, res))) return;
    const updates = pick(req.body, ELIGIBILITY_PATCH_FIELDS);
    if (updates.teamMembers !== undefined) {
      const teamStaffIds = extractTeamMemberStaffIds(updates.teamMembers);
      if (teamStaffIds.length > 0 && !(await allStaffInCallerDistrict(authed, teamStaffIds))) {
        res.status(403).json({ error: "One or more team members are not in your district" });
        return;
      }
    }

    const [oldRow] = await db.select().from(eligibilityDeterminationsTable).where(eq(eligibilityDeterminationsTable.id, id));
    const [row] = await db.update(eligibilityDeterminationsTable)
      .set(updates)
      .where(eq(eligibilityDeterminationsTable.id, id))
      .returning();
    if (!row) { res.status(404).json({ error: "Eligibility determination not found" }); return; }

    logAudit(req, { action: "update", targetTable: "eligibility_determinations", targetId: id, studentId: row.studentId, summary: `Updated eligibility determination #${id}` });
    const districtId = getEnforcedDistrictId(authed);
    if (districtId) {
      const oldVals = oldRow ? (Object.fromEntries(Object.keys(updates).map(k => [k, (oldRow as Record<string, unknown>)[k]]))) : null;
      createAutoVersion({
        documentType: "eligibility_determination",
        documentId: id,
        studentId: row.studentId,
        districtId,
        authorUserId: authed.userId || "system",
        authorName: authed.displayName || "System",
        title: `Eligibility Determination #${id} updated`,
        oldValues: oldVals,
        newValues: updates as Record<string, unknown>,
      });
    }
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (err) {
    console.error("PATCH /evaluations/eligibility error:", err);
    res.status(500).json({ error: "Failed to update eligibility determination" });
  }
});

router.get("/evaluations/student/:studentId/re-eval-status", evalAccess, async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const rows = await db.select()
      .from(eligibilityDeterminationsTable)
      .where(and(
        isNull(eligibilityDeterminationsTable.deletedAt),
        eq(eligibilityDeterminationsTable.studentId, studentId),
        eq(eligibilityDeterminationsTable.eligible, true),
      ))
      .orderBy(desc(eligibilityDeterminationsTable.meetingDate))
      .limit(1);

    if (rows.length === 0) {
      res.json({ hasEligibility: false, reEvalStatus: null });
      return;
    }

    const latest = rows[0];
    const reEvalDaysLeft = latest.nextReEvalDate ? daysUntil(latest.nextReEvalDate) : null;
    let reEvalUrgency: "ok" | "upcoming" | "overdue" = "ok";
    if (reEvalDaysLeft !== null) {
      if (reEvalDaysLeft < 0) reEvalUrgency = "overdue";
      else if (reEvalDaysLeft <= 90) reEvalUrgency = "upcoming";
    }

    res.json({
      hasEligibility: true,
      reEvalStatus: {
        determinationId: latest.id,
        meetingDate: latest.meetingDate,
        primaryDisability: latest.primaryDisability,
        nextReEvalDate: latest.nextReEvalDate,
        reEvalCycleMonths: latest.reEvalCycleMonths,
        daysUntilReEval: reEvalDaysLeft,
        urgency: reEvalUrgency,
      },
    });
  } catch (err) {
    console.error("GET /evaluations/student/:studentId/re-eval-status error:", err);
    res.status(500).json({ error: "Failed to get re-eval status" });
  }
});

router.get("/evaluations/dashboard", evalAccess, async (_req, res): Promise<void> => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysOut = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const ninetyDaysOut = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

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
        lte(eligibilityDeterminationsTable.nextReEvalDate, ninetyDaysOut)
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

    const upcomingReEvalList = await db.select({
      determination: eligibilityDeterminationsTable,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
    }).from(eligibilityDeterminationsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, eligibilityDeterminationsTable.studentId))
      .where(and(
        isNull(eligibilityDeterminationsTable.deletedAt),
        lte(eligibilityDeterminationsTable.nextReEvalDate, ninetyDaysOut),
        eq(eligibilityDeterminationsTable.eligible, true),
      ))
      .orderBy(asc(eligibilityDeterminationsTable.nextReEvalDate))
      .limit(10);

    const activeTimelineRule = TIMELINE_RULES[DEFAULT_RULE_KEY];

    res.json({
      openReferrals: openReferrals.count,
      pendingConsent: pendingConsent.count,
      overdueEvaluations: overdueEvals.count,
      activeEvaluations: activeEvals.count,
      upcomingReEvaluations: upcomingReEvals.count,
      overdueReEvaluations: overdueReEvals.count,
      timelineRule: {
        key: DEFAULT_RULE_KEY,
        label: activeTimelineRule.label,
        schoolDays: activeTimelineRule.schoolDays,
      },
      overdueReferralDeadlines: overdueReferralDeadlines.map(r => ({
        id: r.referral.id,
        studentName: r.studentFirstName ? `${r.studentFirstName} ${r.studentLastName}` : "—",
        deadline: r.referral.evaluationDeadline,
        daysOverdue: -daysUntil(r.referral.evaluationDeadline!),
        status: r.referral.status,
      })),
      upcomingReEvalList: upcomingReEvalList.map(r => ({
        id: r.determination.id,
        studentName: r.studentFirstName ? `${r.studentFirstName} ${r.studentLastName}` : "—",
        nextReEvalDate: r.determination.nextReEvalDate,
        daysUntilReEval: r.determination.nextReEvalDate ? daysUntil(r.determination.nextReEvalDate) : null,
        primaryDisability: r.determination.primaryDisability,
      })),
    });
  } catch (err) {
    console.error("GET /evaluations/dashboard error:", err);
    res.status(500).json({ error: "Failed to generate evaluations dashboard" });
  }
});

router.get("/evaluations/timeline-risk", evalAccess, async (_req, res): Promise<void> => {
  try {
    const rows = await db.select({
      referral: evaluationReferralsTable,
      studentId: studentsTable.id,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
    }).from(evaluationReferralsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, evaluationReferralsTable.studentId))
      .where(and(
        isNull(evaluationReferralsTable.deletedAt),
        sql`${evaluationReferralsTable.consentReceivedDate} is not null`,
        or(
          eq(evaluationReferralsTable.status, "open"),
          eq(evaluationReferralsTable.status, "evaluation_in_progress"),
        ),
        sql`${evaluationReferralsTable.consentReceivedDate}::date <= current_date - interval '50 days'`,
      ))
      .orderBy(asc(evaluationReferralsTable.consentReceivedDate));

    const DEADLINE_DAYS = 60;

    const result = rows.map(r => {
      const consentDate = r.referral.consentReceivedDate!;
      const consentMs = new Date(consentDate + "T12:00:00").getTime();
      const nowMs = Date.now();
      const daysElapsed = Math.floor((nowMs - consentMs) / (1000 * 60 * 60 * 24));
      const daysRemaining = DEADLINE_DAYS - daysElapsed;
      const isOverdue = daysElapsed > DEADLINE_DAYS;
      return {
        referralId: r.referral.id,
        studentId: r.studentId,
        studentName: r.studentFirstName ? `${r.studentFirstName} ${r.studentLastName}` : "—",
        consentDate,
        daysElapsed,
        daysRemaining,
        isOverdue,
      };
    });

    res.json({ students: result, deadlineDays: DEADLINE_DAYS });
  } catch (err) {
    console.error("GET /evaluations/timeline-risk error:", err);
    res.status(500).json({ error: "Failed to load evaluation timeline risk data" });
  }
});

export default router;
