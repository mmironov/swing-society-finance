/**
 * Applies pending migrations. Run with `npm run db:migrate`.
 */

import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { db, DATABASE_PATH } from "./client";

export function runMigrations(target = db) {
  migrate(target, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}

// Only run when invoked directly, so importing this module in tests is safe.
if (process.argv[1]?.endsWith("migrate.ts")) {
  runMigrations();
  console.log(`Migrations applied to ${DATABASE_PATH}`);
}
