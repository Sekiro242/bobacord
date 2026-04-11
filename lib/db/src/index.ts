import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database("sqlite.db");

// Simple initialization for SQLite
try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      bio TEXT,
      created_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'
    );
  `);
} catch (err) {
  console.error("Error creating users table:", err);
}

try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN bio TEXT;`);
} catch (e: any) {
  if (!e.message.includes("duplicate column name")) {
    console.warn("Notice: could not add bio column to users:", e.message);
  }
}

try {
  // Make it nullable to avoid restriction on NOT NULL + DEFAULT
  sqlite.exec(`ALTER TABLE group_members ADD COLUMN last_read_at TEXT;`);
} catch (e: any) {
  if (!e.message.includes("duplicate column name") && !e.message.includes("no such table")) {
    console.warn("Notice: could not add last_read_at to group_members:", e.message);
  }
}

try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      receiver_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_by_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      last_read_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'
    );

    CREATE TABLE IF NOT EXISTS dm_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      other_user_id INTEGER NOT NULL REFERENCES users(id),
      last_read_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
      UNIQUE(user_id, other_user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      dm_user_id INTEGER REFERENCES users(id),
      group_id INTEGER REFERENCES groups(id),
      created_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'
    );
  `);
} catch (err) {
  console.error("Error creating tables:", err);
}

export const db = drizzle(sqlite, { schema });

export * from "./schema";
