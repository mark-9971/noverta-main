import { Router, type Request, type Response } from "express";
import { db, parentMessagesTable, conferenceRequestsTable, guardiansTable, staffTable, studentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import { sendEmail } from "../../lib/email";
import { getStaffId, verifyGuardianBelongsToStudent, verifyStudentInDistrict } from "./shared";

// tenant-scope: district-join
const router = Router();

router.post("/students/:studentId/conference-requests", async (req: Request, res: Response) => {
  try {
    const studentId = Number(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

    const staffId = getStaffId(req);
    if (!staffId) { res.status(403).json({ error: "Staff identity required" }); return; }

    if (!(await verifyStudentInDistrict(req, studentId))) {
      res.status(403).json({ error: "Access denied" }); return;
    }

    const { guardianId, title, description, proposedTimes, location } = req.body;

    if (!guardianId || !title || !proposedTimes?.length) {
      res.status(400).json({ error: "guardianId, title, and at least one proposed time are required" });
      return;
    }

    const gId = Number(guardianId);
    if (!(await verifyGuardianBelongsToStudent(gId, studentId))) {
      res.status(400).json({ error: "Guardian does not belong to this student" }); return;
    }

    if (!Array.isArray(proposedTimes) || !proposedTimes.every((t: unknown) => typeof t === "string" && !isNaN(Date.parse(t)))) {
      res.status(400).json({ error: "proposedTimes must be an array of valid date strings" }); return;
    }

    const [guardian] = await db.select({ name: guardiansTable.name }).from(guardiansTable).where(eq(guardiansTable.id, Number(guardianId)));
    const [student] = await db.select({ firstName: studentsTable.firstName, lastName: studentsTable.lastName }).from(studentsTable).where(eq(studentsTable.id, studentId));

    const timesFormatted = proposedTimes.map((t: string) => {
      const d = new Date(t);
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }).join("\n• ");

    const msgBody = `Dear ${guardian?.name ?? "Guardian"},\n\nI would like to schedule a conference to discuss ${student?.firstName ?? ""} ${student?.lastName ?? ""}'s educational program.\n\nPurpose: ${title}\n${description ? `\nDetails: ${description}\n` : ""}\nProposed Times:\n• ${timesFormatted}\n${location ? `\nLocation: ${location}` : ""}\n\nPlease respond in your portal to accept a time or suggest an alternative.\n\nBest regards`;

    const [message] = await db.insert(parentMessagesTable).values({
      studentId,
      senderType: "staff",
      senderStaffId: staffId,
      recipientGuardianId: Number(guardianId),
      category: "conference_request",
      subject: `Conference Request — ${student?.firstName ?? ""} ${student?.lastName ?? ""}`,
      body: msgBody,
    }).returning();

    await db.update(parentMessagesTable).set({ threadId: message.id }).where(eq(parentMessagesTable.id, message.id));

    const [conf] = await db.insert(conferenceRequestsTable).values({
      studentId,
      staffId,
      guardianId: Number(guardianId),
      messageId: message.id,
      title,
      description: description || null,
      proposedTimes,
      location: location || null,
      status: "proposed",
    }).returning();

    logAudit(req, {
      action: "create",
      targetTable: "conference_requests",
      targetId: conf.id,
      studentId,
      summary: `Created conference request: ${title}`,
      newValues: { guardianId, title, proposedTimes },
    });

    let emailDelivery: {
      attempted: boolean;
      status: "queued" | "accepted" | "delivered" | "bounced" | "complained" | "failed" | "not_configured" | "sent" | "no_email_on_file" | "skipped";
      communicationEventId?: number;
      error?: string;
    } = { attempted: false, status: "no_email_on_file" };

    if (guardian?.name) {
      const [guardianForEmail] = await db.select({ email: guardiansTable.email })
        .from(guardiansTable).where(eq(guardiansTable.id, gId));
      if (guardianForEmail?.email) {
        try {
          const result = await sendEmail({
            studentId,
            type: "general",
            subject: `Conference Request: ${title}`,
            bodyHtml: `<p>You have a new conference request in the Noverta Parent Portal.</p><p>${msgBody.replace(/\n/g, "<br>")}</p><p>Log in to the portal to respond.</p>`,
            bodyText: `Conference Request: ${title}\n\n${msgBody}\n\nLog in to the Noverta Parent Portal to respond.`,
            toEmail: guardianForEmail.email,
            toName: guardian.name,
            guardianId: gId,
            staffId,
          });
          emailDelivery = {
            attempted: true,
            status: result.status,
            communicationEventId: result.communicationEventId,
            error: result.success ? undefined : result.error,
          };
        } catch (err) {
          console.error("Conference email notification threw:", err);
          emailDelivery = { attempted: true, status: "failed", error: err instanceof Error ? err.message : String(err) };
        }
      }
    }

    res.status(201).json({
      conference: { ...conf, createdAt: conf.createdAt.toISOString(), updatedAt: conf.updatedAt.toISOString() },
      message: { ...message, createdAt: message.createdAt.toISOString() },
      emailDelivery,
    });
  } catch (err) {
    console.error("POST /students/:studentId/conference-requests error:", err);
    res.status(500).json({ error: "Failed to create conference request" });
  }
});

router.get("/students/:studentId/conference-requests", async (req: Request, res: Response) => {
  try {
    const studentId = Number(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

    if (!(await verifyStudentInDistrict(req, studentId))) {
      res.status(403).json({ error: "Access denied" }); return;
    }

    const conferences = await db
      .select({
        id: conferenceRequestsTable.id,
        studentId: conferenceRequestsTable.studentId,
        staffId: conferenceRequestsTable.staffId,
        guardianId: conferenceRequestsTable.guardianId,
        messageId: conferenceRequestsTable.messageId,
        title: conferenceRequestsTable.title,
        description: conferenceRequestsTable.description,
        proposedTimes: conferenceRequestsTable.proposedTimes,
        selectedTime: conferenceRequestsTable.selectedTime,
        status: conferenceRequestsTable.status,
        location: conferenceRequestsTable.location,
        guardianNotes: conferenceRequestsTable.guardianNotes,
        createdAt: conferenceRequestsTable.createdAt,
        staffFirst: staffTable.firstName,
        staffLast: staffTable.lastName,
        guardianName: guardiansTable.name,
      })
      .from(conferenceRequestsTable)
      .leftJoin(staffTable, eq(staffTable.id, conferenceRequestsTable.staffId))
      .leftJoin(guardiansTable, eq(guardiansTable.id, conferenceRequestsTable.guardianId))
      .where(eq(conferenceRequestsTable.studentId, studentId))
      .orderBy(desc(conferenceRequestsTable.createdAt));

    res.json(conferences.map(c => ({
      ...c,
      staffName: c.staffFirst ? `${c.staffFirst} ${c.staffLast}` : null,
      createdAt: c.createdAt.toISOString(),
      selectedTime: c.selectedTime?.toISOString() ?? null,
    })));
  } catch (err) {
    console.error("GET /students/:studentId/conference-requests error:", err);
    res.status(500).json({ error: "Failed to load conference requests" });
  }
});

export default router;
