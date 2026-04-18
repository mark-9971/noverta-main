import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const rateLimitBucketsTable = pgTable("rate_limit_buckets", {
  bucketKey: text("bucket_key").primaryKey(),
  count: integer("count").notNull().default(1),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("rl_bucket_window_idx").on(table.windowStart),
]);

export type RateLimitBucket = typeof rateLimitBucketsTable.$inferSelect;
