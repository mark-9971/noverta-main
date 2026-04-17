import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { iepMeetingAttendeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { logAudit } from "../../lib/auditLog";
import { meetingAccess, pick } from "./shared";

// tenant-scope: district-join
const router: IRouter = Router();

router.post("/iep-meetings/:id/attendees", meetingAccess, async (req, res): Promise<void> => {
  try {
    const meetingId = parseInt(req.params.id);
    if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid meeting ID" }); return; }

    const body = req.body;
    if (!body.name || !body.role) {
      res.status(400).json({ error: "name and role are required" });
      return;
    }

    const [meeting] = await db.select({ id: teamMeetingsTable.id })
      .from(teamMeetingsTable)
      .where(eq(teamMeetingsTable.id, meetingId));
    if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }

    const [row] = await db.insert(iepMeetingAttendeesTable).values({
      meetingId,
      staffId: body.staffId ? Number(body.staffId) : null,
      name: body.name,
      role: body.role,
      email: body.email ?? null,
      isRequired: body.isRequired !== false,
    }).returning();

    logAudit(req, { action: "create", targetTable: "iep_meeting_attendees", targetId: row.id, summary: `Added attendee ${body.name} to meeting #${meetingId}` });
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: unknown) {
    console.error("POST attendees error:", e);
    res.status(500).json({ error: "Failed to add attendee" });
  }
});

router.patch("/iep-meetings/attendees/:id", meetingAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid attendee ID" }); return; }

    const allowed = [
      "attended", "submittedWrittenInput", "writtenInputNotes",
      "arrivalTime", "departureTime", "rsvpStatus",
    ];
    const updates = pick(req.body, allowed);
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const [row] = await db.update(iepMeetingAttendeesTable)
      .set(updates)
      .where(eq(iepMeetingAttendeesTable.id, id))
      .returning();

    if (!row) { res.status(404).json({ error: "Attendee not found" }); return; }

    logAudit(req, { action: "update", targetTable: "iep_meeting_attendees", targetId: id, summary: `Updated attendee #${id}` });
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: unknown) {
    console.error("PATCH attendees/:id error:", e);
    res.status(500).json({ error: "Failed to update attendee" });
  }
});

router.delete("/iep-meetings/attendees/:id", meetingAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid attendee ID" }); return; }

    const [row] = await db.delete(iepMeetingAttendeesTable).where(eq(iepMeetingAttendeesTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Attendee not found" }); return; }

    logAudit(req, { action: "delete", targetTable: "iep_meeting_attendees", targetId: id, summary: `Removed attendee #${id} from meeting #${row.meetingId}` });
    res.json({ success: true });
  } catch (e: unknown) {
    console.error("DELETE attendees/:id error:", e);
    res.status(500).json({ error: "Failed to delete attendee" });
  }
});

export default router;
