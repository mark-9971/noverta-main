import { pgTable, serial, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agencyContractsTable } from "./agencyContracts";
import { sessionLogsTable } from "./sessionLogs";

export const contractSessionLinksTable = pgTable("contract_session_links", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => agencyContractsTable.id),
  sessionLogId: integer("session_log_id").notNull().references(() => sessionLogsTable.id),
  attributedMinutes: integer("attributed_minutes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("csl_contract_idx").on(table.contractId),
  uniqueIndex("csl_unique_session").on(table.sessionLogId),
]);

export const insertContractSessionLinkSchema = createInsertSchema(contractSessionLinksTable).omit({ id: true, createdAt: true });
export type InsertContractSessionLink = z.infer<typeof insertContractSessionLinkSchema>;
export type ContractSessionLink = typeof contractSessionLinksTable.$inferSelect;
