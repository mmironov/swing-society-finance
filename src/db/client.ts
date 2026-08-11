/**
 * Database connection.
 *
 * SQLite is a deliberate choice for an internal tool used by a handful of
 * people: no server to run, the whole dataset is one file that can be copied as
 * a backup, and it is fast enough by orders of magnitude at this scale.
 */

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

export const DATABASE_PATH = process.env.DATABASE_URL ?? path.join(process.cwd(), "data", "swing-society.db");

function createConnection() {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
  const sqlite = new Database(DATABASE_PATH);

  // Foreign keys are OFF by default in SQLite. Without this, every FK in the
  // schema — including the composite one that ties a category to a transaction
  // type — would be documentation rather than enforcement.
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");

  return drizzle(sqlite, { schema, casing: "snake_case" });
}

/**
 * Cached on globalThis so Next.js dev hot-reloads reuse one connection instead
 * of opening a new file handle on every module reload.
 */
const globalForDb = globalThis as unknown as { swingSocietyDb?: ReturnType<typeof createConnection> };

export const db = globalForDb.swingSocietyDb ?? createConnection();

if (process.env.NODE_ENV !== "production") {
  globalForDb.swingSocietyDb = db;
}

export type Db = typeof db;
export { schema };
