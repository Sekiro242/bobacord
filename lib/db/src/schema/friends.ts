import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { usersTable } from "./users";

export const friendRequestsTable = sqliteTable("friend_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  receiverId: integer("receiver_id").notNull().references(() => usersTable.id),
  status: text("status").notNull().default("pending"), // pending | accepted
  createdAt: text("created_at").default(new Date().toISOString()).notNull(),
});

export type FriendRequest = typeof friendRequestsTable.$inferSelect;
