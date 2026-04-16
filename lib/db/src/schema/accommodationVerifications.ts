import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { iepAccommodationsTable } from "./iepAccommodations";
import { staffTable } from "./staff";

export const accommodationVerificationsTable = pgTable("accommodation_verifications", {
  id: serial("id").primaryKey(),
  accommodationId: integer("accommodation_id").notNull().references(() => iepAccommodationsTable.id, { onDelete: "cascade" }),
  verifiedByStaffId: integer("verified_by_staff_id").notNull().references(() => staffTable.id),
  status: text("status").notNull().default("verified"),
  notes: text("notes"),
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("av_accommodation_idx").on(table.accommodationId),
  index("av_staff_idx").on(table.verifiedByStaffId),
  index("av_created_idx").on(table.createdAt),
]);

export type AccommodationVerification = typeof accommodationVerificationsTable.$inferSelect;
