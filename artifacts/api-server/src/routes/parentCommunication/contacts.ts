import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sendEmail, buildOverdueFollowupEmail } from "../../lib/email";
import {
  parentContactsTable,
  studentsTable,
  alertsTable,
  schoolsTable,
} from "@workspace/db";
import { eq, and, desc, gte, lte, sql, asc, or, isNull } from "drizzle-orm";
import { resolveGuardianRecipients, formatContactResponse } from "./shared";

const router: IRouter = Router();

router.get("/parent-contacts", async (req, res): Promise<void> => {
  try {
    const { studentId, startDate, endDate, followUpStatus, contactType, schoolId,
      page: pageStr, limit: limitStr } = req.query as Record<string, string>;

    const page = parseInt(pageStr) || 1;
    const limit = Math.min(parseInt(limitStr) || 100, 500);
    const offset = (page - 1) * limit;

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
      conditions.push(
        or(
          isNull(parentContactsTable.outcome),
          sql`${parentContactsTable.outcome} = ''`
        )
      );
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
      .limit(limit)
      .offset(offset);

    res.json({ data: contacts.map(c => formatContactResponse(c)), page, limit });
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

    let resolvedParentName = parentName || null;
    if (!resolvedParentName) {
      const recipients = await resolveGuardianRecipients(Number(studentId));
      if (recipients.length > 0) resolvedParentName = recipients[0].name;
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
      parentName: resolvedParentName,
      notificationRequired: notificationRequired ?? false,
      relatedAlertId: relatedAlertId ? Number(relatedAlertId) : null,
    }).returning();

    if (contactMethod === "email") {
      const recipients = await resolveGuardianRecipients(Number(studentId));
      const emailRecipient = recipients.find(r => r.email);
      if (emailRecipient?.email) {
        const [student] = await db.select({ firstName: studentsTable.firstName, lastName: studentsTable.lastName, schoolId: studentsTable.schoolId })
          .from(studentsTable).where(eq(studentsTable.id, Number(studentId)));
        const studentName = student ? `${student.firstName} ${student.lastName}` : `Student #${studentId}`;

        const today = new Date().toISOString().substring(0, 10);
        if (followUpNeeded === "yes" && followUpDate && followUpDate < today) {
          const schoolRow = student?.schoolId
            ? await db.select({ name: schoolsTable.name }).from(schoolsTable).where(eq(schoolsTable.id, student.schoolId)).then(r => r[0] ?? null)
            : null;
          const emailContent = buildOverdueFollowupEmail({
            guardianName: emailRecipient.name,
            studentName,
            originalSubject: subject,
            originalContactDate: contactDate,
            followUpDate,
            staffName: contactedBy || "Your child's case manager",
            schoolName: schoolRow?.name ?? "the school",
          });
          await sendEmail({
            studentId: Number(studentId),
            type: "overdue_followup_reminder",
            subject: emailContent.subject,
            bodyHtml: emailContent.html,
            bodyText: emailContent.text,
            toEmail: emailRecipient.email,
            toName: emailRecipient.name,
            guardianId: emailRecipient.guardianId,
            linkedContactId: contact.id,
            metadata: { contactId: contact.id, followUpDate, contactType },
          }).catch(() => {});
        }
      }
    }

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

export default router;
