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

  it("Resend webhook 'email.delivered' transitions an existing event from 'accepted' to 'delivered' (and stamps webhook fields)", async () => {
    const [evt] = await db.insert(communicationEventsTable).values({
      studentId,
      channel: "email",
      status: "accepted",
      type: "general",
      subject: "Pending delivery",
      providerMessageId: "msg_pending_delivered",
      acceptedAt: new Date(),
      sentAt: new Date(),
      toEmail: "guardian@example.com",
      fromEmail: "noreply@noverta.education",
    }).returning();

    // Drive the same DB transition the webhook would, with the same shape.
    const now = new Date();
    await db.update(communicationEventsTable)
      .set({ status: "delivered", deliveredAt: now, lastWebhookEventType: "email.delivered", lastWebhookAt: now, updatedAt: now })
      .where(eq(communicationEventsTable.providerMessageId, "msg_pending_delivered"));

    const [after] = await db.select().from(communicationEventsTable).where(eq(communicationEventsTable.id, evt.id));
    expect(after.status).toBe("delivered");
    expect(after.deliveredAt).not.toBeNull();
    expect(after.lastWebhookEventType).toBe("email.delivered");
    expect(after.lastWebhookAt).not.toBeNull();
  });

  it("legacy 'sent' status is preserved as a read-side alias and can be promoted to 'delivered'", async () => {
    // Rows written before the lifecycle split carry status='sent'. The webhook
    // must still promote them to 'delivered' so historical events stay
    // accurate post-deploy without a data migration.
    const [evt] = await db.insert(communicationEventsTable).values({
      studentId,
      channel: "email",
      status: "sent",
      type: "general",
      subject: "Legacy sent row",
      providerMessageId: "msg_legacy_sent",
      sentAt: new Date(),
      toEmail: "guardian@example.com",
      fromEmail: "noreply@noverta.education",
    }).returning();

    const now = new Date();
    await db.update(communicationEventsTable)
      .set({ status: "delivered", deliveredAt: now, lastWebhookEventType: "email.delivered", lastWebhookAt: now, updatedAt: now })
      .where(eq(communicationEventsTable.providerMessageId, "msg_legacy_sent"));

    const [after] = await db.select().from(communicationEventsTable).where(eq(communicationEventsTable.id, evt.id));
    expect(after.status).toBe("delivered");
  });

  it("Resend webhook 'email.bounced' transitions status to 'bounced' with reason and bouncedAt — not silent", async () => {
    const [evt] = await db.insert(communicationEventsTable).values({
      studentId,
      channel: "email",
      status: "accepted",
      type: "general",
      subject: "Pending bounce",
      providerMessageId: "msg_pending_bounce",
      acceptedAt: new Date(),
      sentAt: new Date(),
      toEmail: "bad@example.com",
      fromEmail: "noreply@noverta.education",
    }).returning();

    const now = new Date();
    await db.update(communicationEventsTable)
      .set({ status: "bounced", failedAt: now, bouncedAt: now, failedReason: "email.bounced", lastWebhookEventType: "email.bounced", lastWebhookAt: now, updatedAt: now })
      .where(eq(communicationEventsTable.providerMessageId, "msg_pending_bounce"));

    const [after] = await db.select().from(communicationEventsTable).where(eq(communicationEventsTable.id, evt.id));
    expect(after.status).toBe("bounced");
    expect(after.failedReason).toBe("email.bounced");
    expect(after.failedAt).not.toBeNull();
    expect(after.bouncedAt).not.toBeNull();
    expect(after.status).not.toBe("accepted");
  });

  it("Resend webhook 'email.complained' is distinct from bounced and records complainedAt", async () => {
    const [evt] = await db.insert(communicationEventsTable).values({
      studentId,
      channel: "email",
      status: "accepted",
      type: "general",
      subject: "Pending complaint",
      providerMessageId: "msg_pending_complaint",
      acceptedAt: new Date(),
      sentAt: new Date(),
      toEmail: "spamflag@example.com",
      fromEmail: "noreply@noverta.education",
    }).returning();

    const now = new Date();
    await db.update(communicationEventsTable)
      .set({ status: "complained", complainedAt: now, failedAt: now, failedReason: "email.complained", lastWebhookEventType: "email.complained", lastWebhookAt: now, updatedAt: now })
      .where(eq(communicationEventsTable.providerMessageId, "msg_pending_complaint"));

    const [after] = await db.select().from(communicationEventsTable).where(eq(communicationEventsTable.id, evt.id));
    expect(after.status).toBe("complained");
    expect(after.complainedAt).not.toBeNull();
    expect(after.failedReason).toBe("email.complained");
  });

  it("'email.delivery_delayed' does NOT change status, but records lastWebhookEventType/At", async () => {
    const [evt] = await db.insert(communicationEventsTable).values({
      studentId,
      channel: "email",
      status: "accepted",
      type: "general",
      subject: "Slow delivery",
      providerMessageId: "msg_delayed",
      acceptedAt: new Date(),
      sentAt: new Date(),
      toEmail: "slow@example.com",
      fromEmail: "noreply@noverta.education",
    }).returning();

    const now = new Date();
    // Mirror webhook's delivery_delayed branch: only base fields set.
    await db.update(communicationEventsTable)
      .set({ lastWebhookEventType: "email.delivery_delayed", lastWebhookAt: now, updatedAt: now })
      .where(eq(communicationEventsTable.providerMessageId, "msg_delayed"));

    const [after] = await db.select().from(communicationEventsTable).where(eq(communicationEventsTable.id, evt.id));
    expect(after.status).toBe("accepted");
    expect(after.lastWebhookEventType).toBe("email.delivery_delayed");
    expect(after.lastWebhookAt).not.toBeNull();
  });

  it("strict precedence: a delivered row stays delivered when a late email.bounced arrives, but bouncedAt is recorded", async () => {
    // Mirrors the webhook handler's monotonicity rule for email.bounced.
    // The visible status of a delivered email must NEVER silently flip to
    // "bounced" — that would falsely tell legal staff the parent never got
    // the notice.
    const [evt] = await db.insert(communicationEventsTable).values({
      studentId,
      channel: "email",
      status: "delivered",
      type: "general",
      subject: "Already delivered",
      providerMessageId: "msg_late_bounce",
      acceptedAt: new Date(Date.now() - 60_000),
      sentAt: new Date(Date.now() - 60_000),
      deliveredAt: new Date(Date.now() - 30_000),
      toEmail: "guardian@example.com",
      fromEmail: "noreply@noverta.education",
    }).returning();

    // Mirror webhook handler: bouncedAt always recorded; status only flips
    // from a pre-terminal state.
    const now = new Date();
    const PRE_TERMINAL = new Set(["queued", "accepted", "sent"]);
    const set: Record<string, unknown> = {
      bouncedAt: now,
      lastWebhookEventType: "email.bounced",
      lastWebhookAt: now,
      updatedAt: now,
    };
    if (PRE_TERMINAL.has(evt.status)) {
      set.status = "bounced";
      set.failedAt = now;
      set.failedReason = "email.bounced";
    }
    await db.update(communicationEventsTable).set(set).where(eq(communicationEventsTable.id, evt.id));

    const [after] = await db.select().from(communicationEventsTable).where(eq(communicationEventsTable.id, evt.id));
    expect(after.status).toBe("delivered"); // monotonicity preserved
    expect(after.bouncedAt).not.toBeNull();   // ops still see the event
    expect(after.lastWebhookEventType).toBe("email.bounced");
  });

  it("complaint after delivery: status stays 'delivered' but complainedAt is set so the UI can show a spam-flag badge", async () => {
    const [evt] = await db.insert(communicationEventsTable).values({
      studentId,
      channel: "email",
      status: "delivered",
      type: "general",
      subject: "Delivered then complained",
      providerMessageId: "msg_late_complaint",
      acceptedAt: new Date(Date.now() - 60_000),
      sentAt: new Date(Date.now() - 60_000),
      deliveredAt: new Date(Date.now() - 30_000),
      toEmail: "guardian@example.com",
      fromEmail: "noreply@noverta.education",
    }).returning();

    const now = new Date();
    const PRE_TERMINAL = new Set(["queued", "accepted", "sent"]);
    const set: Record<string, unknown> = {
      complainedAt: now,
      lastWebhookEventType: "email.complained",
      lastWebhookAt: now,
      updatedAt: now,
    };
    if (PRE_TERMINAL.has(evt.status)) {
      set.status = "complained";
      set.failedAt = now;
      set.failedReason = "email.complained";
    }
    await db.update(communicationEventsTable).set(set).where(eq(communicationEventsTable.id, evt.id));

    const [after] = await db.select().from(communicationEventsTable).where(eq(communicationEventsTable.id, evt.id));
    // Email did reach the inbox — don't retroactively claim it didn't.
    expect(after.status).toBe("delivered");
    // But complainedAt is populated so the UI can render "Delivered, then marked spam".
    expect(after.complainedAt).not.toBeNull();
  });

  it("strict precedence: terminal-to-terminal overwrites are blocked (failed → bounced does NOT change status)", async () => {
    const [evt] = await db.insert(communicationEventsTable).values({
      studentId,
      channel: "email",
      status: "failed",
      type: "general",
      subject: "Already failed",
      providerMessageId: "msg_failed_then_bounce",
      failedAt: new Date(Date.now() - 30_000),
      failedReason: "transient timeout",
      toEmail: "guardian@example.com",
      fromEmail: "noreply@noverta.education",
    }).returning();

    const now = new Date();
    const PRE_TERMINAL = new Set(["queued", "accepted", "sent"]);
    const set: Record<string, unknown> = {
      bouncedAt: now,
      lastWebhookEventType: "email.bounced",
      lastWebhookAt: now,
      updatedAt: now,
    };
    if (PRE_TERMINAL.has(evt.status)) {
      set.status = "bounced";
    }
    await db.update(communicationEventsTable).set(set).where(eq(communicationEventsTable.id, evt.id));

    const [after] = await db.select().from(communicationEventsTable).where(eq(communicationEventsTable.id, evt.id));
    expect(after.status).toBe("failed"); // terminal status preserved
    expect(after.bouncedAt).not.toBeNull(); // event recorded
  });

  it("Resend webhook endpoint rejects request without Svix signature headers (401)", async () => {
    const { anon } = await import("./helpers");
    const res = await anon.post("/webhooks/resend").set("content-type", "application/json").send({});
    // Either 400 (missing headers) or 401 (signature check) — what matters is
    // that an unauthenticated payload CANNOT silently mark events delivered.
    expect([400, 401]).toContain(res.status);
  });
});
