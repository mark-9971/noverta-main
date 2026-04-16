import { pgTable, text, serial, timestamp, integer, index, date } from "drizzle-orm/pg-core";
import { behaviorInterventionPlansTable } from "./behaviorInterventionPlans";
import { staffTable } from "./staff";

export const bipFidelityLogsTable = pgTable("bip_fidelity_logs", {
  id: serial("id").primaryKey(),
  bipId: integer("bip_id").notNull().references(() => behaviorInterventionPlansTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").references(() => staffTable.id),
  logDate: date("log_date").notNull(),
  fidelityRating: integer("fidelity_rating"),
  studentResponse: text("student_response"),
  implementationNotes: text("implementation_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("bip_fidelity_logs_bip_idx").on(table.bipId),
  index("bip_fidelity_logs_date_idx").on(table.logDate),
]);

export type BipFidelityLog = typeof bipFidelityLogsTable.$inferSelect;
