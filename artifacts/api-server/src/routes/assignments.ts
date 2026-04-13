import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  assignmentsTable, submissionsTable, classesTable, studentsTable,
  gradeCategoriesTable, classEnrollmentsTable, staffTable
} from "@workspace/db";
import { eq, and, desc, asc, sql, inArray, isNull, isNotNull, lt, gte } from "drizzle-orm";

const router: IRouter = Router();

router.get("/classes/:id/assignments", async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  const assignments = await db.select({
    id: assignmentsTable.id,
    classId: assignmentsTable.classId,
    categoryId: assignmentsTable.categoryId,
    categoryName: gradeCategoriesTable.name,
    title: assignmentsTable.title,
    description: assignmentsTable.description,
    assignmentType: assignmentsTable.assignmentType,
    dueDate: assignmentsTable.dueDate,
    assignedDate: assignmentsTable.assignedDate,
    pointsPossible: assignmentsTable.pointsPossible,
    published: assignmentsTable.published,
    allowLateSubmission: assignmentsTable.allowLateSubmission,
    submissionCount: sql<number>`(SELECT COUNT(*) FROM submissions WHERE assignment_id = ${assignmentsTable.id} AND status != 'not_submitted')`.as("submissionCount"),
    gradedCount: sql<number>`(SELECT COUNT(*) FROM submissions WHERE assignment_id = ${assignmentsTable.id} AND points_earned IS NOT NULL)`.as("gradedCount"),
    avgScore: sql<number>`(SELECT ROUND(AVG(CAST(points_earned AS numeric) / NULLIF(CAST(${assignmentsTable.pointsPossible} AS numeric), 0) * 100), 1) FROM submissions WHERE assignment_id = ${assignmentsTable.id} AND points_earned IS NOT NULL)`.as("avgScore"),
    createdAt: assignmentsTable.createdAt,
  }).from(assignmentsTable)
    .leftJoin(gradeCategoriesTable, eq(assignmentsTable.categoryId, gradeCategoriesTable.id))
    .where(eq(assignmentsTable.classId, classId))
    .orderBy(desc(assignmentsTable.dueDate));
  res.json(assignments);
});

router.get("/assignments/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [assignment] = await db.select({
    id: assignmentsTable.id,
    classId: assignmentsTable.classId,
    className: classesTable.name,
    categoryId: assignmentsTable.categoryId,
    categoryName: gradeCategoriesTable.name,
    title: assignmentsTable.title,
    description: assignmentsTable.description,
    instructions: assignmentsTable.instructions,
    assignmentType: assignmentsTable.assignmentType,
    dueDate: assignmentsTable.dueDate,
    assignedDate: assignmentsTable.assignedDate,
    pointsPossible: assignmentsTable.pointsPossible,
    published: assignmentsTable.published,
    allowLateSubmission: assignmentsTable.allowLateSubmission,
    createdAt: assignmentsTable.createdAt,
  }).from(assignmentsTable)
    .leftJoin(classesTable, eq(assignmentsTable.classId, classesTable.id))
    .leftJoin(gradeCategoriesTable, eq(assignmentsTable.categoryId, gradeCategoriesTable.id))
    .where(eq(assignmentsTable.id, id));
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }
  res.json(assignment);
});

router.post("/classes/:id/assignments", async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  const { title, description, instructions, assignmentType, dueDate, assignedDate, pointsPossible, categoryId, published, allowLateSubmission } = req.body;
  const [assignment] = await db.insert(assignmentsTable).values({
    classId, title, description, instructions,
    assignmentType: assignmentType || "homework",
    dueDate, assignedDate,
    pointsPossible: String(pointsPossible || 100),
    categoryId: categoryId ? Number(categoryId) : null,
    published: published !== false,
    allowLateSubmission: allowLateSubmission !== false,
  }).returning();

  const enrolled = await db.select({ studentId: classEnrollmentsTable.studentId })
    .from(classEnrollmentsTable)
    .where(and(eq(classEnrollmentsTable.classId, classId), eq(classEnrollmentsTable.status, "active")));
  if (enrolled.length > 0) {
    await db.insert(submissionsTable).values(
      enrolled.map(e => ({
        assignmentId: assignment.id,
        studentId: e.studentId,
        status: "not_submitted",
      }))
    );
  }

  res.status(201).json(assignment);
});

