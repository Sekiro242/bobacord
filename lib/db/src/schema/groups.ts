import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { usersTable } from "./users";

export const groupsTable = sqliteTable("groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdById: integer("created_by_id").notNull().references(() => usersTable.id),
  createdAt: text("created_at").default(new Date().toISOString()).notNull(),
});

export const groupMembersTable = sqliteTable("group_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: integer("group_id").notNull().references(() => groupsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
});

export type Group = typeof groupsTable.$inferSelect;
export type GroupMember = typeof groupMembersTable.$inferSelect;
