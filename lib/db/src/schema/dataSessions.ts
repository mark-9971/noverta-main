import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";

export const dataSessionsTable = pgTable("data_sessions", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  staffId: integer("staff_id").references(() => staffTable.id),
  sessionDate: text("session_date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("ds_student_date_idx").on(table.studentId, table.sessionDate),
]);

export const insertDataSessionSchema = createInsertSchema(dataSessionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDataSession = z.infer<typeof insertDataSessionSchema>;
export type DataSession = typeof dataSessionsTable.$inferSelect;
