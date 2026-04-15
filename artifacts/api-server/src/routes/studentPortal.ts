import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  iepGoalsTable,
  sessionLogsTable,
  sessionGoalDataTable,
  scheduleBlocksTable,
  serviceTypesTable,
  staffTable,
  studentCheckInsTable,
  studentWinsTable,
  studentsTable,
} from "@workspace/db";
import { eq, and, desc, sql, gte, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getPublicMeta } from "../lib/clerkClaims";

const router: IRouter = Router();

function getStudentIdFromRequest(req: Request): number | null {
  const meta = getPublicMeta(req);
  if (meta.role === "sped_student" && meta.studentId) {
    return meta.studentId;
  }
  const idParam = req.query.studentId || req.params.studentId;
  if (idParam) return Number(idParam);
  return null;
}

router.get("/student-portal/goals", async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getStudentIdFromRequest(req);
    if (!studentId) {
      res.status(400).json({ error: "Student ID required" });
      return;
    }

    const goals = await db.select({
      id: iepGoalsTable.id,
      goalArea: iepGoalsTable.goalArea,
      goalNumber: iepGoalsTable.goalNumber,
      annualGoal: iepGoalsTable.annualGoal,
      baseline: iepGoalsTable.baseline,
      targetCriterion: iepGoalsTable.targetCriterion,
      measurementMethod: iepGoalsTable.measurementMethod,
      serviceArea: iepGoalsTable.serviceArea,
      status: iepGoalsTable.status,
      startDate: iepGoalsTable.startDate,
      endDate: iepGoalsTable.endDate,
      benchmarks: iepGoalsTable.benchmarks,
    })
      .from(iepGoalsTable)
      .where(and(eq(iepGoalsTable.studentId, studentId), eq(iepGoalsTable.active, true)))
      .orderBy(iepGoalsTable.goalArea, iepGoalsTable.goalNumber);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    const goalDataRows = await db.select({
      iepGoalId: sessionGoalDataTable.iepGoalId,
      notes: sessionGoalDataTable.notes,
      sessionDate: sessionLogsTable.sessionDate,
    })
      .from(sessionGoalDataTable)
      .innerJoin(sessionLogsTable, eq(sessionLogsTable.id, sessionGoalDataTable.sessionLogId))
      .where(
        and(
          eq(sessionLogsTable.studentId, studentId),
          gte(sessionLogsTable.sessionDate, thirtyDaysAgoStr),
        ),
      )
      .orderBy(desc(sessionLogsTable.sessionDate));

    const goalDataMap = new Map<number, { sessionCount: number; latestNote: string | null; latestDate: string | null }>();
    for (const row of goalDataRows) {
      const existing = goalDataMap.get(row.iepGoalId);
      if (!existing) {
        goalDataMap.set(row.iepGoalId, {
          sessionCount: 1,
          latestNote: row.notes,
          latestDate: row.sessionDate,
        });
      } else {
        existing.sessionCount++;
      }
    }

    const enriched = goals.map((g) => {
      const data = goalDataMap.get(g.id);
      return {
        ...g,
        recentSessionCount: data?.sessionCount ?? 0,
        latestNote: data?.latestNote ?? null,
        latestSessionDate: data?.latestDate ?? null,
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error("Error fetching student portal goals:", err);
    res.status(500).json({ error: "Failed to fetch goals" });
  }
});

router.get("/student-portal/check-ins", async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getStudentIdFromRequest(req);
    if (!studentId) {
      res.status(400).json({ error: "Student ID required" });
      return;
    }

    const limit = Math.min(Number(req.query.limit) || 30, 100);

    const checkIns = await db.select()
      .from(studentCheckInsTable)
      .where(eq(studentCheckInsTable.studentId, studentId))
      .orderBy(desc(studentCheckInsTable.createdAt))
      .limit(limit);

    res.json(checkIns);
  } catch (err) {
    console.error("Error fetching check-ins:", err);
    res.status(500).json({ error: "Failed to fetch check-ins" });
  }
});

router.post("/student-portal/check-ins", async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getStudentIdFromRequest(req);
    if (!studentId) {
      res.status(400).json({ error: "Student ID required" });
      return;
    }

    const { checkInType, value, label, note, goalId } = req.body;

    if (value === undefined || value === null) {
      res.status(400).json({ error: "Value is required" });
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    const [checkIn] = await db.insert(studentCheckInsTable).values({
      studentId,
      goalId: goalId || null,
      checkInType: checkInType || "mood",
      value: Number(value),
      label: label || null,
      note: note || null,
      checkInDate: today,
    }).returning();

    res.json(checkIn);
  } catch (err) {
    console.error("Error creating check-in:", err);
    res.status(500).json({ error: "Failed to create check-in" });
  }
});

