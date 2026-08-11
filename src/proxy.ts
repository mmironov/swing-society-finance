/**
 * HTTP Basic authentication for the whole application.
 *
 * Next.js 16 renamed the `middleware` file convention to `proxy`, and Proxy now
 * runs on the Node.js runtime by default — which is why this can use node:crypto
 * directly. Do not add a `runtime` export here; Next throws if Proxy sets one.
 *
 * WHY THIS RATHER THAN A LOGIN PAGE: this is an internal tool for a handful of
 * operators. One file covers every route, every server action and every asset,
 * with no session store, no user table and no password reset flow to get wrong.
 * If Swing Society ever needs per-user permissions or an audit trail, replace
 * this wholesale — do not grow it.
 *
 * ⚠ Basic auth transmits credentials base64-encoded, which is NOT encryption.
 * It is only meaningful behind TLS. Over plain HTTP on an untrusted network the
 * credentials are readable by anyone on the path.
 */

import crypto from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

const REALM = "Swing Society Finance";

/**
 * Compares two secrets in constant time.
 *
 * The values are hashed first because `timingSafeEqual` throws on
 * length-mismatched buffers — comparing lengths up front would leak the length
 * of the real password. SHA-256 digests are always 32 bytes, so the comparison
 * is both safe and uniform.
 */
function secureEquals(a: string, b: string): boolean {
  const digestA = crypto.createHash("sha256").update(a, "utf8").digest();
  const digestB = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function promptForCredentials() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}

export function proxy(request: NextRequest) {
  const expectedUser = process.env.AUTH_USER;
  const expectedPassword = process.env.AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    // Fail CLOSED in production. Silently serving financial data because an
    // environment variable was forgotten is the worst possible failure mode, so
    // an unconfigured production deployment refuses to serve at all.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "AUTH_USER and AUTH_PASSWORD are not set. Refusing to serve unprotected financial data.",
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    // Development stays open so `npm run dev` needs no setup.
    return NextResponse.next();
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return promptForCredentials();

  const decoded = Buffer.from(header.slice("Basic ".length).trim(), "base64").toString("utf8");

  // Split on the FIRST colon only: a password may legitimately contain colons.
  const separator = decoded.indexOf(":");
  if (separator === -1) return promptForCredentials();

  // Both comparisons always run — `&&` would short-circuit and leak whether the
  // username alone was correct.
  const userMatches = secureEquals(decoded.slice(0, separator), expectedUser);
  const passwordMatches = secureEquals(decoded.slice(separator + 1), expectedPassword);
  if (!(userMatches && passwordMatches)) return promptForCredentials();

  return NextResponse.next();
}

export const config = {
  // Everything except build assets and the health probe. Page routes are
  // covered, and because server actions POST to those same routes, mutations
  // are covered too.
  //
  // `api/health` is the ONLY exempt application route: the orchestrator has no
  // credentials, and the endpoint returns nothing but liveness. Do not add
  // exemptions here casually — each one is a hole in the only gate there is.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