router.put("/assignments/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { title, description, instructions, assignmentType, dueDate, assignedDate, pointsPossible, categoryId, published, allowLateSubmission } = req.body;
  const updates: any = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (instructions !== undefined) updates.instructions = instructions;
  if (assignmentType !== undefined) updates.assignmentType = assignmentType;
  if (dueDate !== undefined) updates.dueDate = dueDate;
  if (assignedDate !== undefined) updates.assignedDate = assignedDate;
  if (pointsPossible !== undefined) updates.pointsPossible = String(pointsPossible);
  if (categoryId !== undefined) updates.categoryId = categoryId ? Number(categoryId) : null;
  if (published !== undefined) updates.published = published;
  if (allowLateSubmission !== undefined) updates.allowLateSubmission = allowLateSubmission;
  const [assignment] = await db.update(assignmentsTable).set(updates).where(eq(assignmentsTable.id, id)).returning();
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }
  res.json(assignment);
});

router.delete("/assignments/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(submissionsTable).where(eq(submissionsTable.assignmentId, id));
  await db.delete(assignmentsTable).where(eq(assignmentsTable.id, id));
  res.json({ success: true });
});

router.get("/assignments/:id/submissions", async (req, res): Promise<void> => {
  const assignmentId = Number(req.params.id);
  const subs = await db.select({
    id: submissionsTable.id,
    assignmentId: submissionsTable.assignmentId,
    studentId: submissionsTable.studentId,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
    status: submissionsTable.status,
    submittedAt: submissionsTable.submittedAt,
    pointsEarned: submissionsTable.pointsEarned,
    letterGrade: submissionsTable.letterGrade,
    feedback: submissionsTable.feedback,
    gradedAt: submissionsTable.gradedAt,
  }).from(submissionsTable)
    .innerJoin(studentsTable, eq(submissionsTable.studentId, studentsTable.id))
    .where(eq(submissionsTable.assignmentId, assignmentId))
    .orderBy(studentsTable.lastName, studentsTable.firstName);
  res.json(subs);
});

router.get("/students/:id/assignments", async (req, res): Promise<void> => {
  const studentId = Number(req.params.id);
  const { classId, status } = req.query;
  const conditions = [eq(submissionsTable.studentId, studentId)];
  if (classId) conditions.push(eq(assignmentsTable.classId, Number(classId)));
  if (status) conditions.push(eq(submissionsTable.status, String(status)));

  const assignments = await db.select({
    submissionId: submissionsTable.id,
    assignmentId: assignmentsTable.id,
    classId: assignmentsTable.classId,
    className: classesTable.name,
    subject: classesTable.subject,
    title: assignmentsTable.title,
    description: assignmentsTable.description,
    assignmentType: assignmentsTable.assignmentType,
    dueDate: assignmentsTable.dueDate,
    pointsPossible: assignmentsTable.pointsPossible,
    status: submissionsTable.status,
    submittedAt: submissionsTable.submittedAt,
    pointsEarned: submissionsTable.pointsEarned,
    letterGrade: submissionsTable.letterGrade,
    feedback: submissionsTable.feedback,
  }).from(submissionsTable)
    .innerJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
    .innerJoin(classesTable, eq(assignmentsTable.classId, classesTable.id))
    .where(and(...conditions))
    .orderBy(desc(assignmentsTable.dueDate));
  res.json(assignments);
});

