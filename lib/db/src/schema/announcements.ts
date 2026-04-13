import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { classesTable } from "./classes";
import { staffTable } from "./staff";

export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").references(() => classesTable.id),
  authorId: integer("author_id").references(() => staffTable.id).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  scope: text("scope").notNull().default("class"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("ann_class_idx").on(table.classId),
  index("ann_author_idx").on(table.authorId),
]);

export const insertAnnouncementSchema = createInsertSchema(announcementsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcementsTable.$inferSelect;
