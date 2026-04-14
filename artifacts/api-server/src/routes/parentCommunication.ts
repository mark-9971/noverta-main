import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  parentContactsTable,
  studentsTable,
  alertsTable,
  schoolsTable,
  iepGoalsTable,
  behaviorTargetsTable,
  behaviorDataTable,
  programTargetsTable,
  programDataTable,
  dataSessionsTable,
  shareLinksTable,
} from "@workspace/db";
import { eq, and, desc, gte, lte, sql, asc, or, isNull } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";
import crypto from "crypto";

const router: IRouter = Router();

function formatContactResponse(c: any) {
  return {
    id: c.id,
    studentId: c.studentId,
    contactType: c.contactType,
    contactDate: c.contactDate,
    contactMethod: c.contactMethod,
    subject: c.subject,
    notes: c.notes ?? null,
    outcome: c.outcome ?? null,
    followUpNeeded: c.followUpNeeded ?? null,
    followUpDate: c.followUpDate ?? null,
    contactedBy: c.contactedBy ?? null,
    parentName: c.parentName ?? null,
    notificationRequired: c.notificationRequired ?? false,
    relatedAlertId: c.relatedAlertId ?? null,
    studentName: c.studentFirst ? `${c.studentFirst} ${c.studentLast}` : null,
    studentGrade: c.studentGrade ?? null,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
  };
}

router.get("/parent-contacts", async (req, res): Promise<void> => {
  try {
    const { studentId, startDate, endDate, followUpStatus, contactType, schoolId } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (studentId) conditions.push(eq(parentContactsTable.studentId, Number(studentId)));
    if (startDate) conditions.push(gte(parentContactsTable.contactDate, startDate));
    if (endDate) conditions.push(lte(parentContactsTable.contactDate, endDate));
    if (contactType) conditions.push(eq(parentContactsTable.contactType, contactType));
    if (followUpStatus === "overdue") {
      const today = new Date().toISOString().substring(0, 10);
      conditions.push(eq(parentContactsTable.followUpNeeded, "yes"));
      conditions.push(sql`${parentContactsTable.followUpDate} < ${today}`);
      conditions.push(
        or(
          isNull(parentContactsTable.outcome),
          sql`${parentContactsTable.outcome} = ''`
        )
      );
    } else if (followUpStatus === "pending") {
      conditions.push(eq(parentContactsTable.followUpNeeded, "yes"));
    } else if (followUpStatus === "completed") {
      conditions.push(eq(parentContactsTable.followUpNeeded, "yes"));
      conditions.push(sql`${parentContactsTable.outcome} IS NOT NULL AND ${parentContactsTable.outcome} != ''`);
    }

    if (schoolId) {
      conditions.push(
        sql`${parentContactsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${Number(schoolId)})`
      );
    }

    const contacts = await db
      .select({
        id: parentContactsTable.id,
        studentId: parentContactsTable.studentId,
        contactType: parentContactsTable.contactType,
        contactDate: parentContactsTable.contactDate,
        contactMethod: parentContactsTable.contactMethod,
        subject: parentContactsTable.subject,
        notes: parentContactsTable.notes,
        outcome: parentContactsTable.outcome,
        followUpNeeded: parentContactsTable.followUpNeeded,
        followUpDate: parentContactsTable.followUpDate,
        contactedBy: parentContactsTable.contactedBy,
        parentName: parentContactsTable.parentName,
        notificationRequired: parentContactsTable.notificationRequired,
        relatedAlertId: parentContactsTable.relatedAlertId,
        createdAt: parentContactsTable.createdAt,
        updatedAt: parentContactsTable.updatedAt,
        studentFirst: studentsTable.firstName,
        studentLast: studentsTable.lastName,
        studentGrade: studentsTable.grade,
      })
      .from(parentContactsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, parentContactsTable.studentId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(parentContactsTable.contactDate))
      .limit(200);

    res.json(contacts.map(c => formatContactResponse(c)));
  } catch (e: any) {
    console.error("GET /parent-contacts error:", e);
    res.status(500).json({ error: "Failed to fetch parent contacts" });
  }
});

router.post("/parent-contacts", async (req, res): Promise<void> => {
  try {
    const { studentId, contactType, contactDate, contactMethod, subject, notes, outcome,
      followUpNeeded, followUpDate, contactedBy, parentName, notificationRequired, relatedAlertId } = req.body;

    if (!studentId || !contactType || !contactDate || !contactMethod || !subject) {
      res.status(400).json({ error: "studentId, contactType, contactDate, contactMethod, and subject are required" });
      return;
    }

    const [contact] = await db.insert(parentContactsTable).values({
      studentId: Number(studentId),
      contactType,
      contactDate,
      contactMethod,
      subject,
      notes: notes || null,
      outcome: outcome || null,
      followUpNeeded: followUpNeeded || null,
      followUpDate: followUpDate || null,
      contactedBy: contactedBy || null,
      parentName: parentName || null,
      notificationRequired: notificationRequired ?? false,
      relatedAlertId: relatedAlertId ? Number(relatedAlertId) : null,
    }).returning();

    res.status(201).json({
      ...contact,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    });
  } catch (e: any) {
    console.error("POST /parent-contacts error:", e);
    res.status(500).json({ error: "Failed to create parent contact" });
  }
});

