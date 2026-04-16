import { Router, type Request, type Response } from "express";
import { db, parentMessagesTable, messageTemplatesTable, conferenceRequestsTable, guardiansTable, staffTable, studentsTable, teamMeetingsTable } from "@workspace/db";
import { eq, and, desc, or, isNull, sql } from "drizzle-orm";
import { getPublicMeta } from "../lib/clerkClaims";
import { logAudit } from "../lib/auditLog";
import { sendEmail } from "../lib/email";
import { requireGuardianScope } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import { getEnforcedDistrictId } from "../middlewares/auth";

const router = Router();

const IS_PRODUCTION = process.env.NODE_ENV === "production";

interface MessageRow {
  id: unknown;
  studentId: unknown;
  senderType: unknown;
  senderStaffFirst: unknown;
  senderStaffLast: unknown;
  guardianName: unknown;
  createdAt: unknown;
  readAt: unknown;
  threadId: unknown;
  subject: unknown;
  category: unknown;
  body: unknown;
  [key: string]: unknown;
}

function getStaffId(req: Request): number | null {
  const meta = getPublicMeta(req);
  const id = meta.staffId;
  if (id) return id;
  if (!IS_PRODUCTION) {
    console.warn("[parentMessages] No staffId in auth claims — using dev fallback (77)");
    return 77;
  }
  return null;
}

async function verifyStudentInDistrict(req: Request, studentId: number): Promise<boolean> {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (districtId === null) return true;
  const result = await db.execute(sql`
    SELECT 1 FROM students
    WHERE id = ${studentId}
      AND school_id IN (SELECT id FROM schools WHERE district_id = ${districtId})
  `);
  const rows = "rows" in result ? (result.rows as unknown[]) : (result as unknown as unknown[]);
  return rows.length > 0;
}

async function verifyGuardianBelongsToStudent(guardianId: number, studentId: number): Promise<boolean> {
  const rows = await db.select({ id: guardiansTable.id })
    .from(guardiansTable)
    .where(and(eq(guardiansTable.id, guardianId), eq(guardiansTable.studentId, studentId)));
  return rows.length > 0;
}

router.get("/message-templates", async (req: Request, res: Response) => {
  try {
    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    const templates = await db
      .select()
      .from(messageTemplatesTable)
      .where(
        districtId
          ? or(
              eq(messageTemplatesTable.isSystem, true),
              isNull(messageTemplatesTable.districtId),
              eq(messageTemplatesTable.districtId, districtId),
            )
          : or(eq(messageTemplatesTable.isSystem, true), isNull(messageTemplatesTable.districtId))
      )
      .orderBy(messageTemplatesTable.name);
    res.json(templates);
  } catch (err) {
    console.error("GET /message-templates error:", err);
    res.status(500).json({ error: "Failed to load templates" });
  }
});

