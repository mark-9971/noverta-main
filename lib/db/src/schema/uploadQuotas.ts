import { pgTable, serial, integer, date, bigint, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const uploadQuotasTable = pgTable("upload_quotas", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull(),
  quotaDate: date("quota_date").notNull(),
  uploadedBytes: bigint("uploaded_bytes", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("upload_quotas_district_date_idx").on(table.districtId, table.quotaDate),
  index("upload_quotas_district_idx").on(table.districtId),
]);

export type UploadQuota = typeof uploadQuotasTable.$inferSelect;