router.patch("/parent-contacts/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const allowedFields = [
      "contactType", "contactDate", "contactMethod", "subject", "notes", "outcome",
      "followUpNeeded", "followUpDate", "contactedBy", "parentName",
      "notificationRequired", "relatedAlertId",
    ];
    const updates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const [updated] = await db.update(parentContactsTable)
      .set(updates)
      .where(eq(parentContactsTable.id, id))
      .returning();

    if (!updated) { res.status(404).json({ error: "Contact not found" }); return; }

    res.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e: any) {
    console.error("PATCH /parent-contacts error:", e);
    res.status(500).json({ error: "Failed to update parent contact" });
  }
});

router.delete("/parent-contacts/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [deleted] = await db.delete(parentContactsTable).where(eq(parentContactsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Contact not found" }); return; }
    res.json({ success: true });
  } catch (e: any) {
    console.error("DELETE /parent-contacts error:", e);
    res.status(500).json({ error: "Failed to delete parent contact" });
  }
});

router.get("/parent-contacts/overdue-followups", async (req, res): Promise<void> => {
  try {
    const today = new Date().toISOString().substring(0, 10);
    const { schoolId } = req.query as Record<string, string>;
    const conditions: any[] = [
      eq(parentContactsTable.followUpNeeded, "yes"),
      sql`${parentContactsTable.followUpDate} < ${today}`,
      or(
        isNull(parentContactsTable.outcome),
        sql`${parentContactsTable.outcome} = ''`
      ),
    ];
    if (schoolId) {
      conditions.push(eq(studentsTable.schoolId, Number(schoolId)));
    }

    const overdue = await db
      .select({
        id: parentContactsTable.id,
        studentId: parentContactsTable.studentId,
        contactType: parentContactsTable.contactType,
        contactDate: parentContactsTable.contactDate,
        contactMethod: parentContactsTable.contactMethod,
        subject: parentContactsTable.subject,
        notes: parentContactsTable.notes,
        outcome: parentContactsTable.outcome,
        followUpNeeded: parentContactsTable.followUpNeeded,
        followUpDate: parentContactsTable.followUpDate,
        contactedBy: parentContactsTable.contactedBy,
        parentName: parentContactsTable.parentName,
        notificationRequired: parentContactsTable.notificationRequired,
        relatedAlertId: parentContactsTable.relatedAlertId,
        createdAt: parentContactsTable.createdAt,
        updatedAt: parentContactsTable.updatedAt,
        studentFirst: studentsTable.firstName,
        studentLast: studentsTable.lastName,
        studentGrade: studentsTable.grade,
      })
      .from(parentContactsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, parentContactsTable.studentId))
      .where(and(...conditions))
      .orderBy(asc(parentContactsTable.followUpDate));

    res.json(overdue.map(c => formatContactResponse(c)));
  } catch (e: any) {
    console.error("GET overdue-followups error:", e);
    res.status(500).json({ error: "Failed to fetch overdue follow-ups" });
  }
});

