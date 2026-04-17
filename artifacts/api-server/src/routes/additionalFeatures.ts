import { Router } from "express";
import {
// tenant-scope: district-join
  db,
  studentsTable,
  iepGoalsTable,
  iepAccommodationsTable,
  iepDocumentsTable,
  serviceRequirementsTable,
  serviceTypesTable,
  staffAssignmentsTable,
  sessionLogsTable,
  staffTable,
  alertsTable,
  schoolsTable,
  parentContactsTable,
} from "@workspace/db";
import { eq, and, desc, asc, ilike, or, sql } from "drizzle-orm";

const router = Router();

router.get("/search/iep", async (req, res): Promise<void> => {
  try {
    const q = (req.query.q as string || "").trim();
    const searchType = (req.query.type as string) || "all";
    if (!q || q.length < 2) {
      res.json({ goals: [], accommodations: [], students: [] });
      return;
    }
    const pattern = `%${q}%`;

    const results: any = { goals: [], accommodations: [], students: [] };

    if (searchType === "all" || searchType === "goals") {
      const goals = await db.select({
        goal: iepGoalsTable,
        student: { id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName, grade: studentsTable.grade },
      })
        .from(iepGoalsTable)
        .innerJoin(studentsTable, eq(iepGoalsTable.studentId, studentsTable.id))
        .where(or(
          ilike(iepGoalsTable.annualGoal, pattern),
          ilike(iepGoalsTable.goalArea, pattern),
        ))
        .limit(20);
      results.goals = goals.map(g => ({
        ...g.goal,
        studentName: `${g.student.firstName} ${g.student.lastName}`,
        studentId: g.student.id,
        grade: g.student.grade,
      }));
    }

    if (searchType === "all" || searchType === "accommodations") {
      const accs = await db.select({
        acc: iepAccommodationsTable,
        student: { id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName, grade: studentsTable.grade },
      })
        .from(iepAccommodationsTable)
        .innerJoin(studentsTable, eq(iepAccommodationsTable.studentId, studentsTable.id))
        .where(or(
          ilike(iepAccommodationsTable.description, pattern),
          ilike(iepAccommodationsTable.category, pattern),
        ))
        .limit(20);
      results.accommodations = accs.map(a => ({
        ...a.acc,
        studentName: `${a.student.firstName} ${a.student.lastName}`,
        studentId: a.student.id,
        grade: a.student.grade,
      }));
    }

    if (searchType === "all" || searchType === "students") {
      const students = await db.select().from(studentsTable)
        .where(or(
          ilike(studentsTable.firstName, pattern),
          ilike(studentsTable.lastName, pattern),
          ilike(studentsTable.disabilityCategory, pattern),
        ))
        .limit(20);
      results.students = students;
    }

    res.json(results);
  } catch (e: any) {
    console.error("GET search/iep error:", e);
    res.status(500).json({ error: "Failed to search IEP data" });
  }
});

