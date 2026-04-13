import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  classesTable, classEnrollmentsTable, studentsTable, staffTable,
  assignmentsTable, submissionsTable, gradeCategoriesTable, announcementsTable
} from "@workspace/db";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/classes", async (req, res): Promise<void> => {
  const { teacherId, schoolId } = req.query;
  const conditions: any[] = [eq(classesTable.active, true)];
  if (teacherId) conditions.push(eq(classesTable.teacherId, Number(teacherId)));
  if (schoolId) conditions.push(eq(classesTable.schoolId, Number(schoolId)));

  const classes = await db.select({
    id: classesTable.id,
    name: classesTable.name,
    subject: classesTable.subject,
    courseCode: classesTable.courseCode,
    gradeLevel: classesTable.gradeLevel,
    period: classesTable.period,
    room: classesTable.room,
    semester: classesTable.semester,
    teacherId: classesTable.teacherId,
    teacherFirstName: staffTable.firstName,
    teacherLastName: staffTable.lastName,
    description: classesTable.description,
    active: classesTable.active,
    studentCount: sql<number>`(SELECT COUNT(*) FROM class_enrollments WHERE class_id = ${classesTable.id} AND status = 'active')`.as("studentCount"),
  }).from(classesTable)
    .leftJoin(staffTable, eq(classesTable.teacherId, staffTable.id))
    .where(and(...conditions))
    .orderBy(classesTable.period, classesTable.name);

  res.json(classes);
});

router.get("/students-with-enrollments", async (_req, res): Promise<void> => {
  const students = await db.selectDistinct({
    id: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
    grade: studentsTable.grade,
    hasIep: sql<boolean>`${studentsTable.disabilityCategory} IS NOT NULL`.as("hasIep"),
  }).from(classEnrollmentsTable)
    .innerJoin(studentsTable, eq(classEnrollmentsTable.studentId, studentsTable.id))
    .where(eq(classEnrollmentsTable.status, "active"))
    .orderBy(studentsTable.lastName, studentsTable.firstName);

  res.json(students);
});

router.get("/teachers-with-classes", async (_req, res): Promise<void> => {
  const teachers = await db.selectDistinct({
    id: staffTable.id,
    firstName: staffTable.firstName,
    lastName: staffTable.lastName,
    title: staffTable.title,
    role: staffTable.role,
  }).from(classesTable)
    .innerJoin(staffTable, eq(classesTable.teacherId, staffTable.id))
    .where(eq(classesTable.active, true))
    .orderBy(staffTable.lastName, staffTable.firstName);

  res.json(teachers);
});

router.get("/classes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [cls] = await db.select({
    id: classesTable.id,
    name: classesTable.name,
    subject: classesTable.subject,
    courseCode: classesTable.courseCode,
    gradeLevel: classesTable.gradeLevel,
    period: classesTable.period,
    room: classesTable.room,
    semester: classesTable.semester,
    teacherId: classesTable.teacherId,
    teacherFirstName: staffTable.firstName,
    teacherLastName: staffTable.lastName,
    description: classesTable.description,
    active: classesTable.active,
  }).from(classesTable)
    .leftJoin(staffTable, eq(classesTable.teacherId, staffTable.id))
    .where(eq(classesTable.id, id));
  if (!cls) { res.status(404).json({ error: "Class not found" }); return; }
  res.json(cls);
});

router.post("/classes", async (req, res): Promise<void> => {
  const { name, subject, courseCode, gradeLevel, period, room, semester, teacherId, schoolId, description } = req.body;
  const [cls] = await db.insert(classesTable).values({
    name, subject, courseCode, gradeLevel, period, room,
    semester: semester || "2025-2026",
    teacherId: Number(teacherId), schoolId: schoolId ? Number(schoolId) : null,
    description,
  }).returning();
  res.status(201).json(cls);
});

router.put("/classes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { name, subject, courseCode, gradeLevel, period, room, teacherId, description, active } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (subject !== undefined) updates.subject = subject;
  if (courseCode !== undefined) updates.courseCode = courseCode;
  if (gradeLevel !== undefined) updates.gradeLevel = gradeLevel;
  if (period !== undefined) updates.period = period;
  if (room !== undefined) updates.room = room;
  if (teacherId !== undefined) updates.teacherId = Number(teacherId);
  if (description !== undefined) updates.description = description;
  if (active !== undefined) updates.active = active;
  const [cls] = await db.update(classesTable).set(updates).where(eq(classesTable.id, id)).returning();
  if (!cls) { res.status(404).json({ error: "Class not found" }); return; }
  res.json(cls);
});

