/**
 * Liveness probe for the container orchestrator.
 *
 * DELIBERATELY UNAUTHENTICATED — it is excluded from the auth matcher in
 * `src/proxy.ts` so Docker can poll it without credentials. It must therefore
 * never expose anything worth protecting: no figures, no names, no counts, no
 * configuration. Only whether the process is up and the database answers.
 *
 * It does query the database, on purpose. A health check that only proves the
 * HTTP server accepted a socket would report "healthy" for a container whose
 * database volume failed to mount — precisely the outage worth catching.
 */

import { sql } from "drizzle-orm";

import { db } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    db.get(sql`SELECT 1`);
  } catch {
    // The reason is deliberately not returned; it goes to the container log
    // instead, where it is not readable by an anonymous caller.
    console.error("Health check failed: database unreachable");
    return Response.json({ status: "unhealthy" }, { status: 503 });
  }

  return Response.json({ status: "ok" }, { status: 200 });
}
