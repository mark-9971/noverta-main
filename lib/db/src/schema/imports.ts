import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const importsTable = pgTable("imports", {
  id: serial("id").primaryKey(),
  importType: text("import_type").notNull(), // students | requirements | sessions | para_schedules | provider_schedules
  fileName: text("file_name"),
  status: text("status").notNull().default("pending"), // pending | processing | completed | failed
  rowsProcessed: integer("rows_processed"),
  rowsImported: integer("rows_imported"),
  rowsErrored: integer("rows_errored"),
  errorSummary: text("error_summary"),
  columnMapping: text("column_mapping"), // JSON string
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertImportSchema = createInsertSchema(importsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertImport = z.infer<typeof insertImportSchema>;
export type Import = typeof importsTable.$inferSelect;
