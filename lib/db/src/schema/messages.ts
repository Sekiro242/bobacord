import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { usersTable } from "./users";

export const messagesTable = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  content: text("content").notNull(),
  dmUserId: integer("dm_user_id").references(() => usersTable.id), // null for group messages
  groupId: integer("group_id"), // null for DMs
  createdAt: text("created_at").default(new Date().toISOString()).notNull(),
});

export type Message = typeof messagesTable.$inferSelect;
