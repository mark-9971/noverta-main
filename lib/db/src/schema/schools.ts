import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { districtsTable } from "./districts";

export const schoolsTable = pgTable("schools", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  district: text("district"),
  districtId: integer("district_id").references(() => districtsTable.id),
  // Schedule configuration
  // "standard" = Mon-Fri fixed | "ab_day" = alternating Day A / Day B
  // "rotating_4" = 4-day cycle (Day 1–4) | "rotating_6" = 6-day cycle (Day 1–6)
  scheduleType: text("schedule_type").notNull().default("standard"),
  rotationDays: integer("rotation_days"),           // null for standard; 2 for A/B; 4 or 6 for rotating
  rotationStartDate: text("rotation_start_date"),   // ISO date — Day 1 / Day A anchored here
  scheduleNotes: text("schedule_notes"),            // free-text for admins
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSchoolSchema = createInsertSchema(schoolsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSchool = z.infer<typeof insertSchoolSchema>;
export type School = typeof schoolsTable.$inferSelect;
