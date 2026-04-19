import { pgTable, serial, text, integer, jsonb, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { districtsTable } from "./districts";

export const pilotFeedbackTypeEnum = pgEnum("pilot_feedback_type", [
  "bug",
  "suggestion",
  "question",
]);

export const pilotFeedbackStatusEnum = pgEnum("pilot_feedback_status", [
  "new",
  "triaged",
  "in_progress",
  "closed",
]);

export const pilotFeedbackTable = pgTable(
  "pilot_feedback",
  {
    id: serial("id").primaryKey(),
    districtId: integer("district_id").references(() => districtsTable.id, { onDelete: "set null" }),
    userId: text("user_id").notNull(),
    userEmail: text("user_email"),
    userRole: text("user_role"),
    userName: text("user_name"),
    type: pilotFeedbackTypeEnum("type").notNull(),
    description: text("description").notNull(),
    pageUrl: text("page_url"),
    userAgent: text("user_agent"),
    screenshotDataUrl: text("screenshot_data_url"),
    consoleErrors: jsonb("console_errors").$type<Array<{ at: string; message: string }>>(),
    extraContext: jsonb("extra_context").$type<Record<string, unknown>>(),
    status: pilotFeedbackStatusEnum("status").notNull().default("new"),
    triageNotes: text("triage_notes"),
    triagedByUserId: text("triaged_by_user_id"),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    emailNotifiedTo: text("email_notified_to"),
    emailNotifiedAt: timestamp("email_notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("pilot_feedback_district_id_idx").on(table.districtId),
    index("pilot_feedback_status_idx").on(table.status),
    index("pilot_feedback_created_at_idx").on(table.createdAt),
  ],
);

export const insertPilotFeedbackSchema = createInsertSchema(pilotFeedbackTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  triageNotes: true,
  triagedByUserId: true,
  triagedAt: true,
  emailNotifiedTo: true,
  emailNotifiedAt: true,
});
export type InsertPilotFeedback = z.infer<typeof insertPilotFeedbackSchema>;
export type PilotFeedback = typeof pilotFeedbackTable.$inferSelect;
