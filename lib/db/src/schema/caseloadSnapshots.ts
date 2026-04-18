import { pgTable, serial, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { districtsTable } from "./districts";
import { staffTable } from "./staff";

export const caseloadSnapshotsTable = pgTable("caseload_snapshots", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  weekStart: timestamp("week_start", { withTimezone: true, mode: "date" }).notNull(),
  studentCount: integer("student_count").notNull().default(0),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("cs_district_week_idx").on(table.districtId, table.weekStart),
  index("cs_staff_week_idx").on(table.staffId, table.weekStart),
  unique("cs_staff_week_unique").on(table.staffId, table.weekStart),
]);

export const insertCaseloadSnapshotSchema = createInsertSchema(caseloadSnapshotsTable).omit({ id: true, capturedAt: true });
export type InsertCaseloadSnapshot = z.infer<typeof insertCaseloadSnapshotSchema>;
export type CaseloadSnapshot = typeof caseloadSnapshotsTable.$inferSelect;
