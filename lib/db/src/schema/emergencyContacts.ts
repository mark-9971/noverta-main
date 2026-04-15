import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { studentsTable } from "./students";

export const emergencyContactsTable = pgTable("emergency_contacts", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  relationship: text("relationship").notNull(),
  phone: text("phone").notNull(),
  notes: text("notes"),
  priority: integer("priority").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("emergency_contacts_student_idx").on(table.studentId),
]);

export const insertEmergencyContactSchema = createInsertSchema(emergencyContactsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type EmergencyContact = typeof emergencyContactsTable.$inferSelect;
