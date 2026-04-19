// tenant-scope: guardian
// All routes here require requireGuardianScope — the guardian JWT token scopes
// every request to the specific guardian's identity. No district session is used.
import { Router, type Request, type Response } from "express";
import { db, parentMessagesTable, conferenceRequestsTable, guardiansTable, staffTable, studentsTable, schoolsTable, teamMeetingsTable } from "@workspace/db";
import { eq, and, desc, or, isNull } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import { requireGuardianScope } from "../../middlewares/auth";
import { resolveGuardianId } from "./shared";
import { sendEmail, buildPwnReadReceiptEmail, getAppBaseUrl } from "../../lib/email";

const guardianMessagesRouter = Router();
guardianMessagesRouter.use(requireGuardianScope);

guardianMessagesRouter.get("/messages", async (req: Request, res: Response) => {
  try {
    const guardianId = await resolveGuardianId(req);
    if (!guardianId) { res.status(403).json({ error: "No guardian identity" }); return; }

    const messages = await db
      .select({
        id: parentMessagesTable.id,
        studentId: parentMessagesTable.studentId,
        senderType: parentMessagesTable.senderType,
        senderStaffId: parentMessagesTable.senderStaffId,
        senderGuardianId: parentMessagesTable.senderGuardianId,
        threadId: parentMessagesTable.threadId,
        category: parentMessagesTable.category,
        subject: parentMessagesTable.subject,
        body: parentMessagesTable.body,
        readAt: parentMessagesTable.readAt,
        createdAt: parentMessagesTable.createdAt,
        senderStaffFirst: staffTable.firstName,
        senderStaffLast: staffTable.lastName,
        studentFirst: studentsTable.firstName,
        studentLast: studentsTable.lastName,
      })
      .from(parentMessagesTable)
      .leftJoin(staffTable, eq(staffTable.id, parentMessagesTable.senderStaffId))
      .leftJoin(studentsTable, eq(studentsTable.id, parentMessagesTable.studentId))
      .where(or(
        eq(parentMessagesTable.recipientGuardianId, guardianId),
        eq(parentMessagesTable.senderGuardianId, guardianId),
      ))
      .orderBy(desc(parentMessagesTable.createdAt));

    interface GuardianMsg { id: number; senderType: string; senderName: string; studentName: string | null; createdAt: string; readAt: string | null; subject: string; category: string; body: string; threadId: number | null; [key: string]: unknown; }
    const grouped = new Map<number, GuardianMsg[]>();
    for (const m of messages) {
      const msg: GuardianMsg = {
        ...m,
        senderName: m.senderType === "staff"
          ? (m.senderStaffFirst ? `${m.senderStaffFirst} ${m.senderStaffLast}` : "Staff")
          : "You",
        studentName: m.studentFirst ? `${m.studentFirst} ${m.studentLast}` : null,
        createdAt: m.createdAt.toISOString(),
        readAt: m.readAt?.toISOString() ?? null,
      };
      const tid = m.threadId ?? m.id;
      if (!grouped.has(tid)) grouped.set(tid, []);
      grouped.get(tid)!.push(msg);
    }

    const threads = Array.from(grouped.entries()).map(([threadId, msgs]) => {
      msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const unreadCount = msgs.filter(m => !m.readAt && m.senderType === "staff").length;
      return {
        threadId,
        subject: msgs[0].subject,
        category: msgs[0].category,
        studentName: msgs[0].studentName,
        messageCount: msgs.length,
        unreadCount,
        lastMessageAt: msgs[msgs.length - 1].createdAt,
        messages: msgs,
      };
    });

    threads.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

    res.json({ threads, unreadTotal: threads.reduce((s, t) => s + t.unreadCount, 0) });
  } catch (err) {
    console.error("GET /guardian-portal/messages error:", err);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

guardianMessagesRouter.patch("/messages/:id/read", async (req: Request, res: Response) => {
  try {
    const guardianId = await resolveGuardianId(req);
    if (!guardianId) { res.status(403).json({ error: "No guardian identity" }); return; }

    const msgId = Number(req.params.id);
    if (isNaN(msgId)) { res.status(400).json({ error: "Invalid message ID" }); return; }

    const [msg] = await db.select({
      id: parentMessagesTable.id,
      recipientGuardianId: parentMessagesTable.recipientGuardianId,
      senderStaffId: parentMessagesTable.senderStaffId,
      studentId: parentMessagesTable.studentId,
      category: parentMessagesTable.category,
      subject: parentMessagesTable.subject,
      readAt: parentMessagesTable.readAt,
    })
      .from(parentMessagesTable)
      .where(and(eq(parentMessagesTable.id, msgId), eq(parentMessagesTable.recipientGuardianId, guardianId)));

    if (!msg) { res.status(404).json({ error: "Message not found" }); return; }

    // Atomic first-read detection: the update only matches rows where
    // read_at IS NULL, so concurrent PATCH requests can't both observe an
    // unread state and double-fire the PWN notification path below.
    const readAt = new Date();
    const updated = await db.update(parentMessagesTable)
      .set({ readAt })
      .where(and(eq(parentMessagesTable.id, msgId), isNull(parentMessagesTable.readAt)))
      .returning({ id: parentMessagesTable.id });
    const wasUnread = updated.length > 0;

    // PWN read-receipt notification: when a guardian opens a Prior Written
    // Notice for the first time, alert the sending staff member by email and
    // record the read-receipt event in the parent-communication audit log
    // for compliance tracking. Failures here are logged but do not block the
    // read acknowledgement itself.
    if (wasUnread && msg.category === "prior_written_notice" && msg.senderStaffId) {
      try {
        const [staffRow] = await db.select({
          id: staffTable.id,
          firstName: staffTable.firstName,
          lastName: staffTable.lastName,
          email: staffTable.email,
          schoolId: staffTable.schoolId,
        }).from(staffTable).where(eq(staffTable.id, msg.senderStaffId));

        const [guardianRow] = await db.select({ name: guardiansTable.name })
          .from(guardiansTable).where(eq(guardiansTable.id, guardianId));

        const [studentRow] = await db.select({
          firstName: studentsTable.firstName,
          lastName: studentsTable.lastName,
        }).from(studentsTable).where(eq(studentsTable.id, msg.studentId));

        const studentName = studentRow ? `${studentRow.firstName} ${studentRow.lastName}` : "the student";
        const guardianName = guardianRow?.name ?? "Guardian";
        const staffName = staffRow ? `${staffRow.firstName} ${staffRow.lastName}` : "Staff";

        let schoolName = "your school";
        if (staffRow?.schoolId) {
          const [schoolRow] = await db.select({ name: schoolsTable.name })
            .from(schoolsTable).where(eq(schoolsTable.id, staffRow.schoolId));
          if (schoolRow?.name) schoolName = schoolRow.name;
        }

        logAudit(req, {
          action: "update",
          targetTable: "parent_messages",
          targetId: msgId,
          studentId: msg.studentId,
          summary: `Guardian read Prior Written Notice: ${msg.subject}`,
          newValues: {
            category: "prior_written_notice",
            readAt: readAt.toISOString(),
            guardianId,
            senderStaffId: msg.senderStaffId,
          },
        });

        if (staffRow?.email) {
          const built = buildPwnReadReceiptEmail({
            staffName,
            guardianName,
            studentName,
            subject: msg.subject,
            readAt,
            schoolName,
            studentId: msg.studentId,
            messageId: msgId,
            appBaseUrl: getAppBaseUrl() ?? undefined,
          });
          await sendEmail({
            studentId: msg.studentId,
            type: "pwn_read_receipt",
            subject: built.subject,
            bodyHtml: built.html,
            bodyText: built.text,
            toEmail: staffRow.email,
            toName: staffName,
            staffId: staffRow.id,
            guardianId,
            metadata: {
              parentMessageId: msgId,
              category: "prior_written_notice",
              readAt: readAt.toISOString(),
            },
          });
        } else {
          console.warn(
            `[pwn_read_receipt] Staff ${msg.senderStaffId} has no email on file; skipped read-receipt email for message ${msgId}`,
          );
        }
      } catch (notifyErr) {
        console.error("PWN read-receipt notification failed:", notifyErr);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("PATCH /guardian-portal/messages/:id/read error:", err);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

guardianMessagesRouter.post("/messages/:id/reply", async (req: Request, res: Response) => {
  try {
    const guardianId = await resolveGuardianId(req);
    if (!guardianId) { res.status(403).json({ error: "No guardian identity" }); return; }

    const parentMsgId = Number(req.params.id);
    if (isNaN(parentMsgId)) { res.status(400).json({ error: "Invalid message ID" }); return; }

    const { body } = req.body;
    if (!body?.trim()) { res.status(400).json({ error: "Reply body is required" }); return; }

    const [original] = await db.select()
      .from(parentMessagesTable)
      .where(and(
        eq(parentMessagesTable.id, parentMsgId),
        or(eq(parentMessagesTable.recipientGuardianId, guardianId), eq(parentMessagesTable.senderGuardianId, guardianId)),
      ));

    if (!original) { res.status(404).json({ error: "Original message not found" }); return; }

    const threadId = original.threadId ?? original.id;
    const recipientStaffId = original.senderStaffId ?? original.recipientStaffId;

    const [reply] = await db.insert(parentMessagesTable).values({
      studentId: original.studentId,
      senderType: "guardian",
      senderGuardianId: guardianId,
      recipientStaffId,
      threadId,
      category: original.category,
      subject: original.subject.startsWith("Re: ") ? original.subject : `Re: ${original.subject}`,
      body: body.trim(),
    }).returning();

    logAudit(req, {
      action: "create",
      targetTable: "parent_messages",
      targetId: reply.id,
      studentId: original.studentId,
      summary: `Guardian replied to message thread ${threadId}`,
      newValues: { guardianId, threadId, subject: reply.subject },
    });

    res.status(201).json({ ...reply, createdAt: reply.createdAt.toISOString(), updatedAt: reply.updatedAt.toISOString() });
  } catch (err) {
    console.error("POST /guardian-portal/messages/:id/reply error:", err);
    res.status(500).json({ error: "Failed to send reply" });
  }
});

guardianMessagesRouter.get("/conferences", async (req: Request, res: Response) => {
  try {
    const guardianId = await resolveGuardianId(req);
    if (!guardianId) { res.status(403).json({ error: "No guardian identity" }); return; }

    const conferences = await db
      .select({
        id: conferenceRequestsTable.id,
        studentId: conferenceRequestsTable.studentId,
        title: conferenceRequestsTable.title,
        description: conferenceRequestsTable.description,
        proposedTimes: conferenceRequestsTable.proposedTimes,
        selectedTime: conferenceRequestsTable.selectedTime,
        status: conferenceRequestsTable.status,
        location: conferenceRequestsTable.location,
        createdAt: conferenceRequestsTable.createdAt,
        staffFirst: staffTable.firstName,
        staffLast: staffTable.lastName,
        studentFirst: studentsTable.firstName,
        studentLast: studentsTable.lastName,
      })
      .from(conferenceRequestsTable)
      .leftJoin(staffTable, eq(staffTable.id, conferenceRequestsTable.staffId))
      .leftJoin(studentsTable, eq(studentsTable.id, conferenceRequestsTable.studentId))
      .where(eq(conferenceRequestsTable.guardianId, guardianId))
      .orderBy(desc(conferenceRequestsTable.createdAt));

    res.json(conferences.map(c => ({
      ...c,
      staffName: c.staffFirst ? `${c.staffFirst} ${c.staffLast}` : null,
      studentName: c.studentFirst ? `${c.studentFirst} ${c.studentLast}` : null,
      createdAt: c.createdAt.toISOString(),
      selectedTime: c.selectedTime?.toISOString() ?? null,
    })));
  } catch (err) {
    console.error("GET /guardian-portal/conferences error:", err);
    res.status(500).json({ error: "Failed to load conferences" });
  }
});

guardianMessagesRouter.patch("/conferences/:id", async (req: Request, res: Response) => {
  try {
    const guardianId = await resolveGuardianId(req);
    if (!guardianId) { res.status(403).json({ error: "No guardian identity" }); return; }

    const confId = Number(req.params.id);
    if (isNaN(confId)) { res.status(400).json({ error: "Invalid conference ID" }); return; }

    const { status, selectedTime, guardianNotes } = req.body;

    const [conf] = await db.select()
      .from(conferenceRequestsTable)
      .where(and(eq(conferenceRequestsTable.id, confId), eq(conferenceRequestsTable.guardianId, guardianId)));

    if (!conf) { res.status(404).json({ error: "Conference not found" }); return; }

    const updates: Partial<{ status: string; selectedTime: Date; guardianNotes: string }> = {};
    if (status === "accepted" && selectedTime) {
      const parsedTime = new Date(selectedTime);
      if (isNaN(parsedTime.getTime())) {
        res.status(400).json({ error: "Invalid selectedTime format" }); return;
      }
      const proposed = (conf.proposedTimes as string[]) ?? [];
      const isValidTime = proposed.some(pt => new Date(pt).getTime() === parsedTime.getTime());
      if (!isValidTime) {
        res.status(400).json({ error: "selectedTime must be one of the proposed times" }); return;
      }
      updates.status = "accepted";
      updates.selectedTime = parsedTime;
    } else if (status === "declined") {
      updates.status = "declined";
    }
    if (typeof guardianNotes === "string") updates.guardianNotes = guardianNotes;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid updates provided" });
      return;
    }

    const [updated] = await db.update(conferenceRequestsTable)
      .set(updates)
      .where(eq(conferenceRequestsTable.id, confId))
      .returning();

    if (conf.messageId) {
      const statusText = updates.status === "accepted"
        ? `Conference accepted for ${new Date(selectedTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
        : "Conference request declined";

      await db.insert(parentMessagesTable).values({
        studentId: conf.studentId,
        senderType: "guardian",
        senderGuardianId: guardianId,
        recipientStaffId: conf.staffId,
        threadId: conf.messageId,
        category: "conference_request",
        subject: `Re: Conference Request — ${conf.title}`,
        body: `${statusText}${guardianNotes ? `\n\nNote: ${guardianNotes}` : ""}`,
      });
    }

    if (updates.status === "accepted" && updates.selectedTime) {
      const meetingDate = updates.selectedTime;
      const [guardianRow] = await db.select({ name: guardiansTable.name })
        .from(guardiansTable).where(eq(guardiansTable.id, guardianId));
      const [staffRow] = await db.select({ firstName: staffTable.firstName, lastName: staffTable.lastName })
        .from(staffTable).where(eq(staffTable.id, conf.staffId));

      await db.insert(teamMeetingsTable).values({
        studentId: conf.studentId,
        meetingType: "parent_conference",
        scheduledDate: meetingDate.toISOString().split("T")[0],
        scheduledTime: meetingDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        duration: 30,
        location: conf.location ?? "TBD",
        meetingFormat: "in_person",
        status: "scheduled",
        agendaItems: [conf.title, conf.description ?? ""].filter(Boolean),
        attendees: [
          { name: staffRow ? `${staffRow.firstName} ${staffRow.lastName}` : "Staff", role: "staff", present: false },
          { name: guardianRow?.name ?? "Guardian", role: "parent", present: false },
        ],
        notes: `Auto-created from conference request #${confId}`,
      });
    }

    logAudit(req, {
      action: "update",
      targetTable: "conference_requests",
      targetId: confId,
      studentId: conf.studentId,
      summary: `Guardian ${updates.status ?? "updated"} conference: ${conf.title}`,
      newValues: updates,
    });

    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString(), selectedTime: updated.selectedTime?.toISOString() ?? null });
  } catch (err) {
    console.error("PATCH /guardian-portal/conferences/:id error:", err);
    res.status(500).json({ error: "Failed to update conference" });
  }
});

export default guardianMessagesRouter;