router.put("/submissions/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { content, fileUrl, fileName, status, pointsEarned, letterGrade, feedback, gradedBy } = req.body;
  const updates: any = {};
  if (content !== undefined) updates.content = content;
  if (fileUrl !== undefined) updates.fileUrl = fileUrl;
  if (fileName !== undefined) updates.fileName = fileName;
  if (status !== undefined) updates.status = status;
  if (pointsEarned !== undefined) updates.pointsEarned = String(pointsEarned);
  if (letterGrade !== undefined) updates.letterGrade = letterGrade;
  if (feedback !== undefined) updates.feedback = feedback;
  if (gradedBy !== undefined) updates.gradedBy = Number(gradedBy);
  if (status === "submitted") updates.submittedAt = new Date();
  if (pointsEarned !== undefined) updates.gradedAt = new Date();
  const [sub] = await db.update(submissionsTable).set(updates).where(eq(submissionsTable.id, id)).returning();
  if (!sub) { res.status(404).json({ error: "Submission not found" }); return; }
  res.json(sub);
});

router.put("/submissions/:id/grade", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { pointsEarned, letterGrade, feedback, gradedBy } = req.body;
  const [sub] = await db.update(submissionsTable).set({
    pointsEarned: String(pointsEarned),
    letterGrade,
    feedback,
    gradedBy: gradedBy ? Number(gradedBy) : null,
    gradedAt: new Date(),
    status: "graded",
  }).where(eq(submissionsTable.id, id)).returning();
  if (!sub) { res.status(404).json({ error: "Submission not found" }); return; }
  res.json(sub);
});

router.get("/students/:id/grades-summary", async (req, res): Promise<void> => {
  const studentId = Number(req.params.id);

  const enrolledClasses = await db.select({
    classId: classEnrollmentsTable.classId,
    className: classesTable.name,
    subject: classesTable.subject,
    teacherFirstName: staffTable.firstName,
    teacherLastName: staffTable.lastName,
  }).from(classEnrollmentsTable)
    .innerJoin(classesTable, eq(classEnrollmentsTable.classId, classesTable.id))
    .leftJoin(staffTable, eq(classesTable.teacherId, staffTable.id))
    .where(and(eq(classEnrollmentsTable.studentId, studentId), eq(classEnrollmentsTable.status, "active")));

  const classGrades = [];
  let totalPoints = 0, earnedPoints = 0, gradedCount = 0;
  for (const cls of enrolledClasses) {
    const subs = await db.select({
      pointsEarned: submissionsTable.pointsEarned,
      pointsPossible: assignmentsTable.pointsPossible,
      status: submissionsTable.status,
    }).from(submissionsTable)
      .innerJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
      .where(and(
        eq(submissionsTable.studentId, studentId),
        eq(assignmentsTable.classId, cls.classId),
        isNotNull(submissionsTable.pointsEarned)
      ));

    let classEarned = 0, classPossible = 0;
    for (const s of subs) {
      const earned = parseFloat(s.pointsEarned || "0");
      const possible = parseFloat(s.pointsPossible || "100");
      classEarned += earned;
      classPossible += possible;
      earnedPoints += earned;
      totalPoints += possible;
      gradedCount++;
    }
    const pct = classPossible > 0 ? (classEarned / classPossible) * 100 : null;
    classGrades.push({
      ...cls,
      percentage: pct !== null ? Math.round(pct * 10) / 10 : null,
      letterGrade: pct !== null ? pctToLetter(pct) : null,
      gradedAssignments: subs.length,
    });
  }

  const overallPct = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : null;
  res.json({
    classes: classGrades,
    overall: {
      percentage: overallPct !== null ? Math.round(overallPct * 10) / 10 : null,
      letterGrade: overallPct !== null ? pctToLetter(overallPct) : null,
      gpa: overallPct !== null ? pctToGpa(overallPct) : null,
      totalGradedAssignments: gradedCount,
    },
  });
});

