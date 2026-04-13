import { pgTable, text, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const missedReasonsTable = pgTable("missed_reasons", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  category: text("category").notNull(), // student_absence | staff_absence | scheduling | illness | other
});

export const insertMissedReasonSchema = createInsertSchema(missedReasonsTable).omit({ id: true });
export type InsertMissedReason = z.infer<typeof insertMissedReasonSchema>;
export type MissedReason = typeof missedReasonsTable.$inferSelect;
