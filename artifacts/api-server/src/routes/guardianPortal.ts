import { Router, type Request, type Response } from "express";
import { db, guardiansTable, studentsTable, generatedDocumentsTable, documentAcknowledgmentsTable, communicationEventsTable, parentContactsTable, teamMeetingsTable } from "@workspace/db";
import { eq, and, desc, gte, inArray } from "drizzle-orm";
import { requireGuardianScope } from "../middlewares/auth";
import { getClientIp } from "../lib/clientIp";
import type { AuthedRequest } from "../middlewares/auth";

const router = Router();
// allow-bare-mw: entire router is the guardian portal; every route here is
// exclusively for authenticated guardians. requireGuardianScope enforces the
// guardian-JWT tenant boundary on all routes in this module.
router.use(requireGuardianScope);

/** Resolve the guardian record and their linked student from the auth token. */
async function resolveGuardian(req: Request): Promise<{ guardian: typeof guardiansTable.$inferSelect; studentId: number } | null> {
  const authed = req as AuthedRequest;
  const guardianId = authed.tenantGuardianId!;

  const [guardian] = await db
    .select()
    .from(guardiansTable)
    .where(eq(guardiansTable.id, guardianId));

  if (!guardian) return null;
  return { guardian, studentId: guardian.studentId };
}

/**
 * GET /guardian-portal/me
 * Returns the guardian's profile and their linked student's basic info.
 */
