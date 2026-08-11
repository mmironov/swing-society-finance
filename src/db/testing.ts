/**
 * Builds a throwaway in-memory database with the real migrations applied.
 * Used by tests that need to verify database-level behaviour (constraints,
 * cascades) rather than application logic.
 */

import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./schema";

export type TestDb = ReturnType<typeof createTestDb>;

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const database = drizzle(sqlite, { schema, casing: "snake_case" });
  migrate(database, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return database;
}
