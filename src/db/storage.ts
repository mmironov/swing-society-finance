/**
 * Minimal S3 upload for backups — enough to PUT one object, and nothing else.
 *
 * WHY NOT THE AWS SDK: this needs exactly one operation. `@aws-sdk/client-s3`
 * would add a large dependency tree to an application that otherwise has six
 * runtime dependencies, and every one of those is supply-chain surface in an
 * app that holds a business's finances. Signature V4 for a single PUT is a
 * well-specified ~80 lines, and it is verified against a real S3 server in
 * storage.test.ts rather than assumed to work.
 *
 * Works with any S3-compatible endpoint. Tigris (Fly's object storage) is the
 * intended target; MinIO is what the tests run against.
 */

import crypto from "node:crypto";

const SERVICE = "s3";
const ALGORITHM = "AWS4-HMAC-SHA256";

export interface S3Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/**
 * Reads configuration from the environment, or returns null when object storage
 * is not configured. Returning null rather than throwing is deliberate: uploads
 * are opt-in, and a developer running a local backup should not need S3
 * credentials.
 *
 * TWO NAMING SCHEMES ARE ACCEPTED. `fly storage create` provisions a Tigris
 * bucket and sets its own secrets on the app automatically, using the
 * conventional AWS variable names. Reading those as a fallback means the Fly
 * setup works with no manual re-mapping — and re-mapping by hand is exactly
 * where a deployment silently ends up with backups that never upload.
 *
 * Explicit S3_* values win, so any provider can still be configured directly.
 */
export function s3ConfigFromEnv(): S3Config | null {
  const endpoint = process.env.S3_ENDPOINT ?? process.env.AWS_ENDPOINT_URL_S3;
  const bucket = process.env.S3_BUCKET ?? process.env.BUCKET_NAME;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;

  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    bucket,
    accessKeyId,
    secretAccessKey,
    // Tigris accepts "auto"; most other providers want a real region name.
    region: process.env.S3_REGION ?? process.env.AWS_REGION ?? "auto",
  };
}

const sha256Hex = (data: crypto.BinaryLike) =>
  crypto.createHash("sha256").update(data).digest("hex");

const hmac = (key: crypto.BinaryLike, data: string) =>
  crypto.createHmac("sha256", key).update(data, "utf8").digest();

/** AWS4 signing key: a chain of HMACs over date, region, service. */
function signingKey(secret: string, dateStamp: string, region: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

/**
 * Signs and sends one request, path-style.
 *
 * Path-style (`{endpoint}/{bucket}/{key}`) rather than virtual-host style
 * because it works against every S3-compatible implementation without the
 * caller having to know whether the provider supports DNS-based buckets.
 *
 * Low-level and exported mainly so tests can drive operations beyond the two
 * wrappers below (creating a bucket, for instance). Prefer putObject/getObject.
 */
export async function signedRequest(
  config: S3Config,
  method: "PUT" | "GET" | "HEAD",
  resourcePath: string,
  body: Buffer = Buffer.alloc(0),
  contentType = "application/octet-stream",
): Promise<Response> {
  const url = new URL(`${config.endpoint}${resourcePath}`);
  const now = new Date();
  const amzDate = `${now.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);

  // Header names must be lower-cased and sorted; the signed-headers list must
  // match the canonical headers block exactly or the signature will not verify.
  const canonicalHeaders =
    `host:${url.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    method,
    url.pathname,
    "", // no query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${config.region}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(
    signingKey(config.secretAccessKey, dateStamp, config.region),
    stringToSign,
  ).toString("hex");

  return fetch(url, {
    method,
    headers: {
      Authorization:
        `${ALGORITHM} Credential=${config.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      "content-type": contentType,
      "content-length": String(body.byteLength),
    },
    // GET/HEAD must not carry a body at all, even an empty one.
    ...(method === "PUT" ? { body: new Uint8Array(body) } : {}),
  });
}

/** The provider's XML error is the only useful clue when a signature is wrong. */
async function describeFailure(response: Response, what: string): Promise<Error> {
  const detail = await response.text().catch(() => "");
  return new Error(
    `${what} failed: ${response.status} ${response.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ""}`,
  );
}

/** Uploads one object. */
export async function putObject(
  config: S3Config,
  key: string,
  body: Buffer,
  contentType = "application/octet-stream",
): Promise<void> {
  const response = await signedRequest(
    config,
    "PUT",
    `/${config.bucket}/${key}`,
    body,
    contentType,
  );
  if (!response.ok) throw await describeFailure(response, "Upload");
}

/**
 * Downloads one object. Used to confirm a remote copy is readable, and to
 * restore from object storage.
 */
export async function getObject(config: S3Config, key: string): Promise<Buffer> {
  const response = await signedRequest(config, "GET", `/${config.bucket}/${key}`);
  if (!response.ok) throw await describeFailure(response, "Download");
  return Buffer.from(await response.arrayBuffer());
}