router.get("/parent-contacts/notification-needed", async (req, res): Promise<void> => {
  try {
    const { schoolId } = req.query as Record<string, string>;
    const alertConditions: any[] = [
      eq(alertsTable.resolved, false),
      sql`${alertsTable.type} IN ('behind_on_minutes', 'missed_sessions', 'projected_shortfall')`,
      sql`${alertsTable.studentId} IS NOT NULL`,
    ];
    if (schoolId) {
      alertConditions.push(eq(studentsTable.schoolId, Number(schoolId)));
    }

    const unresolvedAlerts = await db
      .select({
        alertId: alertsTable.id,
        alertType: alertsTable.type,
        alertSeverity: alertsTable.severity,
        studentId: alertsTable.studentId,
        message: alertsTable.message,
        createdAt: alertsTable.createdAt,
        studentFirst: studentsTable.firstName,
        studentLast: studentsTable.lastName,
      })
      .from(alertsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, alertsTable.studentId))
      .where(and(...alertConditions))
      .orderBy(desc(alertsTable.createdAt));

    const alertStudentIds = [...new Set(unresolvedAlerts.map(a => a.studentId).filter(Boolean))];

    const recentContacts = alertStudentIds.length > 0
      ? await db
          .select({
            studentId: parentContactsTable.studentId,
            relatedAlertId: parentContactsTable.relatedAlertId,
            contactDate: parentContactsTable.contactDate,
            contactMethod: parentContactsTable.contactMethod,
          })
          .from(parentContactsTable)
          .where(
            and(
              sql`${parentContactsTable.studentId} IN (${sql.join(alertStudentIds.map(id => sql`${id}`), sql`, `)})`,
              eq(parentContactsTable.notificationRequired, true)
            )
          )
      : [];

    const completedContacts = recentContacts.filter(c => c.contactMethod !== "pending");
    const contactedAlertIds = new Set(completedContacts.filter(c => c.relatedAlertId).map(c => c.relatedAlertId));
    const contactedStudentDates = new Map<number, string>();
    for (const c of completedContacts) {
      if (c.studentId) {
        const existing = contactedStudentDates.get(c.studentId);
        if (!existing || c.contactDate > existing) {
          contactedStudentDates.set(c.studentId, c.contactDate);
        }
      }
    }

    const result = unresolvedAlerts.map(a => ({
      alertId: a.alertId,
      alertType: a.alertType,
      severity: a.alertSeverity,
      studentId: a.studentId,
      studentName: a.studentFirst ? `${a.studentFirst} ${a.studentLast}` : null,
      message: a.message,
      alertDate: a.createdAt.toISOString(),
      parentNotified: contactedAlertIds.has(a.alertId),
      lastContactDate: a.studentId ? contactedStudentDates.get(a.studentId) ?? null : null,
    }));

    res.json(result);
  } catch (e: any) {
    console.error("GET notification-needed error:", e);
    res.status(500).json({ error: "Failed to fetch notification needs" });
  }
});

async function generateProgressSummary(studentId: number, days: number) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString().substring(0, 10);

  const [student] = await db
    .select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
      schoolId: studentsTable.schoolId,
      schoolName: schoolsTable.name,
    })
    .from(studentsTable)
    .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .where(eq(studentsTable.id, studentId));

  if (!student) return null;

  const goals = await db
    .select()
    .from(iepGoalsTable)
    .where(and(eq(iepGoalsTable.studentId, studentId), eq(iepGoalsTable.active, true)))
    .orderBy(asc(iepGoalsTable.goalArea), asc(iepGoalsTable.goalNumber));

  const minuteProgress = await computeAllActiveMinuteProgress({ studentId });

  const behaviorTargets = await db.select().from(behaviorTargetsTable)
    .where(and(eq(behaviorTargetsTable.studentId, studentId), eq(behaviorTargetsTable.active, true)));

  const programTargets = await db.select().from(programTargetsTable)
    .where(and(eq(programTargetsTable.studentId, studentId), eq(programTargetsTable.active, true)));

  const btIds = behaviorTargets.map(b => b.id);
  const behaviorTrends = btIds.length > 0
    ? await db
        .select({
          behaviorTargetId: behaviorDataTable.behaviorTargetId,
          value: behaviorDataTable.value,
          sessionDate: dataSessionsTable.sessionDate,
        })
        .from(behaviorDataTable)
        .innerJoin(dataSessionsTable, eq(dataSessionsTable.id, behaviorDataTable.dataSessionId))
        .where(
          and(
            sql`${behaviorDataTable.behaviorTargetId} IN (${sql.join(btIds.map(id => sql`${id}`), sql`, `)})`,
            gte(dataSessionsTable.sessionDate, cutoff)
          )
        )
        .orderBy(asc(dataSessionsTable.sessionDate))
    : [];

  const ptIds = programTargets.map(p => p.id);
  const programTrends = ptIds.length > 0
    ? await db
        .select({
          programTargetId: programDataTable.programTargetId,
          percentCorrect: programDataTable.percentCorrect,
          sessionDate: dataSessionsTable.sessionDate,
        })
        .from(programDataTable)
        .innerJoin(dataSessionsTable, eq(dataSessionsTable.id, programDataTable.dataSessionId))
        .where(
          and(
            sql`${programDataTable.programTargetId} IN (${sql.join(ptIds.map(id => sql`${id}`), sql`, `)})`,
            gte(dataSessionsTable.sessionDate, cutoff)
          )
        )
        .orderBy(asc(dataSessionsTable.sessionDate))
    : [];

  const behaviorSummaries = behaviorTargets.map(bt => {
    const data = behaviorTrends.filter(d => d.behaviorTargetId === bt.id);
    const values = data.map(d => parseFloat(d.value || "0"));
    const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
    const recent = values.slice(-5);
    const recentAvg = recent.length > 0 ? recent.reduce((s, v) => s + v, 0) / recent.length : null;
    return {
      targetName: bt.name,
      measurementType: bt.measurementType,
      targetDirection: bt.targetDirection,
      baselineValue: bt.baselineValue,
      goalValue: bt.goalValue,
      dataPoints: values.length,
      average: avg !== null ? Math.round(avg * 100) / 100 : null,
      recentAverage: recentAvg !== null ? Math.round(recentAvg * 100) / 100 : null,
      trend: getTrend(values),
    };
  });

  const programSummaries = programTargets.map(pt => {
    const data = programTrends.filter(d => d.programTargetId === pt.id);
    const values = data.map(d => parseFloat(d.percentCorrect || "0"));
    const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
    const recent = values.slice(-5);
    const recentAvg = recent.length > 0 ? recent.reduce((s, v) => s + v, 0) / recent.length : null;
    return {
      targetName: pt.name,
      currentPromptLevel: pt.currentPromptLevel,
      masteryCriterion: pt.masteryCriterionPercent,
      dataPoints: values.length,
      averagePercent: avg !== null ? Math.round(avg * 100) / 100 : null,
      recentAveragePercent: recentAvg !== null ? Math.round(recentAvg * 100) / 100 : null,
      trend: getTrend(values),
    };
  });

  const goalSummaries = goals.map(g => ({
    id: g.id,
    goalArea: g.goalArea,
    goalNumber: g.goalNumber,
    annualGoal: g.annualGoal,
    baseline: g.baseline,
    targetCriterion: g.targetCriterion,
    measurementMethod: g.measurementMethod,
    status: g.status,
  }));

  const serviceDelivery = minuteProgress.map((p: any) => ({
    serviceType: p.serviceTypeName,
    requiredMinutes: p.requiredMinutes,
    deliveredMinutes: p.deliveredMinutes,
    remainingMinutes: p.remainingMinutes,
    percentComplete: p.percentComplete,
    riskStatus: p.riskStatus,
    intervalType: p.intervalType,
  }));

  return {
    student: {
      id: student.id,
      name: `${student.firstName} ${student.lastName}`,
      grade: student.grade,
      school: student.schoolName,
    },
    reportPeriod: { days, startDate: cutoff, endDate: new Date().toISOString().substring(0, 10) },
    generatedAt: new Date().toISOString(),
    goals: goalSummaries,
    serviceDelivery,
    behaviorData: behaviorSummaries,
    programData: programSummaries,
  };
}

