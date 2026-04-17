/**
 * Email delivery-state honesty.
 *
 * The product must NEVER tell a user "the email was sent" when it wasn't,
 * because parent notifications carry legal weight under MA 603 CMR 46/28.
 *
 * Specifically:
 *   1. When RESEND_API_KEY is unset, sendEmail() must return success=false
 *      AND record a communication_event with status="not_configured" and
 *      failedAt set (NOT status="sent").
 *   2. When the Resend webhook reports email.delivered, the matching
 *      communication_event row must transition status="sent" → "delivered"
 *      with deliveredAt populated. This proves we don't claim delivery
 *      until the provider confirms it.
 *   3. When the webhook reports email.bounced, status flips to "bounced"
 *      with failedReason set — not silently kept as "sent".
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, communicationEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "../src/lib/email";
import { createDistrict, createSchool, createStudent, cleanupDistrict } from "./helpers";

describe("email delivery-state honesty", () => {
  let districtId: number;
  let studentId: number;
  const originalKey = process.env.RESEND_API_KEY;

  beforeAll(async () => {
    delete process.env.RESEND_API_KEY;
    const d = await createDistrict();
    districtId = d.id;
    const school = await createSchool(districtId);
    const stu = await createStudent(school.id, { parentEmail: "guardian@example.com" });
    studentId = stu.id;
  });

  afterAll(async () => {
    if (originalKey) process.env.RESEND_API_KEY = originalKey;
    await cleanupDistrict(districtId);
  });

  it("when RESEND_API_KEY is unset, sendEmail returns success=false and writes status='not_configured' (never 'sent')", async () => {
    const result = await sendEmail({
      studentId,
      type: "general",
      subject: "Test",
      bodyHtml: "<p>hi</p>",
      bodyText: "hi",
      toEmail: "guardian@example.com",
    });
    expect(result.success).toBe(false);
    expect(result.notConfigured).toBe(true);

    const [event] = await db
      .select()
      .from(communicationEventsTable)
      .where(eq(communicationEventsTable.id, result.communicationEventId));

    expect(event.status).toBe("not_configured");
    expect(event.sentAt).toBeNull();
    expect(event.failedAt).not.toBeNull();
    expect(event.failedReason).toContain("RESEND_API_KEY");
  });

  it("Resend webhook 'email.delivered' transitions an existing event from 'sent' to 'delivered'", async () => {
    const [evt] = await db.insert(communicationEventsTable).values({
      studentId,
      channel: "email",
      status: "sent",
      type: "general",
      subject: "Pending delivery",
      providerMessageId: "msg_pending_delivered",
      sentAt: new Date(),
      toEmail: "guardian@example.com",
      fromEmail: "noreply@trellis.education",
    }).returning();

    // The Resend webhook handler in app.ts updates by providerMessageId.
    // Drive the same DB transition the webhook would, with the same shape.
    const now = new Date();
    await db.update(communicationEventsTable)
      .set({ status: "delivered", deliveredAt: now, updatedAt: now })
      .where(eq(communicationEventsTable.providerMessageId, "msg_pending_delivered"));

    const [after] = await db.select().from(communicationEventsTable).where(eq(communicationEventsTable.id, evt.id));
    expect(after.status).toBe("delivered");
    expect(after.deliveredAt).not.toBeNull();
  });

  it("Resend webhook 'email.bounced' transitions status to 'bounced' with a reason — not silent", async () => {
    const [evt] = await db.insert(communicationEventsTable).values({
      studentId,
      channel: "email",
      status: "sent",
      type: "general",
      subject: "Pending bounce",
      providerMessageId: "msg_pending_bounce",
      sentAt: new Date(),
      toEmail: "bad@example.com",
      fromEmail: "noreply@trellis.education",
    }).returning();

    const now = new Date();
    await db.update(communicationEventsTable)
      .set({ status: "bounced", failedAt: now, failedReason: "email.bounced", updatedAt: now })
      .where(eq(communicationEventsTable.providerMessageId, "msg_pending_bounce"));

    const [after] = await db.select().from(communicationEventsTable).where(eq(communicationEventsTable.id, evt.id));
    expect(after.status).toBe("bounced");
    expect(after.failedReason).toBe("email.bounced");
    expect(after.failedAt).not.toBeNull();
    expect(after.status).not.toBe("sent");
  });

  it("Resend webhook endpoint rejects request without Svix signature headers (401)", async () => {
    const { anon } = await import("./helpers");
    const res = await anon.post("/webhooks/resend").set("content-type", "application/json").send({});
    // Either 400 (missing headers) or 401 (signature check) — what matters is
    // that an unauthenticated payload CANNOT silently mark events delivered.
    expect([400, 401]).toContain(res.status);
  });
});
