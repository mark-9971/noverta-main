import { pgTable, serial, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

export const demoReadinessRunsTable = pgTable("demo_readiness_runs", {
  id: serial("id").primaryKey(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  pass: integer("pass").notNull().default(0),
  warn: integer("warn").notNull().default(0),
  fail: integer("fail").notNull().default(0),
  total: integer("total").notNull().default(0),
  checks: jsonb("checks").notNull(),
}, (table) => [
  index("drr_generated_at_idx").on(table.generatedAt),
]);

export type DemoReadinessRun = typeof demoReadinessRunsTable.$inferSelect;
