/**
 * Seed Overhaul V2 — Demo Readiness showcase cases (W5).
 *
 * The Demo Readiness Overlay (W5) selects-and-labels a curated set of
 * primitive-fact rows so the dashboard demo flow always lands on the
 * same pedagogical moments (one at-risk student, one scheduled-makeup
 * triumph, one chronic-miss case, etc.). It NEVER mutates the
 * primitive facts themselves — see `lib/db/src/v2/overlay/index.ts`.
 *
 * Each row is a pointer:
 *   - `category`         : one of the 8 canonical showcase buckets.
 *   - `subjectKind` + `subjectId`
 *                        : which primitive-fact row this case spotlights.
 *   - `payload`          : a JSON snapshot of the salient KPI numbers
 *                          that justified inclusion (delivered minutes,
 *                          shortfall, daysSinceAlert …) so the UI can
 *                          render a tile without having to re-derive
 *                          them.
 *   - `selectionOrder`   : 0-based ordinal within (districtId, runId,
 *                          category) so the UI shows the same case
 *                          first across reloads.
 *   - `runId`            : the SeedRunMetadata.runId that produced
 *                          this row (so a re-run can supersede the
 *                          previous selection cleanly).
 */

import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { districtsTable } from "./districts";

export const demoShowcaseCasesTable = pgTable("demo_showcase_cases", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id, { onDelete: "cascade" }),
  /** SeedRunMetadata.runId of the overlay run that produced the row. */
  runId: text("run_id").notNull(),
  /** One of the 8 canonical buckets (see overlay/index.ts CATEGORIES). */
  category: text("category").notNull(),
  /** Stable kind tag (e.g. "alert", "session", "comp_obligation",
   *  "schedule_block", "student"). The overlay is restricted to a
   *  fixed vocabulary; readers can index without a join. */
  subjectKind: text("subject_kind").notNull(),
  /** Real DB primary key of the row this case points at. NOT a foreign
   *  key — the subject can be any of several tables — but the overlay
   *  guarantees the id is live at the time the case is written. */
  subjectId: integer("subject_id").notNull(),
  /** Optional human-readable headline (rendered in the demo tile). */
  headline: text("headline"),
  /** JSON payload with salient numbers that justified inclusion. */
  payload: jsonb("payload").notNull().default({}),
  /** 0-based ordinal within (districtId, runId, category). */
  selectionOrder: integer("selection_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("dsc_district_idx").on(table.districtId),
  index("dsc_district_category_idx").on(table.districtId, table.category),
  index("dsc_run_idx").on(table.districtId, table.runId),
  // A given overlay run never picks the same subject row twice for the
  // same category — guard at the DB level so a buggy selector cannot
  // emit duplicates that would skew dashboard counts.
  unique("dsc_unique_subject_per_run").on(
    table.districtId, table.runId, table.category, table.subjectKind, table.subjectId,
  ),
]);

export const insertDemoShowcaseCaseSchema = createInsertSchema(demoShowcaseCasesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDemoShowcaseCase = z.infer<typeof insertDemoShowcaseCaseSchema>;
export type DemoShowcaseCase = typeof demoShowcaseCasesTable.$inferSelect;
