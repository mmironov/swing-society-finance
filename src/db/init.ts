/**
 * Production bootstrap. Run with `npm run db:init`.
 *
 * Brings an empty database to the point where real work can start: applies
 * migrations, then inserts the reference data every transaction depends on. A
 * transaction requires a category, and the composite foreign key means an
 * unseeded database cannot accept a single row — so `db:migrate` alone leaves
 * you with an app you cannot use.
 *
 * SAFE TO RUN REPEATEDLY, INCLUDING AGAINST LIVE DATA. It only ever inserts
 * what is missing. It deletes nothing, updates nothing, and — unlike the demo
 * seed — never sets the demo-data marker, so the "fictional figures" banner
 * stays off.
 *
 * The container entrypoint runs this on every start, which is why the
 * idempotency guarantee above is load-bearing rather than a nicety.
 */

import { db } from "./client";
import { runMigrations } from "./migrate";
import { ensureReferenceData, type ReferenceDataReport } from "./reference-data";
import { seasons } from "./schema";

export interface InitReport extends ReferenceDataReport {
  seasons: number;
}

/**
 * The season the system goes live for. Real dates, from the operating plan.
 *
 * Created only when the seasons table is completely empty, so it appears on a
 * first install and never reappears if it is later renamed or deleted.
 */
const FIRST_SEASON = {
  name: "Autumn 2026",
  startDate: "2026-09-15",
  endDate: "2026-12-20",
  status: "PLANNING" as const,
};

export function init(): InitReport {
  runMigrations();

  return db.transaction(() => {
    const reference = ensureReferenceData();

    let seasonsCreated = 0;
    const existingSeason = db.select({ id: seasons.id }).from(seasons).get();
    if (!existingSeason) {
      db.insert(seasons).values(FIRST_SEASON).run();
      seasonsCreated = 1;
    }

    return { ...reference, seasons: seasonsCreated };
  });
}

// Matches both the .ts entry (via tsx in development) and the bundled .js the
// container runs — the extension differs between those two worlds.
if (/init\.(ts|js|mjs)$/.test(process.argv[1] ?? "")) {
  try {
    const report = init();
    const created = Object.entries(report).filter(([, count]) => count > 0);

    if (created.length === 0) {
      console.log("Database already initialised — nothing to add.");
    } else {
      console.log("Initialised:");
      for (const [what, count] of created) console.log(`  ${count} ${what}`);
    }

    // Only advertise the next step when it is actually outstanding. In the
    // container these are already set and the server is about to start, so
    // printing it unconditionally would be misleading in the startup log.
    if (!process.env.AUTH_USER || !process.env.AUTH_PASSWORD) {
      console.log("\nNext: set AUTH_USER and AUTH_PASSWORD, then start the app.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