// Unified site-wide search — role-scoped results
router.get("/search", async (req, res): Promise<void> => {
  try {
    const q = (req.query.q as string || "").trim();
    const role = (req.query.role as string) || "admin";
    if (!q || q.length < 2) {
      res.json({ students: [], staff: [], alerts: [], goals: [] });
      return;
    }
    const pattern = `%${q}%`;
    const LIMIT = 6;

    const [students, staff, alerts, goals] = await Promise.all([
      // Students — all roles (teachers/admins see all; scoping by real auth TBD)
      (role === "admin" || role === "sped_teacher")
        ? db.select({
            id: studentsTable.id,
            firstName: studentsTable.firstName,
            lastName: studentsTable.lastName,
            grade: studentsTable.grade,
            disabilityCategory: studentsTable.disabilityCategory,
            schoolName: schoolsTable.name,
          })
          .from(studentsTable)
          .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
          .where(and(
            eq(studentsTable.status, "active"),
            or(
              ilike(studentsTable.firstName, pattern),
              ilike(studentsTable.lastName, pattern),
              ilike(sql`${studentsTable.firstName} || ' ' || ${studentsTable.lastName}`, pattern),
              ilike(studentsTable.disabilityCategory, pattern),
            )
          ))
          .limit(LIMIT)
        : Promise.resolve([]),

      // Staff — admin only
      role === "admin"
        ? db.select({
            id: staffTable.id,
            firstName: staffTable.firstName,
            lastName: staffTable.lastName,
            role: staffTable.role,
            title: staffTable.title,
            schoolName: schoolsTable.name,
          })
          .from(staffTable)
          .leftJoin(schoolsTable, eq(schoolsTable.id, staffTable.schoolId))
          .where(and(
            eq(staffTable.status, "active"),
            or(
              ilike(staffTable.firstName, pattern),
              ilike(staffTable.lastName, pattern),
              ilike(sql`${staffTable.firstName} || ' ' || ${staffTable.lastName}`, pattern),
              ilike(staffTable.role, pattern),
              ilike(staffTable.title, pattern),
            )
          ))
          .limit(LIMIT)
        : Promise.resolve([]),

      // Alerts — admin and teacher (unresolved only)
      (role === "admin" || role === "sped_teacher")
        ? db.select({
            id: alertsTable.id,
            message: alertsTable.message,
            severity: alertsTable.severity,
            type: alertsTable.type,
            studentId: alertsTable.studentId,
            firstName: studentsTable.firstName,
            lastName: studentsTable.lastName,
          })
          .from(alertsTable)
          .leftJoin(studentsTable, eq(studentsTable.id, alertsTable.studentId))
          .where(and(
            eq(alertsTable.resolved, false),
            ilike(alertsTable.message, pattern),
          ))
          .orderBy(desc(alertsTable.createdAt))
          .limit(LIMIT)
        : Promise.resolve([]),

      // IEP Goals — all roles (student portal would be scoped by auth in future)
      db.select({
        id: iepGoalsTable.id,
        annualGoal: iepGoalsTable.annualGoal,
        goalArea: iepGoalsTable.goalArea,
        studentId: iepGoalsTable.studentId,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
      })
      .from(iepGoalsTable)
      .innerJoin(studentsTable, eq(iepGoalsTable.studentId, studentsTable.id))
      .where(or(
        ilike(iepGoalsTable.annualGoal, pattern),
        ilike(iepGoalsTable.goalArea, pattern),
      ))
      .limit(LIMIT),
    ]);

    res.json({
      students: students.map(s => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        subtitle: [s.grade ? `Grade ${s.grade}` : null, s.disabilityCategory, s.schoolName].filter(Boolean).join(" · "),
        href: `/students/${s.id}`,
      })),
      staff: (staff as any[]).map(s => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        subtitle: [s.title || s.role, s.schoolName].filter(Boolean).join(" · "),
        href: `/staff/${s.id}`,
      })),
      alerts: (alerts as any[]).map(a => ({
        id: a.id,
        name: a.message,
        subtitle: a.firstName ? `${a.firstName} ${a.lastName}` : a.type,
        severity: a.severity,
        studentId: a.studentId,
        href: `/alerts`,
      })),
      goals: goals.map(g => ({
        id: g.id,
        name: g.annualGoal,
        subtitle: [`${g.firstName} ${g.lastName}`, g.goalArea].filter(Boolean).join(" · "),
        href: `/students/${g.studentId}/iep`,
      })),
    });
  } catch (e: any) {
    console.error("GET /search error:", e);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/staff/:staffId/caseload-summary", async (req, res): Promise<void> => {
  try {
    const staffId = parseInt(req.params.staffId);
    if (isNaN(staffId)) { res.status(400).json({ error: "Invalid staff ID" }); return; }

    const assignments = await db.select({
      studentId: staffAssignmentsTable.studentId,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
    })
      .from(staffAssignmentsTable)
      .innerJoin(studentsTable, eq(staffAssignmentsTable.studentId, studentsTable.id))
      .where(eq(staffAssignmentsTable.staffId, staffId));

    if (assignments.length === 0) {
      res.json({ students: [], summary: { total: 0, iepsDueSoon: 0, overdueReviews: 0, activeIeps: 0 } });
      return;
    }

    const studentIds = assignments.map(a => a.studentId);
    const iepDocs = await db.select({
      studentId: iepDocumentsTable.studentId,
      iepStartDate: iepDocumentsTable.iepStartDate,
      iepEndDate: iepDocumentsTable.iepEndDate,
    })
      .from(iepDocumentsTable)
      .where(and(
        sql`${iepDocumentsTable.studentId} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`,
        eq(iepDocumentsTable.active, true),
      ));

    const iepByStudent = new Map<number, { iepStartDate: string | null; iepEndDate: string | null }>();
    for (const doc of iepDocs) {
      iepByStudent.set(doc.studentId, { iepStartDate: doc.iepStartDate, iepEndDate: doc.iepEndDate });
    }

    const today = new Date();
    const enriched = assignments.map(a => {
      const iep = iepByStudent.get(a.studentId);
      const endDate = iep?.iepEndDate ? new Date(iep.iepEndDate) : null;
      const daysUntilExpiry = endDate ? Math.ceil((endDate.getTime() - today.getTime()) / 86400000) : null;
      const iepStatus = !endDate ? "unknown" :
        daysUntilExpiry! < 0 ? "expired" :
        daysUntilExpiry! <= 30 ? "expiring_soon" : "active";
      return {
        id: a.studentId,
        firstName: a.firstName,
        lastName: a.lastName,
        grade: a.grade,
        iepStartDate: iep?.iepStartDate || null,
        iepEndDate: iep?.iepEndDate || null,
        daysUntilExpiry,
        iepStatus,
      };
    });

    const summary = {
      total: enriched.length,
      iepsDueSoon: enriched.filter(s => s.iepStatus === "expiring_soon").length,
      overdueReviews: enriched.filter(s => s.iepStatus === "expired").length,
      activeIeps: enriched.filter(s => s.iepStatus === "active").length,
    };

    res.json({ students: enriched, summary });
  } catch (e: any) {
    console.error("GET caseload-summary error:", e);
    res.status(500).json({ error: "Failed to fetch caseload summary" });
  }
});

