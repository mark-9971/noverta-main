import { Router, type Request, type Response } from "express";
import { db, parentMessagesTable, guardiansTable } from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import { sendEmail } from "../../lib/email";
import { getStaffId, verifyGuardianBelongsToStudent, verifyStudentInDistrict, type MessageRow } from "./shared";

const router = Router();

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

    let emailDelivery: {
      attempted: boolean;
      status: "sent" | "not_configured" | "failed" | "no_email_on_file" | "skipped";
      communicationEventId?: number;
      error?: string;
    } = { attempted: false, status: "no_email_on_file" };

    if (guardianRow?.email) {
      try {
        const result = await sendEmail({
          studentId,
          type: "general",
          subject: `New Message: ${subject}`,
          bodyHtml: `<p>You have a new message in the Trellis Parent Portal.</p><p><strong>Subject:</strong> ${subject}</p><p>${body.replace(/\n/g, "<br>")}</p><p>Log in to the portal to reply.</p>`,
          bodyText: `You have a new message: ${subject}\n\n${body}\n\nLog in to the Trellis Parent Portal to reply.`,
          toEmail: guardianRow.email,
          toName: guardianRow.name,
          guardianId: gId,
          staffId,
        });
        emailDelivery = {
          attempted: true,
          status: result.success ? "sent" : (result.notConfigured ? "not_configured" : "failed"),
          communicationEventId: result.communicationEventId,
          error: result.success ? undefined : result.error,
        };
      } catch (err) {
        console.error("Email notification threw:", err);
        emailDelivery = { attempted: true, status: "failed", error: err instanceof Error ? err.message : String(err) };
      }
    }

    res.status(201).json({
      ...message,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
      emailDelivery,
    });
  } catch (err) {
    console.error("POST /students/:studentId/messages error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

export default router;
