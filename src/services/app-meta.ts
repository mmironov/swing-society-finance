import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { appMeta, DEMO_DATA_KEY } from "@/db/schema";

/**
 * True when the database was populated by the demo seed. Drives the banner that
 * stops fictional figures from being mistaken for real ones.
 */
export function isDemoData(): boolean {
  try {
    return db.select().from(appMeta).where(eq(appMeta.key, DEMO_DATA_KEY)).get() !== undefined;
  } catch {
    // The database may not be migrated yet on a first run; the banner is not
    // important enough to break the page over.
    return false;
  }
}
