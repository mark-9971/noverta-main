import { pgTable, text, serial, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { schoolsTable } from "./schools";

export const sisConnectionsTable = pgTable("sis_connections", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  label: text("label").notNull(),
  credentials: jsonb("credentials").$type<Record<string, unknown>>().notNull().default({}),
  schoolId: integer("school_id").references(() => schoolsTable.id),
  status: text("status").notNull().default("disconnected"),
  syncSchedule: text("sync_schedule").notNull().default("nightly"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSisConnectionSchema = createInsertSchema(sisConnectionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSisConnection = z.infer<typeof insertSisConnectionSchema>;
export type SisConnection = typeof sisConnectionsTable.$inferSelect;