router.get("/me", async (req: Request, res: Response) => {
  try {
    const resolved = await resolveGuardian(req);
    if (!resolved) {
      res.status(404).json({ error: "Guardian account not found. Contact your district administrator." });
      return;
    }
    const { guardian, studentId } = resolved;
    const [student] = await db
      .select({
        id: studentsTable.id,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
        grade: studentsTable.grade,
      })
      .from(studentsTable)
      .where(eq(studentsTable.id, studentId));

    // Return a minimal guardian projection — no internal metadata.
    res.json({
      guardian: {
        id: guardian.id,
        name: guardian.name,
        relationship: guardian.relationship,
        email: guardian.email,
      },
      student: student ?? null,
    });
  } catch (err) {
    console.error("GET /guardian-portal/me error:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

/**
 * GET /guardian-portal/documents
 * Returns all documents shared with this guardian's student (guardian_visible = true).
 * Includes acknowledgment status for this guardian.
 */
router.get("/documents", async (req: Request, res: Response) => {
  try {
    const resolved = await resolveGuardian(req);
    if (!resolved) { res.status(404).json({ error: "Guardian not found" }); return; }
    const { guardian, studentId } = resolved;

    const docs = await db
      .select()
      .from(generatedDocumentsTable)
      .where(and(
        eq(generatedDocumentsTable.studentId, studentId),
        eq(generatedDocumentsTable.guardianVisible, true),
      ))
      .orderBy(desc(generatedDocumentsTable.sharedAt));

    if (docs.length === 0) {
      res.json({ documents: [] });
      return;
    }

    const docIds = docs.map(d => d.id);
    const acks = await db
      .select({
        documentId: documentAcknowledgmentsTable.documentId,
        acknowledgedAt: documentAcknowledgmentsTable.acknowledgedAt,
      })
      .from(documentAcknowledgmentsTable)
      .where(and(
        eq(documentAcknowledgmentsTable.guardianId, guardian.id),
        inArray(documentAcknowledgmentsTable.documentId, docIds),
      ));

    const ackMap = new Map<number, string>(
      acks.map(a => [a.documentId, a.acknowledgedAt.toISOString()])
    );

    const enriched = docs.map(d => ({
      id: d.id,
      title: d.title,
      type: d.type,
      status: d.status,
      sharedAt: d.sharedAt,
      sharedByName: d.sharedByName,
      createdAt: d.createdAt,
      hasHtml: !!d.htmlSnapshot,
      acknowledgedAt: ackMap.get(d.id) ?? null,
    }));

    res.json({ documents: enriched });
  } catch (err) {
    console.error("GET /guardian-portal/documents error:", err);
    res.status(500).json({ error: "Failed to load documents" });
  }
});

/**
 * GET /guardian-portal/documents/:id/view
 * Returns the HTML snapshot of a shared document (for in-portal reading / print).
 */
router.get("/documents/:id/view", async (req: Request, res: Response) => {
  try {
    const resolved = await resolveGuardian(req);
    if (!resolved) { res.status(404).json({ error: "Guardian not found" }); return; }
    const { studentId } = resolved;

    const docId = Number(req.params.id);
    if (isNaN(docId)) { res.status(400).json({ error: "Invalid document id" }); return; }

    const [doc] = await db
      .select()
      .from(generatedDocumentsTable)
      .where(and(
        eq(generatedDocumentsTable.id, docId),
        eq(generatedDocumentsTable.studentId, studentId),
        eq(generatedDocumentsTable.guardianVisible, true),
      ));

    if (!doc) { res.status(404).json({ error: "Document not found or not shared" }); return; }

    res.json({
      id: doc.id,
      title: doc.title,
      type: doc.type,
      htmlSnapshot: doc.htmlSnapshot ?? null,
      sharedAt: doc.sharedAt,
      sharedByName: doc.sharedByName,
    });
  } catch (err) {
    console.error("GET /guardian-portal/documents/:id/view error:", err);
    res.status(500).json({ error: "Failed to load document" });
  }
});

/**
 * POST /guardian-portal/documents/:id/acknowledge
 * Records the guardian's receipt acknowledgment for a document.
 * Idempotent — re-acknowledging is allowed (returns existing timestamp).
 */
router.post("/documents/:id/acknowledge", async (req: Request, res: Response) => {
  try {
    const resolved = await resolveGuardian(req);
    if (!resolved) { res.status(404).json({ error: "Guardian not found" }); return; }
    const { guardian, studentId } = resolved;

    const docId = Number(req.params.id);
    if (isNaN(docId)) { res.status(400).json({ error: "Invalid document id" }); return; }

    const [doc] = await db
      .select({ id: generatedDocumentsTable.id, title: generatedDocumentsTable.title })
      .from(generatedDocumentsTable)
      .where(and(
        eq(generatedDocumentsTable.id, docId),
        eq(generatedDocumentsTable.studentId, studentId),
        eq(generatedDocumentsTable.guardianVisible, true),
      ));

    if (!doc) { res.status(404).json({ error: "Document not found or not shared" }); return; }

    const ipAddress = getClientIp(req);

    // Upsert — unique constraint on (document_id, guardian_id) prevents duplicates.
    // ON CONFLICT DO NOTHING + returning() returns the existing row if already acknowledged.
    const inserted = await db.insert(documentAcknowledgmentsTable).values({
      documentId: docId,
      guardianId: guardian.id,
      ipAddress,
    }).onConflictDoNothing().returning();

    const alreadyAcknowledged = inserted.length === 0;

    // Fetch the acknowledgment row (existing or newly inserted)
    const [ack] = alreadyAcknowledged
      ? await db.select().from(documentAcknowledgmentsTable)
          .where(and(
            eq(documentAcknowledgmentsTable.documentId, docId),
            eq(documentAcknowledgmentsTable.guardianId, guardian.id),
          )).limit(1)
      : inserted;

    if (!alreadyAcknowledged) {
      await db.insert(communicationEventsTable).values({
        studentId,
        guardianId: guardian.id,
        type: "document_acknowledgment",
        channel: "portal",
        status: "sent",
        subject: `Guardian acknowledged: ${doc.title}`,
        metadata: { documentId: docId, documentTitle: doc.title, guardianId: guardian.id },
      });
    }

    res.json({ acknowledgedAt: ack.acknowledgedAt, alreadyAcknowledged });
  } catch (err) {
    console.error("POST /guardian-portal/documents/:id/acknowledge error:", err);
    res.status(500).json({ error: "Failed to record acknowledgment" });
  }
});

/**
 * GET /guardian-portal/meetings
 * Returns upcoming and recent IEP team meetings for the guardian's student.
 */
router.get("/meetings", async (req: Request, res: Response) => {
  try {
    const resolved = await resolveGuardian(req);
    if (!resolved) { res.status(404).json({ error: "Guardian not found" }); return; }
    const { studentId } = resolved;

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const meetings = await db
      .select({
        id: teamMeetingsTable.id,
        meetingType: teamMeetingsTable.meetingType,
        scheduledDate: teamMeetingsTable.scheduledDate,
        scheduledTime: teamMeetingsTable.scheduledTime,
        status: teamMeetingsTable.status,
        location: teamMeetingsTable.location,
        minutesFinalized: teamMeetingsTable.minutesFinalized,
      })
      .from(teamMeetingsTable)
      .where(and(
        eq(teamMeetingsTable.studentId, studentId),
        gte(teamMeetingsTable.scheduledDate, threeMonthsAgo.toISOString().substring(0, 10)),
      ))
      .orderBy(desc(teamMeetingsTable.scheduledDate));

    res.json({ meetings });
  } catch (err) {
    console.error("GET /guardian-portal/meetings error:", err);
    res.status(500).json({ error: "Failed to load meetings" });
  }
});

/**
 * GET /guardian-portal/contact-history
 * Returns the parent contact log for the guardian's student (read-only).
 * Returns last 50 contacts in reverse chronological order.
 */
router.get("/contact-history", async (req: Request, res: Response) => {
  try {
    const resolved = await resolveGuardian(req);
    if (!resolved) { res.status(404).json({ error: "Guardian not found" }); return; }
    const { studentId } = resolved;

    const contacts = await db
      .select({
        id: parentContactsTable.id,
        contactType: parentContactsTable.contactType,
        contactDate: parentContactsTable.contactDate,
        contactMethod: parentContactsTable.contactMethod,
        subject: parentContactsTable.subject,
        outcome: parentContactsTable.outcome,
        contactedBy: parentContactsTable.contactedBy,
      })
      .from(parentContactsTable)
      .where(eq(parentContactsTable.studentId, studentId))
      .orderBy(desc(parentContactsTable.contactDate))
      .limit(50);

    res.json({ contacts });
  } catch (err) {
    console.error("GET /guardian-portal/contact-history error:", err);
    res.status(500).json({ error: "Failed to load contact history" });
  }
});

export default router;
