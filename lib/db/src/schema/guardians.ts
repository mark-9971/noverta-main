import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { studentsTable } from "./students";

export const guardiansTable = pgTable("guardians", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  relationship: text("relationship").notNull(),
  email: text("email"),
  phone: text("phone"),
  preferredContactMethod: text("preferred_contact_method").default("email"),
  contactPriority: integer("contact_priority").notNull().default(1),
  interpreterNeeded: boolean("interpreter_needed").default(false).notNull(),
  language: text("language"),
  notes: text("notes"),
  portalInvitedAt: timestamp("portal_invited_at", { withTimezone: true }),
  portalAcceptedAt: timestamp("portal_accepted_at", { withTimezone: true }),
  lastPortalLoginAt: timestamp("last_portal_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("guardians_student_idx").on(table.studentId),
]);

export const insertGuardianSchema = createInsertSchema(guardiansTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Guardian = typeof guardiansTable.$inferSelect;
