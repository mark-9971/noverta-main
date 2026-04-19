import { pgTable, serial, integer, text, timestamp, jsonb, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { districtsTable } from "./districts";

/**
 * Pilot renewal decision. Captured when a district admin completes the day-60
 * Pilot Decision page (exit survey + outcome). Exactly one decision per
 * district — once recorded, the decision sticks (the banner stops showing
 * and the page becomes read-only) until the account manager opens a new
 * pilot. Re-evaluating renewal post-conversion happens through the regular
 * billing flow, not here.
 */
export const pilotDecisionOutcomeEnum = pgEnum("pilot_decision_outcome", [
  "renew",
  "request_changes",
  "decline",
]);

export const pilotDecisionsTable = pgTable("pilot_decisions", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id, { onDelete: "cascade" }),
  outcome: pilotDecisionOutcomeEnum("outcome").notNull(),
  /**
   * Free-form survey answers keyed by question id. Shape is owned by the
   * client — we accept whatever the page submits so survey copy can iterate
   * without a schema migration. See artifacts/trellis/src/pages/pilot-decision.tsx
   * for the canonical question set.
   */
  surveyResponses: jsonb("survey_responses").$type<Record<string, unknown>>().notNull().default({}),
  /** Optional note (required for "request_changes" and "decline" by the route handler). */
  reasonNote: text("reason_note"),
  /** Clerk user id of the admin who submitted the decision. */
  decidedByUserId: text("decided_by_user_id").notNull(),
  /** Display name captured at submission time so audit trail survives staff churn. */
  decidedByName: text("decided_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("pilot_decisions_district_unique").on(table.districtId),
]);

export const insertPilotDecisionSchema = createInsertSchema(pilotDecisionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPilotDecision = z.infer<typeof insertPilotDecisionSchema>;
export type PilotDecision = typeof pilotDecisionsTable.$inferSelect;
