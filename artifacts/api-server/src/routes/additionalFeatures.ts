import { Router } from "express";
import {
  db,
  parentContactsTable,
  studentsTable,
  iepGoalsTable,
  iepAccommodationsTable,
  iepDocumentsTable,
  serviceRequirementsTable,
  serviceTypesTable,
  staffAssignmentsTable,
  sessionLogsTable,
} from "@workspace/db";
import { eq, and, desc, asc, ilike, or, sql } from "drizzle-orm";

const router = Router();

router.get("/students/:studentId/parent-contacts", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }
    const contacts = await db.select().from(parentContactsTable)
      .where(eq(parentContactsTable.studentId, studentId))
      .orderBy(desc(parentContactsTable.contactDate));
    res.json(contacts.map(c => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })));
  } catch (e: any) {
    console.error("GET parent-contacts error:", e);
    res.status(500).json({ error: "Failed to fetch parent contacts" });
  }
});

router.post("/students/:studentId/parent-contacts", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }
    const { contactType, contactDate, contactMethod, subject, notes, outcome, followUpNeeded, followUpDate, contactedBy, parentName } = req.body;
    if (!contactType || !contactDate || !contactMethod || !subject) {
      res.status(400).json({ error: "contactType, contactDate, contactMethod, and subject are required" });
      return;
    }
    const [contact] = await db.insert(parentContactsTable).values({
      studentId, contactType, contactDate, contactMethod, subject,
      notes: notes || null, outcome: outcome || null,
      followUpNeeded: followUpNeeded || null, followUpDate: followUpDate || null,
      contactedBy: contactedBy || null, parentName: parentName || null,
    }).returning();
    res.status(201).json({ ...contact, createdAt: contact.createdAt.toISOString(), updatedAt: contact.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("POST parent-contacts error:", e);
    res.status(500).json({ error: "Failed to create parent contact" });
  }
});

router.patch("/parent-contacts/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid contact ID" }); return; }
    const allowedFields = ["contactType", "contactDate", "contactMethod", "subject", "notes", "outcome", "followUpNeeded", "followUpDate", "contactedBy", "parentName"];
    const updates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid fields to update" }); return; }
    const [updated] = await db.update(parentContactsTable)
      .set(updates)
      .where(eq(parentContactsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Contact not found" }); return; }
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("PATCH parent-contacts error:", e);
    res.status(500).json({ error: "Failed to update parent contact" });
  }
});

router.delete("/parent-contacts/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid contact ID" }); return; }
    const [deleted] = await db.delete(parentContactsTable).where(eq(parentContactsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Contact not found" }); return; }
    res.json({ success: true });
  } catch (e: any) {
    console.error("DELETE parent-contacts error:", e);
    res.status(500).json({ error: "Failed to delete parent contact" });
  }
});

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
      duration: parseInt(duration),
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
