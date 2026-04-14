import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";

export const shareLinksTable = pgTable("share_links", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  summary: text("summary").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sl_token_hash_idx").on(table.tokenHash),
  index("sl_student_idx").on(table.studentId),
  index("sl_expires_idx").on(table.expiresAt),
]);

export type ShareLink = typeof shareLinksTable.$inferSelect;
