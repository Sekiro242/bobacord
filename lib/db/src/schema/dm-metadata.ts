import { sqliteTable, integer, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { usersTable } from "./users";

export const dmMetadataTable = sqliteTable(
  "dm_metadata",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    otherUserId: integer("other_user_id").notNull().references(() => usersTable.id),
    lastReadAt: text("last_read_at").notNull(),
  },
  (table) => ({
    userPairIdx: uniqueIndex("user_pair_idx").on(table.userId, table.otherUserId),
  })
);

export type DMMetadata = typeof dmMetadataTable.$inferSelect;