router.get("/classes/:id/roster", async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  const roster = await db.select({
    enrollmentId: classEnrollmentsTable.id,
    studentId: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
    grade: studentsTable.grade,
    status: classEnrollmentsTable.status,
    hasIep: sql<boolean>`${studentsTable.disabilityCategory} IS NOT NULL`.as("hasIep"),
  }).from(classEnrollmentsTable)
    .innerJoin(studentsTable, eq(classEnrollmentsTable.studentId, studentsTable.id))
    .where(eq(classEnrollmentsTable.classId, classId))
    .orderBy(studentsTable.lastName, studentsTable.firstName);
  res.json(roster);
});

router.post("/classes/:id/enroll", async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  const { studentId } = req.body;
  try {
    const [enrollment] = await db.insert(classEnrollmentsTable).values({
      classId, studentId: Number(studentId), status: "active",
      enrolledDate: new Date().toISOString().split("T")[0],
    }).returning();
    res.status(201).json(enrollment);
  } catch (e: any) {
    if (e.code === "23505") { res.status(409).json({ error: "Student already enrolled" }); return; }
    throw e;
  }
});

router.delete("/classes/:classId/enroll/:studentId", async (req, res): Promise<void> => {
  const classId = Number(req.params.classId);
  const studentId = Number(req.params.studentId);
  await db.delete(classEnrollmentsTable).where(
    and(eq(classEnrollmentsTable.classId, classId), eq(classEnrollmentsTable.studentId, studentId))
  );
  res.json({ success: true });
});

router.get("/classes/:id/categories", async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  const categories = await db.select().from(gradeCategoriesTable)
    .where(eq(gradeCategoriesTable.classId, classId))
    .orderBy(gradeCategoriesTable.sortOrder);
  res.json(categories);
});

router.post("/classes/:id/categories", async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  const { name, weight, sortOrder } = req.body;
  const [cat] = await db.insert(gradeCategoriesTable).values({
    classId, name, weight: String(weight || 1), sortOrder: sortOrder || 0,
  }).returning();
  res.status(201).json(cat);
});

router.get("/classes/:id/announcements", async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  const anns = await db.select({
    id: announcementsTable.id,
    title: announcementsTable.title,
    content: announcementsTable.content,
    authorFirstName: staffTable.firstName,
    authorLastName: staffTable.lastName,
    createdAt: announcementsTable.createdAt,
  }).from(announcementsTable)
    .leftJoin(staffTable, eq(announcementsTable.authorId, staffTable.id))
    .where(eq(announcementsTable.classId, classId))
    .orderBy(desc(announcementsTable.createdAt));
  res.json(anns);
});

router.post("/classes/:id/announcements", async (req, res): Promise<void> => {
  const classId = Number(req.params.id);
  const { title, content, authorId } = req.body;
  const [ann] = await db.insert(announcementsTable).values({
    classId, title, content, authorId: Number(authorId), scope: "class",
  }).returning();
  res.status(201).json(ann);
});

router.get("/students/:id/classes", async (req, res): Promise<void> => {
  const studentId = Number(req.params.id);
  const classes = await db.select({
    enrollmentId: classEnrollmentsTable.id,
    classId: classesTable.id,
    className: classesTable.name,
    subject: classesTable.subject,
    courseCode: classesTable.courseCode,
    gradeLevel: classesTable.gradeLevel,
    period: classesTable.period,
    room: classesTable.room,
    teacherFirstName: staffTable.firstName,
    teacherLastName: staffTable.lastName,
    enrollmentStatus: classEnrollmentsTable.status,
  }).from(classEnrollmentsTable)
    .innerJoin(classesTable, eq(classEnrollmentsTable.classId, classesTable.id))
    .leftJoin(staffTable, eq(classesTable.teacherId, staffTable.id))
    .where(and(eq(classEnrollmentsTable.studentId, studentId), eq(classEnrollmentsTable.status, "active")))
    .orderBy(classesTable.period);
  res.json(classes);
});

export default router;
