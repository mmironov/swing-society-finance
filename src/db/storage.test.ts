/**
 * Signature V4 is hand-rolled, so it is tested against a REAL S3 server
 * (MinIO in Docker) rather than a mock. A mock would happily accept an invalid
 * signature and tell us nothing.
 *
 * The suite skips itself when no server is reachable, so `npm test` still runs
 * offline and in CI without Docker. Start one with:
 *
 *   docker run -d --name minio-test -p 127.0.0.1:9100:9000 \
 *     -e MINIO_ROOT_USER=testkey -e MINIO_ROOT_PASSWORD=testsecret123 \
 *     minio/minio server /data
 */

import crypto from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { getObject, putObject, s3ConfigFromEnv, signedRequest, type S3Config } from "./storage";

const ENDPOINT = process.env.TEST_S3_ENDPOINT ?? "http://127.0.0.1:9100";
const BUCKET = "swing-test-bucket";

const config: S3Config = {
  endpoint: ENDPOINT,
  bucket: BUCKET,
  accessKeyId: "testkey",
  secretAccessKey: "testsecret123",
  region: "us-east-1",
};

let serverUp = false;

/** Creates the bucket using the same signer the upload path uses. */
async function createBucket(): Promise<void> {
  await signedRequest(config, "PUT", `/${BUCKET}`);
}

beforeAll(async () => {
  try {
    const probe = await fetch(`${ENDPOINT}/minio/health/live`, {
      signal: AbortSignal.timeout(2000),
    });
    serverUp = probe.ok;
    if (serverUp) await createBucket();
  } catch {
    serverUp = false;
  }
});

describe("s3ConfigFromEnv", () => {
  it("returns null when object storage is not configured", () => {
    const saved = { ...process.env };
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;

    expect(s3ConfigFromEnv()).toBeNull();
    Object.assign(process.env, saved);
  });

  it("requires every credential, not just some", () => {
    const saved = { ...process.env };
    process.env.S3_ENDPOINT = "https://example.com";
    process.env.S3_BUCKET = "b";
    process.env.S3_ACCESS_KEY_ID = "k";
    delete process.env.S3_SECRET_ACCESS_KEY;

    // A half-configured upload must not be attempted — it would fail at the
    // worst possible moment rather than being reported as "not configured".
    expect(s3ConfigFromEnv()).toBeNull();
    Object.assign(process.env, saved);
  });

  it("strips a trailing slash so the signed path does not double up", () => {
    const saved = { ...process.env };
    process.env.S3_ENDPOINT = "https://fly.storage.tigris.dev/";
    process.env.S3_BUCKET = "b";
    process.env.S3_ACCESS_KEY_ID = "k";
    process.env.S3_SECRET_ACCESS_KEY = "s";

    expect(s3ConfigFromEnv()?.endpoint).toBe("https://fly.storage.tigris.dev");
    Object.assign(process.env, saved);
  });
});

describe("putObject against a real S3 server", () => {
  it("uploads a payload that reads back byte-identical", async ({ skip }) => {
    if (!serverUp) skip();

    // Binary, not text: a SQLite file is binary and a signing bug that only
    // shows up on non-UTF8 bytes would otherwise slip through.
    const payload = crypto.randomBytes(4096);
    const key = `roundtrip-${crypto.randomUUID()}.db`;

    await putObject(config, key, payload, "application/vnd.sqlite3");

    // Signed readback: the bucket is private, so an unauthenticated GET would
    // fail regardless of whether the upload worked.
    const returned = await getObject(config, key);
    expect(returned.equals(payload)).toBe(true);
  });

  it("rejects a bad secret key rather than silently succeeding", async ({ skip }) => {
    if (!serverUp) skip();

    await expect(
      putObject({ ...config, secretAccessKey: "wrong-secret" }, "nope.db", Buffer.from("x")),
    ).rejects.toThrow(/Upload failed: 40\d/);
  });

  it("handles an empty payload", async ({ skip }) => {
    if (!serverUp) skip();

    const key = `empty-${crypto.randomUUID()}.db`;
    await expect(putObject(config, key, Buffer.alloc(0))).resolves.toBeUndefined();
  });
});