router.get("/classes/:id/gradebook", async (req, res): Promise<void> => {
  const classId = Number(req.params.id);

  const assignments = await db.select({
    id: assignmentsTable.id,
    title: assignmentsTable.title,
    assignmentType: assignmentsTable.assignmentType,
    dueDate: assignmentsTable.dueDate,
    pointsPossible: assignmentsTable.pointsPossible,
    categoryId: assignmentsTable.categoryId,
    categoryName: gradeCategoriesTable.name,
  }).from(assignmentsTable)
    .leftJoin(gradeCategoriesTable, eq(assignmentsTable.categoryId, gradeCategoriesTable.id))
    .where(and(eq(assignmentsTable.classId, classId), eq(assignmentsTable.published, true)))
    .orderBy(assignmentsTable.dueDate);

  const roster = await db.select({
    studentId: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
    hasIep: sql<boolean>`${studentsTable.disabilityCategory} IS NOT NULL`.as("hasIep"),
  }).from(classEnrollmentsTable)
    .innerJoin(studentsTable, eq(classEnrollmentsTable.studentId, studentsTable.id))
    .where(and(eq(classEnrollmentsTable.classId, classId), eq(classEnrollmentsTable.status, "active")))
    .orderBy(studentsTable.lastName, studentsTable.firstName);

  const allSubs = await db.select({
    assignmentId: submissionsTable.assignmentId,
    studentId: submissionsTable.studentId,
    id: submissionsTable.id,
    pointsEarned: submissionsTable.pointsEarned,
    letterGrade: submissionsTable.letterGrade,
    status: submissionsTable.status,
  }).from(submissionsTable)
    .where(eq(sql`(SELECT class_id FROM assignments WHERE id = ${submissionsTable.assignmentId})`, classId));

  const subMap: Record<string, any> = {};
  for (const s of allSubs) {
    subMap[`${s.studentId}-${s.assignmentId}`] = s;
  }

  const students = roster.map(student => {
    let totalEarned = 0, totalPossible = 0;
    const grades: Record<number, any> = {};
    for (const a of assignments) {
      const sub = subMap[`${student.studentId}-${a.id}`];
      grades[a.id] = sub ? {
        submissionId: sub.id,
        pointsEarned: sub.pointsEarned,
        letterGrade: sub.letterGrade,
        status: sub.status,
      } : null;
      if (sub?.pointsEarned != null) {
        totalEarned += parseFloat(sub.pointsEarned);
        totalPossible += parseFloat(a.pointsPossible || "100");
      }
    }
    const pct = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : null;
    return {
      ...student,
      grades,
      overallPercentage: pct !== null ? Math.round(pct * 10) / 10 : null,
      overallLetterGrade: pct !== null ? pctToLetter(pct) : null,
    };
  });

  res.json({ assignments, students });
});

router.get("/teacher/:id/dashboard", async (req, res): Promise<void> => {
  const teacherId = Number(req.params.id);
  const classes = await db.select({
    id: classesTable.id,
    name: classesTable.name,
    subject: classesTable.subject,
    period: classesTable.period,
    room: classesTable.room,
    studentCount: sql<number>`(SELECT COUNT(*) FROM class_enrollments WHERE class_id = ${classesTable.id} AND status = 'active')`.as("studentCount"),
  }).from(classesTable)
    .where(and(eq(classesTable.teacherId, teacherId), eq(classesTable.active, true)))
    .orderBy(classesTable.period);

  const pendingSubs = await db.select({
    count: sql<number>`COUNT(*)`.as("count"),
  }).from(submissionsTable)
    .innerJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
    .innerJoin(classesTable, eq(assignmentsTable.classId, classesTable.id))
    .where(and(
      eq(classesTable.teacherId, teacherId),
      eq(submissionsTable.status, "submitted"),
    ));

  const recentSubmissions = await db.select({
    submissionId: submissionsTable.id,
    studentFirstName: studentsTable.firstName,
    studentLastName: studentsTable.lastName,
    assignmentTitle: assignmentsTable.title,
    className: classesTable.name,
    submittedAt: submissionsTable.submittedAt,
    status: submissionsTable.status,
  }).from(submissionsTable)
    .innerJoin(studentsTable, eq(submissionsTable.studentId, studentsTable.id))
    .innerJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
    .innerJoin(classesTable, eq(assignmentsTable.classId, classesTable.id))
    .where(and(
      eq(classesTable.teacherId, teacherId),
      eq(submissionsTable.status, "submitted"),
    ))
    .orderBy(desc(submissionsTable.submittedAt))
    .limit(10);

  res.json({
    classes,
    pendingGradingCount: pendingSubs[0]?.count || 0,
    recentSubmissions,
  });
});

