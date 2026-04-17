import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { emergencyContactsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import { assertStudentAccess } from "../../lib/tenantAccess";
import type { AuthedRequest } from "../../middlewares/auth";
import { studentIdParamGuard } from "./idGuard";

// tenant-scope: district-join
const router: IRouter = Router();
router.param("id", studentIdParamGuard);

const EC_WRITE_ROLES = ["admin", "case_manager"] as const;
const EC_READ_ROLES = ["admin", "case_manager", "sped_teacher", "para", "provider", "coordinator", "bcba"] as const;

router.get("/students/:id/emergency-contacts", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_READ_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const studentId = Number(req.params.id);
  if (!studentId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await assertStudentAccess(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const contacts = await db
    .select()
    .from(emergencyContactsTable)
    .where(eq(emergencyContactsTable.studentId, studentId))
    .orderBy(emergencyContactsTable.priority, emergencyContactsTable.id);

  res.json(contacts.map(c => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })));
});

router.post("/students/:id/emergency-contacts", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_WRITE_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const studentId = Number(req.params.id);
  if (!studentId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await assertStudentAccess(req, studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const { firstName, lastName, relationship, phone, phoneSecondary, email, isAuthorizedForPickup, priority, notes } = req.body;
  if (!firstName || !lastName || !relationship || !phone) {
    res.status(400).json({ error: "firstName, lastName, relationship, and phone are required" }); return;
  }

  const [contact] = await db.insert(emergencyContactsTable).values({
    studentId,
    firstName,
    lastName,
    relationship,
    phone,
    phoneSecondary: phoneSecondary ?? null,
    email: email ?? null,
    isAuthorizedForPickup: isAuthorizedForPickup ?? false,
    priority: priority ?? 1,
    notes: notes ?? null,
  }).returning();

  logAudit(req, {
    action: "create",
    targetTable: "emergency_contacts",
    targetId: contact.id,
    studentId,
    summary: `Added emergency contact ${firstName} ${lastName} for student #${studentId}`,
    newValues: { firstName, lastName, relationship, phone } as Record<string, unknown>,
  });

  res.status(201).json({ ...contact, createdAt: contact.createdAt.toISOString(), updatedAt: contact.updatedAt.toISOString() });
});

router.patch("/emergency-contacts/:id", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_WRITE_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const contactId = Number(req.params.id);
  if (!contactId) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select({ studentId: emergencyContactsTable.studentId }).from(emergencyContactsTable).where(eq(emergencyContactsTable.id, contactId));
  if (!existing) { res.status(404).json({ error: "Emergency contact not found" }); return; }
  if (!await assertStudentAccess(req, existing.studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const { firstName, lastName, relationship, phone, phoneSecondary, email, isAuthorizedForPickup, priority, notes } = req.body;

  type ContactPatch = Partial<typeof emergencyContactsTable.$inferInsert>;
  const updates: ContactPatch = {};
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (relationship !== undefined) updates.relationship = relationship;
  if (phone !== undefined) updates.phone = phone;
  if (phoneSecondary !== undefined) updates.phoneSecondary = phoneSecondary;
  if (email !== undefined) updates.email = email;
  if (isAuthorizedForPickup !== undefined) updates.isAuthorizedForPickup = isAuthorizedForPickup;
  if (priority !== undefined) updates.priority = priority;
  if (notes !== undefined) updates.notes = notes;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  const [contact] = await db
    .update(emergencyContactsTable)
    .set(updates)
    .where(eq(emergencyContactsTable.id, contactId))
    .returning();

  if (!contact) { res.status(404).json({ error: "Emergency contact not found" }); return; }

  logAudit(req, {
    action: "update",
    targetTable: "emergency_contacts",
    targetId: contactId,
    studentId: contact.studentId,
    summary: `Updated emergency contact #${contactId}`,
    newValues: updates as Record<string, unknown>,
  });

  res.json({ ...contact, createdAt: contact.createdAt.toISOString(), updatedAt: contact.updatedAt.toISOString() });
});

router.delete("/emergency-contacts/:id", async (req, res): Promise<void> => {
  const role = (req as AuthedRequest).trellisRole;
  if (!(EC_WRITE_ROLES as readonly string[]).includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const contactId = Number(req.params.id);
  if (!contactId) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select({ studentId: emergencyContactsTable.studentId }).from(emergencyContactsTable).where(eq(emergencyContactsTable.id, contactId));
  if (!existing) { res.status(404).json({ error: "Emergency contact not found" }); return; }
  if (!await assertStudentAccess(req, existing.studentId)) { res.status(403).json({ error: "Access denied" }); return; }

  const [deleted] = await db
    .delete(emergencyContactsTable)
    .where(eq(emergencyContactsTable.id, contactId))
    .returning({ id: emergencyContactsTable.id, studentId: emergencyContactsTable.studentId });

  if (!deleted) { res.status(404).json({ error: "Emergency contact not found" }); return; }

  logAudit(req, {
    action: "delete",
    targetTable: "emergency_contacts",
    targetId: contactId,
    studentId: deleted.studentId,
    summary: `Deleted emergency contact #${contactId}`,
  });

  res.json({ success: true });
});

export default router;