router.get("/students/:studentId/iep-summary", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

    const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    if (!student) { res.status(404).json({ error: "Student not found" }); return; }

    const docs = await db.select().from(iepDocumentsTable)
      .where(eq(iepDocumentsTable.studentId, studentId))
      .orderBy(desc(iepDocumentsTable.createdAt));
    const activeDoc = docs.find(d => d.active) || docs[0] || null;

    const goals = await db.select().from(iepGoalsTable)
      .where(eq(iepGoalsTable.studentId, studentId))
      .orderBy(asc(iepGoalsTable.goalArea));

    const accs = await db.select().from(iepAccommodationsTable)
      .where(eq(iepAccommodationsTable.studentId, studentId));

    const services = await db.select({
      req: serviceRequirementsTable,
      serviceType: { name: serviceTypesTable.name },
    })
      .from(serviceRequirementsTable)
      .innerJoin(serviceTypesTable, eq(serviceRequirementsTable.serviceTypeId, serviceTypesTable.id))
      .where(eq(serviceRequirementsTable.studentId, studentId));

    const contacts = await db.select().from(parentContactsTable)
      .where(eq(parentContactsTable.studentId, studentId))
      .orderBy(desc(parentContactsTable.contactDate))
      .limit(5);

    res.json({
      student,
      activeDocument: activeDoc ? {
        ...activeDoc,
        createdAt: activeDoc.createdAt.toISOString(),
        updatedAt: activeDoc.updatedAt.toISOString(),
      } : null,
      goals,
      accommodations: accs,
      services: services.map(s => ({
        ...s.req,
        serviceTypeName: s.serviceType.name,
      })),
      recentContacts: contacts.map(c => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      documentCount: docs.length,
    });
  } catch (e: any) {
    console.error("GET iep-summary error:", e);
    res.status(500).json({ error: "Failed to fetch IEP summary" });
  }
});

router.post("/sessions/quick", async (req, res): Promise<void> => {
  try {
    const { studentId, serviceRequirementId, duration, date, notes, staffId, status } = req.body;
    if (!studentId || !serviceRequirementId || !duration || !date) {
      res.status(400).json({ error: "studentId, serviceRequirementId, duration, and date are required" });
      return;
    }

    const [req_] = await db.select({
      sr: serviceRequirementsTable,
      st: { name: serviceTypesTable.name },
    })
      .from(serviceRequirementsTable)
      .innerJoin(serviceTypesTable, eq(serviceRequirementsTable.serviceTypeId, serviceTypesTable.id))
      .where(eq(serviceRequirementsTable.id, serviceRequirementId));

    if (!req_) { res.status(404).json({ error: "Service requirement not found" }); return; }

    const [session] = await db.insert(sessionLogsTable).values({
      studentId,
      serviceRequirementId,
      staffId: staffId || null,
      sessionDate: date,
      durationMinutes: parseInt(duration),
      status: status || "completed",
      notes: notes || null,
    }).returning();

    res.status(201).json({
      ...session,
      serviceTypeName: req_.st.name,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });
  } catch (e: any) {
    console.error("POST sessions/quick error:", e);
    res.status(500).json({ error: "Failed to create quick session" });
  }
});

export default router;