router.get("/student/:id/dashboard", async (req, res): Promise<void> => {
  const studentId = Number(req.params.id);
  const today = new Date().toISOString().split("T")[0];

  const enrolledClasses = await db.select({
    classId: classesTable.id,
    className: classesTable.name,
    subject: classesTable.subject,
    period: classesTable.period,
    teacherFirstName: staffTable.firstName,
    teacherLastName: staffTable.lastName,
  }).from(classEnrollmentsTable)
    .innerJoin(classesTable, eq(classEnrollmentsTable.classId, classesTable.id))
    .leftJoin(staffTable, eq(classesTable.teacherId, staffTable.id))
    .where(and(eq(classEnrollmentsTable.studentId, studentId), eq(classEnrollmentsTable.status, "active")))
    .orderBy(classesTable.period);

  const upcomingAssignments = await db.select({
    assignmentId: assignmentsTable.id,
    title: assignmentsTable.title,
    dueDate: assignmentsTable.dueDate,
    pointsPossible: assignmentsTable.pointsPossible,
    className: classesTable.name,
    subject: classesTable.subject,
    status: submissionsTable.status,
  }).from(submissionsTable)
    .innerJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
    .innerJoin(classesTable, eq(assignmentsTable.classId, classesTable.id))
    .where(and(
      eq(submissionsTable.studentId, studentId),
      gte(assignmentsTable.dueDate, today),
    ))
    .orderBy(asc(assignmentsTable.dueDate))
    .limit(10);

  const recentGrades = await db.select({
    assignmentTitle: assignmentsTable.title,
    className: classesTable.name,
    pointsEarned: submissionsTable.pointsEarned,
    pointsPossible: assignmentsTable.pointsPossible,
    letterGrade: submissionsTable.letterGrade,
    gradedAt: submissionsTable.gradedAt,
  }).from(submissionsTable)
    .innerJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
    .innerJoin(classesTable, eq(assignmentsTable.classId, classesTable.id))
    .where(and(
      eq(submissionsTable.studentId, studentId),
      isNotNull(submissionsTable.pointsEarned),
    ))
    .orderBy(desc(submissionsTable.gradedAt))
    .limit(10);

  res.json({ enrolledClasses, upcomingAssignments, recentGrades });
});

