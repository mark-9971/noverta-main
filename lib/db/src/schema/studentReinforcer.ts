import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";
import { preferenceAssessmentsTable } from "./preferenceAssessments";

/**
 * Canonical category vocabulary shared with BIP ReinforcerType.
 * Reused here so that preference-assessment → inventory → BIP/ABA all speak
 * the same language without forced coupling.
 */
export const REINFORCER_CATEGORIES = [
  "tangible",   // objects, toys, tokens
  "edible",     // snacks, drinks
  "social",     // praise, high-five, attention
  "activity",   // preferred tasks, games, breaks
  "sensory",    // fidgets, music, movement
] as const;
export type ReinforcerCategory = typeof REINFORCER_CATEGORIES[number];

/**
 * student_reinforcers — the curated, living reinforcer inventory for a student.
 *
 * Design intent:
 *  - Entries are created manually OR seeded from a preference assessment item
 *    (sourceAssessmentId links back to the originating PA record).
 *  - `active` distinguishes currently-effective reinforcers from ones that have
 *    lost their effectiveness over time (historical record preserved).
 *  - This table is intentionally thin — no FK into program_targets or BIPs —
 *    so it stays reusable across any context (runbook, ABA wizard, BIP editor).
 */
export const studentReinforcersTable = pgTable("student_reinforcers", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull().default("tangible"),
  notes: text("notes"),
  /** Whether this reinforcer is currently effective / in use */
  active: boolean("active").notNull().default(true),
  /**
   * Optional: which preference assessment first identified this reinforcer.
   * SET NULL on PA delete so the inventory item survives.
   */
  sourceAssessmentId: integer("source_assessment_id").references(
    () => preferenceAssessmentsTable.id,
    { onDelete: "set null" },
  ),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StudentReinforcer = typeof studentReinforcersTable.$inferSelect;
export type NewStudentReinforcer = typeof studentReinforcersTable.$inferInsert;