router.get("/students/:studentId/messages", async (req: Request, res: Response) => {
  try {
    const studentId = Number(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

    if (!(await verifyStudentInDistrict(req, studentId))) {
      res.status(403).json({ error: "Access denied" }); return;
    }

    const messages = await db.execute(sql`
      SELECT
        pm.id, pm.student_id as "studentId", pm.sender_type as "senderType",
        pm.sender_staff_id as "senderStaffId", pm.sender_guardian_id as "senderGuardianId",
        pm.recipient_guardian_id as "recipientGuardianId", pm.recipient_staff_id as "recipientStaffId",
        pm.thread_id as "threadId", pm.template_id as "templateId",
        pm.category, pm.subject, pm.body, pm.read_at as "readAt",
        pm.is_archived as "isArchived", pm.metadata, pm.created_at as "createdAt",
        s.first_name as "senderStaffFirst", s.last_name as "senderStaffLast",
        COALESCE(rg.name, sg.name) as "guardianName"
      FROM parent_messages pm
      LEFT JOIN staff s ON s.id = pm.sender_staff_id
      LEFT JOIN guardians rg ON rg.id = pm.recipient_guardian_id
      LEFT JOIN guardians sg ON sg.id = pm.sender_guardian_id
      WHERE pm.student_id = ${studentId}
      ORDER BY pm.created_at DESC
    `);

    const grouped = new Map<number, MessageRow[]>();

    const messageRows = "rows" in messages ? (messages.rows as MessageRow[]) : (messages as unknown as MessageRow[]);
    for (const m of messageRows) {
      const msg: MessageRow = {
        ...m,
        senderName: m.senderType === "staff"
          ? (m.senderStaffFirst ? `${m.senderStaffFirst} ${m.senderStaffLast}` : "Staff")
          : (m.guardianName ?? "Guardian"),
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
        readAt: m.readAt ? (m.readAt instanceof Date ? m.readAt.toISOString() : m.readAt) : null,
      };
      const tid = (m.threadId ?? m.id) as number;
      if (!grouped.has(tid)) grouped.set(tid, []);
      grouped.get(tid)!.push(msg);
    }

    const threads = Array.from(grouped.entries()).map(([threadId, msgs]) => {
      msgs.sort((a, b) => new Date(String(a.createdAt)).getTime() - new Date(String(b.createdAt)).getTime());
      return {
        threadId,
        subject: msgs[0].subject,
        category: msgs[0].category,
        messageCount: msgs.length,
        lastMessageAt: msgs[msgs.length - 1].createdAt,
        hasUnread: msgs.some(m => !m.readAt && m.senderType === "guardian"),
        messages: msgs,
      };
    });

    threads.sort((a, b) => new Date(String(b.lastMessageAt)).getTime() - new Date(String(a.lastMessageAt)).getTime());

    res.json({ threads });
  } catch (err) {
    console.error("GET /students/:studentId/messages error:", err);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

router.get("/students/:studentId/messages/search", async (req: Request, res: Response) => {
  try {
    const studentId = Number(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

    if (!(await verifyStudentInDistrict(req, studentId))) {
      res.status(403).json({ error: "Access denied" }); return;
    }

    const q = (req.query.q as string || "").trim();
    const category = req.query.category as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const conditions = [sql`pm.student_id = ${studentId}`];
    if (q) {
      conditions.push(sql`(pm.subject ILIKE ${"%" + q + "%"} OR pm.body ILIKE ${"%" + q + "%"})`);
    }
    if (category) {
      conditions.push(sql`pm.category = ${category}`);
    }
    if (startDate) {
      conditions.push(sql`pm.created_at >= ${startDate}::timestamptz`);
    }
    if (endDate) {
      conditions.push(sql`pm.created_at <= ${endDate}::timestamptz`);
    }

    const whereClause = conditions.length > 0
      ? sql.join(conditions, sql` AND `)
      : sql`1=1`;

    const messages = await db.execute(sql`
      SELECT
        pm.id, pm.student_id as "studentId", pm.sender_type as "senderType",
        pm.thread_id as "threadId", pm.category, pm.subject, pm.body,
        pm.read_at as "readAt", pm.created_at as "createdAt",
        s.first_name as "senderStaffFirst", s.last_name as "senderStaffLast",
        COALESCE(rg.name, sg.name) as "guardianName"
      FROM parent_messages pm
      LEFT JOIN staff s ON s.id = pm.sender_staff_id
      LEFT JOIN guardians rg ON rg.id = pm.recipient_guardian_id
      LEFT JOIN guardians sg ON sg.id = pm.sender_guardian_id
      WHERE ${whereClause}
      ORDER BY pm.created_at DESC
      LIMIT 100
    `);

    const rows = "rows" in messages ? (messages.rows as Record<string, unknown>[]) : (messages as unknown as Record<string, unknown>[]);
    res.json({
      results: rows.map(m => ({
        ...m,
        senderName: m.senderType === "staff"
          ? (m.senderStaffFirst ? `${m.senderStaffFirst} ${m.senderStaffLast}` : "Staff")
          : (m.guardianName ?? "Guardian"),
      })),
      total: rows.length,
    });
  } catch (err) {
    console.error("GET /students/:studentId/messages/search error:", err);
    res.status(500).json({ error: "Failed to search messages" });
  }
});

router.patch("/students/:studentId/messages/:messageId/read", async (req: Request, res: Response) => {
  try {
    const studentId = Number(req.params.studentId);
    const messageId = Number(req.params.messageId);
    if (isNaN(studentId) || isNaN(messageId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

    if (!(await verifyStudentInDistrict(req, studentId))) {
      res.status(403).json({ error: "Access denied" }); return;
    }

    const [msg] = await db.select({ id: parentMessagesTable.id, senderType: parentMessagesTable.senderType })
      .from(parentMessagesTable)
      .where(and(
        eq(parentMessagesTable.id, messageId),
        eq(parentMessagesTable.studentId, studentId),
        eq(parentMessagesTable.senderType, "guardian"),
      ));

    if (!msg) { res.status(404).json({ error: "Message not found" }); return; }

    await db.update(parentMessagesTable)
      .set({ readAt: new Date() })
      .where(and(eq(parentMessagesTable.id, messageId), isNull(parentMessagesTable.readAt)));

    res.json({ ok: true });
  } catch (err) {
    console.error("PATCH /students/:studentId/messages/:messageId/read error:", err);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

router.post("/students/:studentId/messages", async (req: Request, res: Response) => {
  try {
    const studentId = Number(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

    const staffId = getStaffId(req);
    if (!staffId) { res.status(403).json({ error: "Staff identity required" }); return; }

    if (!(await verifyStudentInDistrict(req, studentId))) {
      res.status(403).json({ error: "Access denied" }); return;
    }

    const { guardianId, subject, body, category, templateId, threadId } = req.body;

    if (!guardianId || !subject || !body) {
      res.status(400).json({ error: "guardianId, subject, and body are required" });
      return;
    }

    const gId = Number(guardianId);
    if (!(await verifyGuardianBelongsToStudent(gId, studentId))) {
      res.status(400).json({ error: "Guardian does not belong to this student" }); return;
    }

    const validCategories = ["general", "prior_written_notice", "iep_meeting_invitation", "progress_update", "conference_request"];
    const cat = category || "general";
    if (!validCategories.includes(cat)) {
      res.status(400).json({ error: "Invalid message category" }); return;
    }

    const [message] = await db.insert(parentMessagesTable).values({
      studentId,
      senderType: "staff",
      senderStaffId: staffId,
      recipientGuardianId: gId,
      category: cat,
      subject,
      body,
      templateId: templateId ? Number(templateId) : null,
      threadId: threadId ? Number(threadId) : null,
    }).returning();

    if (!message.threadId) {
      await db.update(parentMessagesTable)
        .set({ threadId: message.id })
        .where(eq(parentMessagesTable.id, message.id));
      message.threadId = message.id;
    }

    logAudit(req, {
      action: "create",
      targetTable: "parent_messages",
      targetId: message.id,
      studentId,
      summary: `Sent message to guardian: ${subject}`,
      newValues: { guardianId, subject, category },
    });

    const [guardianRow] = await db.select({ email: guardiansTable.email, name: guardiansTable.name })
      .from(guardiansTable).where(eq(guardiansTable.id, gId));
    if (guardianRow?.email) {
      sendEmail({
        studentId,
        type: "general",
        subject: `New Message: ${subject}`,
        bodyHtml: `<p>You have a new message in the Trellis Parent Portal.</p><p><strong>Subject:</strong> ${subject}</p><p>${body.replace(/\n/g, "<br>")}</p><p>Log in to the portal to reply.</p>`,
        bodyText: `You have a new message: ${subject}\n\n${body}\n\nLog in to the Trellis Parent Portal to reply.`,
        toEmail: guardianRow.email,
        toName: guardianRow.name,
        guardianId: gId,
        staffId,
      }).catch(err => console.error("Email notification failed (non-blocking):", err));
    }

    res.status(201).json({ ...message, createdAt: message.createdAt.toISOString(), updatedAt: message.updatedAt.toISOString() });
  } catch (err) {
    console.error("POST /students/:studentId/messages error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

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

    if (guardian?.name) {
      const [guardianForEmail] = await db.select({ email: guardiansTable.email })
        .from(guardiansTable).where(eq(guardiansTable.id, gId));
      if (guardianForEmail?.email) {
        sendEmail({
          studentId,
          type: "general",
          subject: `Conference Request: ${title}`,
          bodyHtml: `<p>You have a new conference request in the Trellis Parent Portal.</p><p>${msgBody.replace(/\n/g, "<br>")}</p><p>Log in to the portal to respond.</p>`,
          bodyText: `Conference Request: ${title}\n\n${msgBody}\n\nLog in to the Trellis Parent Portal to respond.`,
          toEmail: guardianForEmail.email,
          toName: guardian.name,
          guardianId: gId,
          staffId,
        }).catch(err => console.error("Conference email notification failed (non-blocking):", err));
      }
    }

    res.status(201).json({ conference: { ...conf, createdAt: conf.createdAt.toISOString(), updatedAt: conf.updatedAt.toISOString() }, message: { ...message, createdAt: message.createdAt.toISOString() } });
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

const guardianMessagesRouter = Router();
guardianMessagesRouter.use(requireGuardianScope);

async function resolveGuardianId(req: Request): Promise<number | null> {
  const authed = req as AuthedRequest;
  return authed.tenantGuardianId ?? null;
}

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

    const [msg] = await db.select({ id: parentMessagesTable.id, recipientGuardianId: parentMessagesTable.recipientGuardianId })
      .from(parentMessagesTable)
      .where(and(eq(parentMessagesTable.id, msgId), eq(parentMessagesTable.recipientGuardianId, guardianId)));

    if (!msg) { res.status(404).json({ error: "Message not found" }); return; }

    await db.update(parentMessagesTable).set({ readAt: new Date() }).where(eq(parentMessagesTable.id, msgId));
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

export { guardianMessagesRouter };
export default router;