router.get("/academics/overview", async (_req, res): Promise<void> => {
  const classStats = await db.select({
    classId: classesTable.id,
    className: classesTable.name,
    subject: classesTable.subject,
    teacherFirstName: staffTable.firstName,
    teacherLastName: staffTable.lastName,
  }).from(classesTable)
    .leftJoin(staffTable, eq(classesTable.teacherId, staffTable.id))
    .where(eq(classesTable.active, true));

  const allSubs = await db.select({
    studentId: submissionsTable.studentId,
    assignmentClassId: assignmentsTable.classId,
    pointsEarned: submissionsTable.pointsEarned,
    pointsPossible: assignmentsTable.pointsPossible,
    status: submissionsTable.status,
  }).from(submissionsTable)
    .innerJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
    .where(isNotNull(submissionsTable.pointsEarned));

  const studentClassGrades: Record<string, { earned: number; possible: number }> = {};
  for (const s of allSubs) {
    const key = `${s.studentId}-${s.assignmentClassId}`;
    if (!studentClassGrades[key]) studentClassGrades[key] = { earned: 0, possible: 0 };
    studentClassGrades[key].earned += parseFloat(s.pointsEarned || "0");
    studentClassGrades[key].possible += parseFloat(s.pointsPossible || "100");
  }

  const classAvgs: Record<number, { total: number; count: number; failing: number }> = {};
  const studentOverall: Record<number, { earned: number; possible: number }> = {};
  let totalFailing = 0;
  const failingStudentIds = new Set<number>();

  for (const [key, g] of Object.entries(studentClassGrades)) {
    const [sid, cid] = key.split("-").map(Number);
    const pct = g.possible > 0 ? (g.earned / g.possible) * 100 : 0;
    if (!classAvgs[cid]) classAvgs[cid] = { total: 0, count: 0, failing: 0 };
    classAvgs[cid].total += pct;
    classAvgs[cid].count++;
    if (pct < 60) {
      classAvgs[cid].failing++;
      failingStudentIds.add(sid);
    }
    if (!studentOverall[sid]) studentOverall[sid] = { earned: 0, possible: 0 };
    studentOverall[sid].earned += g.earned;
    studentOverall[sid].possible += g.possible;
  }

  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const [, g] of Object.entries(studentOverall)) {
    const pct = g.possible > 0 ? (g.earned / g.possible) * 100 : 0;
    const letter = pctToLetter(pct);
    if (letter.startsWith("A")) gradeDistribution.A++;
    else if (letter.startsWith("B")) gradeDistribution.B++;
    else if (letter.startsWith("C")) gradeDistribution.C++;
    else if (letter.startsWith("D")) gradeDistribution.D++;
    else gradeDistribution.F++;
  }

  const totalEnrollments = await db.select({
    count: sql<number>`count(*)`.as("count"),
  }).from(classEnrollmentsTable).where(eq(classEnrollmentsTable.status, "active"));

  const totalStudents = Object.keys(studentOverall).length;

  const classDetails = classStats.map(c => {
    const avg = classAvgs[c.classId];
    return {
      ...c,
      averageGrade: avg ? Math.round(avg.total / avg.count * 10) / 10 : null,
      letterGrade: avg ? pctToLetter(avg.total / avg.count) : null,
      studentCount: avg?.count || 0,
      failingCount: avg?.failing || 0,
    };
  }).sort((a, b) => (a.averageGrade || 0) - (b.averageGrade || 0));

  res.json({
    totalClasses: classStats.length,
    totalEnrollments: totalEnrollments[0]?.count || 0,
    totalStudents,
    failingStudents: failingStudentIds.size,
    gradeDistribution,
    classes: classDetails,
    schoolAverage: totalStudents > 0
      ? Math.round(Object.values(studentOverall).reduce((sum, g) => sum + (g.possible > 0 ? (g.earned / g.possible) * 100 : 0), 0) / totalStudents * 10) / 10
      : null,
  });
});

function pctToLetter(pct: number): string {
  if (pct >= 97) return "A+";
  if (pct >= 93) return "A";
  if (pct >= 90) return "A-";
  if (pct >= 87) return "B+";
  if (pct >= 83) return "B";
  if (pct >= 80) return "B-";
  if (pct >= 77) return "C+";
  if (pct >= 73) return "C";
  if (pct >= 70) return "C-";
  if (pct >= 67) return "D+";
  if (pct >= 63) return "D";
  if (pct >= 60) return "D-";
  return "F";
}

function pctToGpa(pct: number): number {
  if (pct >= 97) return 4.0;
  if (pct >= 93) return 4.0;
  if (pct >= 90) return 3.7;
  if (pct >= 87) return 3.3;
  if (pct >= 83) return 3.0;
  if (pct >= 80) return 2.7;
  if (pct >= 77) return 2.3;
  if (pct >= 73) return 2.0;
  if (pct >= 70) return 1.7;
  if (pct >= 67) return 1.3;
  if (pct >= 63) return 1.0;
  if (pct >= 60) return 0.7;
  return 0.0;
}

export default router;
