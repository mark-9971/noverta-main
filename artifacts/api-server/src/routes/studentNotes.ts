import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentNotesTable, studentNoteMentionsTable,
  staffTable, alertsTable, studentsTable,
} from "@workspace/db";
import { eq, and, desc, asc, isNull, gte, lte, inArray } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/auth";
import { logAudit } from "../lib/auditLog";
import { assertStudentAccess } from "../lib/tenantAccess";
import { assertStudentInCallerDistrict } from "../lib/districtScope";

const router: IRouter = Router();

const MAX_NOTE_LENGTH = 5000;

function extractMentionIds(content: string): number[] {
  const matches = content.match(/@\[(\d+)\]/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => parseInt(m.slice(2, -1), 10)))].filter(n => Number.isFinite(n) && n > 0);
}

router.get("/students/:studentId/notes/staff", async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    if (!Number.isFinite(studentId) || studentId <= 0) {
      res.status(400).json({ error: "Invalid student ID" });
      return;
    }

    const ok = await assertStudentAccess(req, studentId);
    if (!ok) { res.status(403).json({ error: "Access denied" }); return; }

    const staff = await db.select({
      id: staffTable.id,
      firstName: staffTable.firstName,
      lastName: staffTable.lastName,
      role: staffTable.role,
    })
      .from(staffTable)
      .where(eq(staffTable.status, "active"))
      .orderBy(asc(staffTable.lastName), asc(staffTable.firstName));

    res.json(staff.map(s => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      role: s.role,
    })));
  } catch (e: unknown) {
    console.error("GET /students/:studentId/notes/staff error:", e);
    res.status(500).json({ error: "Failed to load staff list" });
  }
});

router.get("/students/:studentId/notes", async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    if (!Number.isFinite(studentId) || studentId <= 0) {
      res.status(400).json({ error: "Invalid student ID" });
      return;
    }

    const ok = await assertStudentAccess(req, studentId);
    if (!ok) { res.status(403).json({ error: "Access denied" }); return; }

    const { author, pinned, from, to } = req.query;

    const conditions = [
      eq(studentNotesTable.studentId, studentId),
      isNull(studentNotesTable.deletedAt),
    ];

    if (author) {
      const authorId = Number(author);
      if (Number.isFinite(authorId)) conditions.push(eq(studentNotesTable.authorStaffId, authorId));
    }
    if (pinned === "true") conditions.push(eq(studentNotesTable.pinned, true));
    if (from) conditions.push(gte(studentNotesTable.createdAt, new Date(from as string)));
    if (to) conditions.push(lte(studentNotesTable.createdAt, new Date(to as string)));

    const notes = await db.select({
      id: studentNotesTable.id,
      studentId: studentNotesTable.studentId,
      authorStaffId: studentNotesTable.authorStaffId,
      content: studentNotesTable.content,
      pinned: studentNotesTable.pinned,
      mentions: studentNotesTable.mentions,
      parentNoteId: studentNotesTable.parentNoteId,
      createdAt: studentNotesTable.createdAt,
      updatedAt: studentNotesTable.updatedAt,
      authorFirstName: staffTable.firstName,
      authorLastName: staffTable.lastName,
      authorRole: staffTable.role,
    })
      .from(studentNotesTable)
      .innerJoin(staffTable, eq(studentNotesTable.authorStaffId, staffTable.id))
      .where(and(...conditions))
      .orderBy(desc(studentNotesTable.pinned), desc(studentNotesTable.createdAt));

    const result = notes.map(n => ({
      id: n.id,
      studentId: n.studentId,
      authorStaffId: n.authorStaffId,
      authorName: `${n.authorFirstName} ${n.authorLastName}`,
      authorRole: n.authorRole,
      content: n.content,
      pinned: n.pinned,
      mentions: n.mentions,
      parentNoteId: n.parentNoteId,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    }));

    res.json(result);
  } catch (e: unknown) {
    console.error("GET /students/:studentId/notes error:", e);
    res.status(500).json({ error: "Failed to load notes" });
  }
});