router.get("/students/:studentId/progress-summary", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

    const days = parseInt(req.query.days as string) || 30;
    const summary = await generateProgressSummary(studentId, days);

    if (!summary) { res.status(404).json({ error: "Student not found" }); return; }
    res.json(summary);
  } catch (e: any) {
    console.error("GET progress-summary error:", e);
    res.status(500).json({ error: "Failed to generate progress summary" });
  }
});

router.post("/students/:studentId/progress-summary/share-link", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

    const days = parseInt(req.body.days as string) || 30;
    const expiresInHours = parseInt(req.body.expiresInHours as string) || 72;

    const summary = await generateProgressSummary(studentId, days);
    if (!summary) { res.status(404).json({ error: "Student not found" }); return; }

    const token = crypto.randomBytes(24).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    await db.insert(shareLinksTable).values({
      tokenHash,
      studentId,
      summary: JSON.stringify(summary),
      expiresAt,
    });

    res.status(201).json({
      token,
      expiresAt: expiresAt.toISOString(),
      url: `/api/shared/progress/${token}`,
    });
  } catch (e: any) {
    console.error("POST share-link error:", e);
    res.status(500).json({ error: "Failed to generate share link" });
  }
});

router.get("/shared/progress/:token", async (req, res): Promise<void> => {
  try {
    const { token } = req.params;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const [entry] = await db
      .select()
      .from(shareLinksTable)
      .where(eq(shareLinksTable.tokenHash, tokenHash))
      .limit(1);

    if (!entry) {
      res.status(404).json({ error: "Link not found or expired" });
      return;
    }

    if (new Date() > entry.expiresAt) {
      await db.delete(shareLinksTable).where(eq(shareLinksTable.id, entry.id));
      res.status(410).json({ error: "This link has expired" });
      return;
    }

    res.json(JSON.parse(entry.summary));
  } catch (e: any) {
    console.error("GET shared progress error:", e);
    res.status(500).json({ error: "Failed to fetch shared progress" });
  }
});

function getTrend(values: number[]): string {
  if (values.length < 4) return "insufficient_data";
  const mid = Math.floor(values.length / 2);
  const earlier = values.slice(0, mid);
  const recent = values.slice(mid);
  const earlierAvg = earlier.reduce((s, v) => s + v, 0) / earlier.length;
  const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
  const diff = recentAvg - earlierAvg;
  if (Math.abs(diff) < 0.5) return "stable";
  return diff > 0 ? "increasing" : "decreasing";
}

export default router;