router.get("/student-portal/wins", async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getStudentIdFromRequest(req);
    if (!studentId) {
      res.status(400).json({ error: "Student ID required" });
      return;
    }

    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const wins = await db.select({
      id: studentWinsTable.id,
      type: studentWinsTable.type,
      title: studentWinsTable.title,
      message: studentWinsTable.message,
      goalArea: studentWinsTable.goalArea,
      staffFirstName: staffTable.firstName,
      staffLastName: staffTable.lastName,
      createdAt: studentWinsTable.createdAt,
    })
      .from(studentWinsTable)
      .leftJoin(staffTable, eq(staffTable.id, studentWinsTable.staffId))
      .where(eq(studentWinsTable.studentId, studentId))
      .orderBy(desc(studentWinsTable.createdAt))
      .limit(limit);

    res.json(wins);
  } catch (err) {
    console.error("Error fetching wins:", err);
    res.status(500).json({ error: "Failed to fetch wins" });
  }
});

router.post("/student-portal/wins", async (req: Request, res: Response): Promise<void> => {
  try {
    const { studentId, title, message, goalArea, type } = req.body;

    if (!studentId || !title) {
      res.status(400).json({ error: "studentId and title are required" });
      return;
    }

    const meta = getPublicMeta(req);
    const staffId = meta.staffId || null;

    const [win] = await db.insert(studentWinsTable).values({
      studentId: Number(studentId),
      staffId,
      type: type || "encouragement",
      title,
      message: message || null,
      goalArea: goalArea || null,
    }).returning();

    res.json(win);
  } catch (err) {
    console.error("Error creating win:", err);
    res.status(500).json({ error: "Failed to create win" });
  }
});

router.get("/student-portal/schedule", async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getStudentIdFromRequest(req);
    if (!studentId) {
      res.status(400).json({ error: "Student ID required" });
      return;
    }

    const schedule = await db.select({
      id: scheduleBlocksTable.id,
      dayOfWeek: scheduleBlocksTable.dayOfWeek,
      startTime: scheduleBlocksTable.startTime,
      endTime: scheduleBlocksTable.endTime,
      location: scheduleBlocksTable.location,
      blockLabel: scheduleBlocksTable.blockLabel,
      staffFirstName: staffTable.firstName,
      staffLastName: staffTable.lastName,
      serviceTypeName: serviceTypesTable.name,
    })
      .from(scheduleBlocksTable)
      .leftJoin(staffTable, eq(staffTable.id, scheduleBlocksTable.staffId))
      .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, scheduleBlocksTable.serviceTypeId))
      .where(
        and(
          eq(scheduleBlocksTable.studentId, studentId),
          isNull(scheduleBlocksTable.deletedAt),
          eq(scheduleBlocksTable.isRecurring, true),
        ),
      )
      .orderBy(
        sql`CASE ${scheduleBlocksTable.dayOfWeek}
          WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
          WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 ELSE 6 END`,
        scheduleBlocksTable.startTime,
      );

    res.json(schedule);
  } catch (err) {
    console.error("Error fetching schedule:", err);
    res.status(500).json({ error: "Failed to fetch schedule" });
  }
});

router.get("/student-portal/streak", async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getStudentIdFromRequest(req);
    if (!studentId) {
      res.status(400).json({ error: "Student ID required" });
      return;
    }

    const recentCheckIns = await db.select({
      checkInDate: studentCheckInsTable.checkInDate,
    })
      .from(studentCheckInsTable)
      .where(eq(studentCheckInsTable.studentId, studentId))
      .orderBy(desc(studentCheckInsTable.checkInDate))
      .limit(90);

    const uniqueDates = [...new Set(recentCheckIns.map(c => c.checkInDate))].sort().reverse();
    let streak = 0;
    const today = new Date();

    for (let i = 0; i < uniqueDates.length; i++) {
      const expected = new Date(today);
      expected.setDate(expected.getDate() - i);
      const expectedStr = expected.toISOString().split("T")[0];

      if (uniqueDates[i] === expectedStr) {
        streak++;
      } else {
        break;
      }
    }

    const totalCheckIns = await db.select({
      count: sql<number>`count(*)`,
    })
      .from(studentCheckInsTable)
      .where(eq(studentCheckInsTable.studentId, studentId));

    res.json({
      currentStreak: streak,
      totalCheckIns: totalCheckIns[0]?.count ?? 0,
    });
  } catch (err) {
    console.error("Error fetching streak:", err);
    res.status(500).json({ error: "Failed to fetch streak" });
  }
});

export default router;
