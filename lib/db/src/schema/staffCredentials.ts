import { pgTable, serial, integer, text, date, timestamp } from "drizzle-orm/pg-core";
import { staffTable } from "./staff";

export const staffCredentialsTable = pgTable("staff_credentials", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  credentialType: text("credential_type").notNull(),
  issuingBody: text("issuing_body"),
  licenseNumber: text("license_number"),
  expirationDate: date("expiration_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type StaffCredential = typeof staffCredentialsTable.$inferSelect;
export type InsertStaffCredential = typeof staffCredentialsTable.$inferInsert;
