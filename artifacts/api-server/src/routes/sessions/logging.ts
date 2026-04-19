import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import {
  sessionLogsTable, serviceTypesTable, staffTable, studentsTable,
  missedReasonsTable, iepGoalsTable,
  dataSessionsTable, programDataTable, behaviorDataTable,
  programTargetsTable, behaviorTargetsTable,
  compensatoryObligationsTable,
  sessionGoalDataTable,
  guardiansTable, schoolsTable,
} from "@workspace/db";
import { sendEmail, buildMissedServiceAlertEmail } from "../../lib/email";
import {
  CreateSessionBody,
  BulkCreateSessionsBody,
} from "@workspace/api-zod";
import { eq, and, gte, lte, desc, asc, sql, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { logAudit } from "../../lib/auditLog";
import { getActiveSchoolYearIdForStudent } from "../../lib/activeSchoolYear";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";
import { validateGoalData, type GoalEntry } from "./shared";

const router: IRouter = Router();

router.get("/missed-reasons", async (req, res): Promise<void> => {
  const reasons = await db.select().from(missedReasonsTable).orderBy(missedReasonsTable.label);
  res.json(reasons);
});

router.post("/missed-reasons", async (req, res): Promise<void> => {
  const { label, category } = req.body;
  if (!label || !category) {
    res.status(400).json({ error: "label and category required" });
    return;
  }
  const [reason] = await db.insert(missedReasonsTable).values({ label, category }).returning();
  res.status(201).json(reason);
});

router.post("/sessions/bulk", async (req, res): Promise<void> => {
  const parsed = BulkCreateSessionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Auto-assign active schoolYearId for any session that doesn't have one
  const sessions = parsed.data.sessions as Array<Record<string, unknown>>;

  // District ownership check: verify all student IDs belong to caller's district.
  {
    const enforcedDistrictId = getEnforcedDistrictId(req as unknown as AuthedRequest);
    if (enforcedDistrictId !== null) {
      const bulkStudentIds = [...new Set(sessions.map(s => s.studentId as number))];
      for (const sid of bulkStudentIds) {
        const rows = await db.execute(sql`
          SELECT 1 FROM students
          WHERE id = ${sid}
            AND school_id IN (SELECT id FROM schools WHERE district_id = ${enforcedDistrictId})
        `);
        if (!rows.rows.length) {
          res.status(403).json({ error: `Student ${sid} does not belong to your district` });
          return;
        }
      }
    }
  }

  const uniqueStudentIds = [...new Set(sessions.filter(s => !s.schoolYearId).map(s => s.studentId as number))];
  const yearIdByStudent = new Map<number, number>();
  await Promise.all(uniqueStudentIds.map(async (sid) => {
    const yearId = await getActiveSchoolYearIdForStudent(sid);
    if (yearId) yearIdByStudent.set(sid, yearId);
  }));
  const enriched = sessions.map(s => {
    if (!s.schoolYearId) {
      const yearId = yearIdByStudent.get(s.studentId as number);
      if (yearId) return { ...s, schoolYearId: yearId };
    }
    return s;
  });

  const inserted = await db.insert(sessionLogsTable).values(enriched as typeof parsed.data.sessions).returning();
  for (const s of inserted) {
    logAudit(req, {
      action: "create",
      targetTable: "session_logs",
      targetId: s.id,
      studentId: s.studentId,
      summary: `Bulk-created session #${s.id} for student #${s.studentId}`,
      newValues: { sessionDate: s.sessionDate, durationMinutes: s.durationMinutes, status: s.status } as Record<string, unknown>,
    });
  }
  res.status(201).json(inserted.map(s => ({ ...s, createdAt: s.createdAt.toISOString() })));
});

router.post("/sessions", async (req, res): Promise<void> => {
  try {
    const { goalData: rawGoalData, ...sessionFields } = req.body;
    // Default isMakeup to false so first-time API consumers don't get a wall
    // of zod errors for an obviously-defaultable boolean. Same default as the
    // DB column. Callers may still send true explicitly.
    if (sessionFields.isMakeup == null) sessionFields.isMakeup = false;
    const parsed = CreateSessionBody.safeParse(sessionFields);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const friendly = first ? `${first.path.join(".") || "body"}: ${first.message}` : parsed.error.message;
      res.status(400).json({ error: friendly, issues: parsed.error.issues });
      return;
    }

    if (parsed.data.isCompensatory && !parsed.data.compensatoryObligationId) {
      res.status(400).json({ error: "compensatoryObligationId is required when isCompensatory is true" });
      return;
    }

    // District ownership check: verify the student belongs to the caller's district.
    {
      const enforcedDistrictId = getEnforcedDistrictId(req as unknown as AuthedRequest);
      if (enforcedDistrictId !== null) {
        const rows = await db.execute(sql`
          SELECT 1 FROM students
          WHERE id = ${parsed.data.studentId}
            AND school_id IN (SELECT id FROM schools WHERE district_id = ${enforcedDistrictId})
        `);
        if (!rows.rows.length) {
          res.status(403).json({ error: "Student does not belong to your district" });
          return;
        }
      }
    }

    // Resolve active school year — schoolYearId is not in the zod schema so we merge it here
    const activeYearId = await getActiveSchoolYearIdForStudent(parsed.data.studentId);

    // If serviceTypeId was not sent but serviceRequirementId was, back-fill it
    // so the service column always shows in the sessions list.
    let resolvedServiceTypeId = parsed.data.serviceTypeId ?? null;
    if (resolvedServiceTypeId == null && parsed.data.serviceRequirementId) {
      const result = await db.execute(
        sql`SELECT service_type_id FROM service_requirements WHERE id = ${parsed.data.serviceRequirementId} LIMIT 1`
      );
      const row = result.rows[0] as { service_type_id: number | null } | undefined;
      resolvedServiceTypeId = row?.service_type_id ?? null;
    }

    const sessionInsert = { ...parsed.data, schoolYearId: activeYearId ?? null, serviceTypeId: resolvedServiceTypeId };

    let goalData: GoalEntry[] = [];
    if (rawGoalData && Array.isArray(rawGoalData) && rawGoalData.length > 0) {
      const goalParsed = validateGoalData(rawGoalData);
      if (!goalParsed.valid) {
        res.status(400).json({ error: "Invalid goalData: " + goalParsed.error });
        return;
      }
      goalData = goalParsed.data;
    }

    if (parsed.data.isCompensatory && parsed.data.compensatoryObligationId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const txDb = drizzle(client);

        const [obligation] = await txDb.select().from(compensatoryObligationsTable)
          .where(eq(compensatoryObligationsTable.id, parsed.data.compensatoryObligationId));
        if (!obligation) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Compensatory obligation not found" });
          return;
        }
        if (obligation.studentId !== parsed.data.studentId) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Obligation student does not match session student" });
          return;
        }
        if (obligation.status === "completed" || obligation.status === "waived") {
          await client.query("ROLLBACK");
          res.status(400).json({ error: `Cannot log sessions against a ${obligation.status} obligation` });
          return;
        }

        const [session] = await txDb.insert(sessionLogsTable).values(sessionInsert).returning();
        const completedStatus = parsed.data.status === "completed" || parsed.data.status === "makeup";
        if (completedStatus) {
          const newDelivered = obligation.minutesDelivered + parsed.data.durationMinutes;
          const newStatus = newDelivered >= obligation.minutesOwed ? "completed" : "in_progress";
          await txDb.update(compensatoryObligationsTable)
            .set({ minutesDelivered: newDelivered, status: newStatus })
            .where(eq(compensatoryObligationsTable.id, parsed.data.compensatoryObligationId));
        }

        await client.query("COMMIT");
        logAudit(req, {
          action: "create",
          targetTable: "session_logs",
          targetId: session.id,
          studentId: session.studentId,
          summary: `Logged compensatory session for student #${session.studentId} on ${session.sessionDate}`,
          newValues: { sessionDate: session.sessionDate, durationMinutes: session.durationMinutes, status: session.status } as Record<string, unknown>,
        });
        res.status(201).json({ ...session, createdAt: session.createdAt.toISOString() });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } else {
      const result = await db.transaction(async (tx) => {
        const [session] = await tx.insert(sessionLogsTable).values(sessionInsert).returning();

        if (goalData.length > 0) {
          const [dataSession] = await tx.insert(dataSessionsTable).values({
            studentId: session.studentId,
            staffId: session.staffId,
            sessionLogId: session.id,
            sessionDate: session.sessionDate,
            startTime: session.startTime,
            endTime: session.endTime,
            notes: session.notes,
          }).returning();

          for (const entry of goalData) {
            await tx.insert(sessionGoalDataTable).values({
              sessionLogId: session.id,
              iepGoalId: entry.iepGoalId,
              notes: entry.notes || null,
            });

            if (entry.behaviorData && entry.behaviorTargetId) {
              await tx.insert(behaviorDataTable).values({
                dataSessionId: dataSession.id,
                behaviorTargetId: entry.behaviorTargetId,
                value: String(entry.behaviorData.value),
                intervalCount: entry.behaviorData.intervalCount ?? null,
                intervalsWith: entry.behaviorData.intervalsWith ?? null,
                hourBlock: entry.behaviorData.hourBlock ?? null,
                notes: entry.behaviorData.notes ?? null,
              });
            }

            if (entry.programData && entry.programTargetId) {
              const trialsCorrect = entry.programData.trialsCorrect ?? 0;
              const trialsTotal = entry.programData.trialsTotal ?? 0;
              const pctCorrect = trialsTotal > 0 ? Math.round((trialsCorrect / trialsTotal) * 100) : 0;
              await tx.insert(programDataTable).values({
                dataSessionId: dataSession.id,
                programTargetId: entry.programTargetId,
                trialsCorrect,
                trialsTotal,
                prompted: entry.programData.prompted ?? 0,
                stepNumber: entry.programData.stepNumber ?? null,
                independenceLevel: entry.programData.independenceLevel ?? null,
                percentCorrect: String(pctCorrect),
                promptLevelUsed: entry.programData.promptLevelUsed ?? null,
                notes: entry.programData.notes ?? null,
              });
            }
          }
        }

        return session;
      });

      logAudit(req, {
        action: "create",
        targetTable: "session_logs",
        targetId: result.id,
        studentId: result.studentId,
        summary: `Logged session for student #${result.studentId} on ${result.sessionDate}`,
        newValues: { sessionDate: result.sessionDate, durationMinutes: result.durationMinutes, status: result.status } as Record<string, unknown>,
      });

      if (result.status === "missed" && result.studentId) {
        (async () => {
          try {
            const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, result.studentId));
            if (!student) return;
            const [guardian] = await db.select().from(guardiansTable)
              .where(eq(guardiansTable.studentId, student.id))
              .orderBy(asc(guardiansTable.contactPriority), asc(guardiansTable.id))
              .limit(1);
            const toEmail = guardian?.email ?? student.parentEmail ?? null;
            const toName = guardian?.name ?? student.parentGuardianName ?? null;
            if (!toEmail) return;

            const [school] = student.schoolId
              ? await db.select().from(schoolsTable).where(eq(schoolsTable.id, student.schoolId))
              : [null];
            const [svcType] = result.serviceTypeId
              ? await db.select().from(serviceTypesTable).where(eq(serviceTypesTable.id, result.serviceTypeId))
              : [null];

            const emailContent = buildMissedServiceAlertEmail({
              guardianName: toName ?? "Parent/Guardian",
              studentName: `${student.firstName} ${student.lastName}`,
              serviceType: svcType?.name ?? "Special Education Service",
              missedMinutes: result.durationMinutes ?? 0,
              requiredMinutes: result.durationMinutes ?? 0,
              schoolName: school?.name ?? "the school",
            });

            await sendEmail({
              studentId: student.id,
              type: "missed_service_alert",
              subject: emailContent.subject,
              bodyHtml: emailContent.html,
              bodyText: emailContent.text,
              toEmail,
              toName: toName ?? undefined,
              guardianId: guardian?.id,
              metadata: { sessionLogId: result.id, sessionDate: result.sessionDate, triggeredBy: "session_missed" },
            });
          } catch (emailErr) {
            console.error("Missed-session alert email error:", emailErr);
          }
        })();
      }

      res.status(201).json({ ...result, createdAt: result.createdAt.toISOString() });
    }
  } catch (e: unknown) {
    console.error("POST /sessions error:", e);
    res.status(500).json({ error: "Failed to create session" });
  }
});

export default router;
