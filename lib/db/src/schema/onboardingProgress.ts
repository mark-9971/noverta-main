import { pgTable, serial, text, boolean, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { districtsTable } from "./districts";

export const onboardingProgressTable = pgTable("onboarding_progress", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").references(() => districtsTable.id).notNull(),
  stepKey: text("step_key").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("onboarding_district_step_idx").on(table.districtId, table.stepKey),
]);
