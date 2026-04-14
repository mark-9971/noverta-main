import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { staffTable } from "./staff";

export const supervisionSessionsTable = pgTable("supervision_sessions", {
  id: serial("id").primaryKey(),
  supervisorId: integer("supervisor_id").notNull().references(() => staffTable.id),
  superviseeId: integer("supervisee_id").notNull().references(() => staffTable.id),
  sessionDate: text("session_date").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  supervisionType: text("supervision_type").notNull(),
  topics: text("topics"),
  feedbackNotes: text("feedback_notes"),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("sup_supervisor_idx").on(table.supervisorId),
  index("sup_supervisee_idx").on(table.superviseeId),
  index("sup_date_idx").on(table.sessionDate),
  index("sup_type_idx").on(table.supervisionType),
]);

export const insertSupervisionSessionSchema = createInsertSchema(supervisionSessionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSupervisionSession = z.infer<typeof insertSupervisionSessionSchema>;
export type SupervisionSession = typeof supervisionSessionsTable.$inferSelect;
