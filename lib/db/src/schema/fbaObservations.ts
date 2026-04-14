import { pgTable, text, serial, timestamp, integer, index, date, time } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { fbasTable } from "./fbas";
import { staffTable } from "./staff";

export const fbaObservationsTable = pgTable("fba_observations", {
  id: serial("id").primaryKey(),
  fbaId: integer("fba_id").notNull().references(() => fbasTable.id),
  observerId: integer("observer_id").references(() => staffTable.id),
  observationDate: date("observation_date").notNull(),
  observationTime: time("observation_time"),
  durationMinutes: integer("duration_minutes"),
  setting: text("setting"),
  activity: text("activity"),
  antecedent: text("antecedent").notNull(),
  antecedentCategory: text("antecedent_category"),
  behavior: text("behavior").notNull(),
  behaviorIntensity: text("behavior_intensity"),
  behaviorDurationSeconds: integer("behavior_duration_seconds"),
  consequence: text("consequence").notNull(),
  consequenceCategory: text("consequence_category"),
  perceivedFunction: text("perceived_function"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("fba_obs_fba_idx").on(table.fbaId),
  index("fba_obs_date_idx").on(table.observationDate),
]);

export const insertFbaObservationSchema = createInsertSchema(fbaObservationsTable).omit({ id: true, createdAt: true });
export type InsertFbaObservation = z.infer<typeof insertFbaObservationSchema>;
export type FbaObservation = typeof fbaObservationsTable.$inferSelect;
