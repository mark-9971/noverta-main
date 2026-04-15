import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { transitionPlansTable } from "./transitionPlans";

export const transitionAgencyReferralsTable = pgTable("transition_agency_referrals", {
  id: serial("id").primaryKey(),
  transitionPlanId: integer("transition_plan_id").notNull().references(() => transitionPlansTable.id),
  agencyName: text("agency_name").notNull(),
  agencyType: text("agency_type"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  referralDate: text("referral_date").notNull(),
  status: text("status").notNull().default("pending"),
  followUpDate: text("follow_up_date"),
  outcome: text("outcome"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("tar_plan_idx").on(table.transitionPlanId),
  index("tar_status_idx").on(table.status),
  index("tar_followup_idx").on(table.followUpDate),
]);

export const insertTransitionAgencyReferralSchema = createInsertSchema(transitionAgencyReferralsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransitionAgencyReferral = z.infer<typeof insertTransitionAgencyReferralSchema>;
export type TransitionAgencyReferral = typeof transitionAgencyReferralsTable.$inferSelect;
