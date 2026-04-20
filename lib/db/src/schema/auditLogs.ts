import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorUserId: text("actor_user_id").notNull(),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),
  targetTable: text("target_table").notNull(),
  targetId: text("target_id"),
  studentId: integer("student_id"),
  // Denormalized tenant scope. Populated at write-time from
  // req.tenantDistrictId (the authoritative source used by
  // getEnforcedDistrictId and view-as middleware). Nullable to tolerate
  // pre-scoping rows and truly unscoped writes (platform-admin / anonymous).
  // The /api/audit-logs read path filters strictly on this column for
  // district-admin callers — NULL rows are NOT returned to district admins.
  districtId: integer("district_id"),
  ipAddress: text("ip_address"),
  summary: text("summary"),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("audit_actor_idx").on(table.actorUserId),
  index("audit_action_idx").on(table.action),
  index("audit_target_idx").on(table.targetTable, table.targetId),
  index("audit_target_created_idx").on(table.targetTable, table.targetId, table.createdAt),
  index("audit_student_idx").on(table.studentId),
  index("audit_created_idx").on(table.createdAt),
  index("audit_district_created_idx").on(table.districtId, table.createdAt),
]);

export type AuditLog = typeof auditLogsTable.$inferSelect;
