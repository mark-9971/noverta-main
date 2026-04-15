import { pgTable, serial, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agenciesTable } from "./agencies";
import { staffTable } from "./staff";

export const agencyStaffTable = pgTable("agency_staff", {
  id: serial("id").primaryKey(),
  agencyId: integer("agency_id").notNull().references(() => agenciesTable.id),
  staffId: integer("staff_id").notNull().references(() => staffTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("as_agency_idx").on(table.agencyId),
  index("as_staff_idx").on(table.staffId),
  uniqueIndex("as_agency_staff_uniq").on(table.agencyId, table.staffId),
]);

export const insertAgencyStaffSchema = createInsertSchema(agencyStaffTable).omit({ id: true, createdAt: true });
export type InsertAgencyStaff = z.infer<typeof insertAgencyStaffSchema>;
export type AgencyStaff = typeof agencyStaffTable.$inferSelect;