router.post("/students/:studentId/notes", async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    if (!Number.isFinite(studentId) || studentId <= 0) {
      res.status(400).json({ error: "Invalid student ID" });
      return;
    }

    const authed = req as AuthedRequest;
    const ok = await assertStudentAccess(req, studentId);
    if (!ok) { res.status(403).json({ error: "Access denied" }); return; }

    const { content, parentNoteId } = req.body;
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ error: "Content is required" });
      return;
    }
    if (content.length > MAX_NOTE_LENGTH) {
      res.status(400).json({ error: `Content must be ${MAX_NOTE_LENGTH} characters or less` });
      return;
    }

    const staffId = authed.tenantStaffId;
    if (!staffId) {
      res.status(403).json({ error: "Staff identity required to create notes" });
      return;
    }

    if (parentNoteId) {
      const parentId = Number(parentNoteId);
      if (!Number.isFinite(parentId)) {
        res.status(400).json({ error: "Invalid parent note ID" });
        return;
      }
      const [parent] = await db.select({ id: studentNotesTable.id })
        .from(studentNotesTable)
        .where(and(
          eq(studentNotesTable.id, parentId),
          eq(studentNotesTable.studentId, studentId),
          isNull(studentNotesTable.deletedAt),
        ));
      if (!parent) {
        res.status(400).json({ error: "Parent note not found or belongs to different student" });
        return;
      }
    }

    const mentionIds = extractMentionIds(content);

    if (mentionIds.length > 0) {
      const validStaff = await db.select({ id: staffTable.id })
        .from(staffTable)
        .where(inArray(staffTable.id, mentionIds));
      const validIds = new Set(validStaff.map(s => s.id));
      mentionIds.splice(0, mentionIds.length, ...mentionIds.filter(id => validIds.has(id)));
    }

    const [note] = await db.insert(studentNotesTable).values({
      studentId,
      authorStaffId: staffId,
      content: content.trim(),
      pinned: false,
      mentions: mentionIds,
      parentNoteId: parentNoteId ? Number(parentNoteId) : null,
    }).returning();

    if (mentionIds.length > 0) {
      await db.insert(studentNoteMentionsTable).values(
        mentionIds.map(mid => ({ noteId: note.id, mentionedStaffId: mid }))
      );

      const student = await db.select({ firstName: studentsTable.firstName, lastName: studentsTable.lastName })
        .from(studentsTable).where(eq(studentsTable.id, studentId)).limit(1);
      const studentName = student[0] ? `${student[0].firstName} ${student[0].lastName}` : `Student #${studentId}`;

      const author = await db.select({ firstName: staffTable.firstName, lastName: staffTable.lastName })
        .from(staffTable).where(eq(staffTable.id, staffId)).limit(1);
      const authorName = author[0] ? `${author[0].firstName} ${author[0].lastName}` : "A team member";

      await db.insert(alertsTable).values(
        mentionIds.map(mentionedId => ({
          studentId,
          staffId: mentionedId,
          type: "note_mention" as const,
          severity: "low" as const,
          message: `${authorName} mentioned you in a note on ${studentName}'s record`,
          suggestedAction: "Review the note and respond if needed",
        }))
      );
    }

    logAudit(req, {
      action: "create",
      targetTable: "student_notes",
      targetId: note.id,
      studentId,
      summary: `Created note (${content.trim().length} chars, ${mentionIds.length} mentions)`,
    });

    const authorRow = await db.select({ firstName: staffTable.firstName, lastName: staffTable.lastName, role: staffTable.role })
      .from(staffTable).where(eq(staffTable.id, staffId)).limit(1);

    res.status(201).json({
      ...note,
      authorName: authorRow[0] ? `${authorRow[0].firstName} ${authorRow[0].lastName}` : "Unknown",
      authorRole: authorRow[0]?.role ?? null,
    });
  } catch (e: unknown) {
    console.error("POST /students/:studentId/notes error:", e);
    res.status(500).json({ error: "Failed to create note" });
  }
});

router.patch("/students/:studentId/notes/:noteId", async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    const noteId = Number(req.params.noteId);
    if (!Number.isFinite(studentId) || !Number.isFinite(noteId)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const authed = req as AuthedRequest;
    const ok = await assertStudentAccess(req, studentId);
    if (!ok) { res.status(403).json({ error: "Access denied" }); return; }
    if (!(await assertStudentInCallerDistrict(authed, studentId, res))) return;

    const [existing] = await db.select().from(studentNotesTable)
      .where(and(eq(studentNotesTable.id, noteId), eq(studentNotesTable.studentId, studentId), isNull(studentNotesTable.deletedAt)));

    if (!existing) { res.status(404).json({ error: "Note not found" }); return; }

    const { content, pinned } = req.body;
    const updates: Record<string, unknown> = {};

    if (content !== undefined) {
      if (existing.authorStaffId !== authed.tenantStaffId && authed.trellisRole !== "admin") {
        res.status(403).json({ error: "Only the author or admin can edit note content" });
        return;
      }
      if (typeof content !== "string" || content.trim().length === 0) {
        res.status(400).json({ error: "Content cannot be empty" });
        return;
      }
      if (content.length > MAX_NOTE_LENGTH) {
        res.status(400).json({ error: `Content must be ${MAX_NOTE_LENGTH} characters or less` });
        return;
      }
      updates.content = content.trim();
    }

    if (pinned !== undefined) {
      if (typeof pinned !== "boolean") {
        res.status(400).json({ error: "pinned must be boolean" });
        return;
      }
      updates.pinned = pinned;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const [updated] = await db.update(studentNotesTable)
      .set(updates)
      .where(eq(studentNotesTable.id, noteId))
      .returning();

    logAudit(req, {
      action: "update",
      targetTable: "student_notes",
      targetId: noteId,
      studentId,
      summary: `Updated note fields: ${Object.keys(updates).join(", ")}`,
    });

    res.json(updated);
  } catch (e: unknown) {
    console.error("PATCH /students/:studentId/notes/:noteId error:", e);
    res.status(500).json({ error: "Failed to update note" });
  }
});

router.delete("/students/:studentId/notes/:noteId", async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    const noteId = Number(req.params.noteId);
    if (!Number.isFinite(studentId) || !Number.isFinite(noteId)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const authed = req as AuthedRequest;
    const ok = await assertStudentAccess(req, studentId);
    if (!ok) { res.status(403).json({ error: "Access denied" }); return; }
    if (!(await assertStudentInCallerDistrict(authed, studentId, res))) return;

    const [existing] = await db.select().from(studentNotesTable)
      .where(and(eq(studentNotesTable.id, noteId), eq(studentNotesTable.studentId, studentId), isNull(studentNotesTable.deletedAt)));

    if (!existing) { res.status(404).json({ error: "Note not found" }); return; }

    if (existing.authorStaffId !== authed.tenantStaffId && authed.trellisRole !== "admin") {
      res.status(403).json({ error: "Only the author or admin can delete a note" });
      return;
    }

    await db.update(studentNotesTable)
      .set({ deletedAt: new Date() })
      .where(eq(studentNotesTable.id, noteId));

    logAudit(req, {
      action: "delete",
      targetTable: "student_notes",
      targetId: noteId,
      studentId,
      summary: "Soft-deleted note",
    });

    res.json({ success: true });
  } catch (e: unknown) {
    console.error("DELETE /students/:studentId/notes/:noteId error:", e);
    res.status(500).json({ error: "Failed to delete note" });
  }
});

export default router;
