import { pgTable, serial, text, boolean, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { districtsTable } from "./districts";

export const schoolYearsTable = pgTable("school_years", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("sy_district_idx").on(table.districtId),
  index("sy_active_idx").on(table.isActive),
  unique("sy_district_label_unique").on(table.districtId, table.label),
]);

export const insertSchoolYearSchema = createInsertSchema(schoolYearsTable).omit({ id: true, createdAt: true });
export type InsertSchoolYear = z.infer<typeof insertSchoolYearSchema>;
export type SchoolYear = typeof schoolYearsTable.$inferSelect;
