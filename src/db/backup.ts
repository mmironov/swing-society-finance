/**
 * Creates a verified, timestamped backup of the SQLite database.
 *
 * Run with `npm run db:backup`. Safe to run while the application is serving.
 *
 * WHY NOT `cp`: the database runs in WAL mode, so recent writes live in a
 * separate `-wal` file. Copying only the `.db` file while the app is running
 * can capture a torn, stale or unusable snapshot. SQLite's own online backup
 * API — what `db.backup()` calls — takes a consistent snapshot of the whole
 * database including anything still in the WAL.
 *
 * Every backup is verified after being written. An unverified backup is not a
 * backup; it is a file you find out is worthless on the day you need it.
 */

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { putObject, s3ConfigFromEnv } from "./storage";

const DEFAULT_RETENTION = 14;
const BACKUP_PREFIX = "swing-society-";

export interface BackupResult {
  file: string;
  bytes: number;
  tables: number;
  transactions: number;
  prunedFiles: string[];
  /** Object key when uploaded to S3, null when object storage is not configured. */
  uploadedKey: string | null;
  /**
   * Why the upload failed, when one was attempted and did not succeed. The
   * local snapshot is still valid in that case — reported rather than thrown so
   * the caller can surface both facts.
   */
  uploadError: string | null;
}

function resolveSourcePath(): string {
  return process.env.DATABASE_URL ?? path.join(process.cwd(), "data", "swing-society.db");
}

function resolveBackupDir(): string {
  return process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
}

function resolveRetention(): number {
  const raw = Number(process.env.BACKUP_RETENTION);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_RETENTION;
}

/** Sortable, filename-safe UTC stamp: 2026-08-11T190000Z */
function timestamp(now: Date): string {
  return `${now.toISOString().slice(0, 19).replace(/[:]/g, "")}Z`.replace(
    /^(\d{4}-\d{2}-\d{2})T/,
    "$1T",
  );
}

/**
 * Opens the freshly written file, checks it is a valid readable database with
 * the data we expect, and consolidates it into a single self-contained file.
 * This is what distinguishes a backup from a file.
 *
 * The connection is read-WRITE on purpose. The backup inherits WAL mode from
 * the source, which means it arrives as three files (.db, -wal, -shm). A
 * read-only connection cannot checkpoint, so those sidecars would be left
 * behind — turning each backup into a multi-file set that is easy to copy
 * incompletely. Switching to journal_mode=DELETE folds the WAL into the main
 * file and removes the sidecars, leaving one file that can be copied anywhere.
 */
function verifyBackup(file: string): { tables: number; transactions: number } {
  const backup = new Database(file);
  try {
    const integrity = backup.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") {
      throw new Error(`integrity check failed: ${String(integrity)}`);
    }

    backup.pragma("journal_mode = DELETE");

    const { count: tables } = backup
      .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'")
      .get() as { count: number };

    // Read a real application table too: a structurally valid but empty file
    // would pass an integrity check while being useless.
    const { count: transactions } = backup
      .prepare("SELECT COUNT(*) AS count FROM financial_transactions")
      .get() as { count: number };

    return { tables, transactions };
  } finally {
    backup.close();
  }
}

/** Deletes the oldest backups beyond the retention limit. */
function prune(directory: string, retention: number): string[] {
  const existing = fs
    .readdirSync(directory)
    .filter((name) => name.startsWith(BACKUP_PREFIX) && name.endsWith(".db"))
    .sort() // timestamps are lexicographically sortable
    .reverse();

  const doomed = existing.slice(retention);
  for (const name of doomed) {
    fs.unlinkSync(path.join(directory, name));
    // Defensive: verifyBackup should have removed these, but an interrupted run
    // could leave them, and orphaned sidecars would otherwise accumulate
    // forever because they do not match the "*.db" filter above.
    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = path.join(directory, `${name}${suffix}`);
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    }
  }
  return doomed;
}

export async function backup(now = new Date()): Promise<BackupResult> {
  const sourcePath = resolveSourcePath();
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`No database found at ${sourcePath}. Run "npm run db:migrate" first.`);
  }

  const directory = resolveBackupDir();
  fs.mkdirSync(directory, { recursive: true });

  const file = path.join(directory, `${BACKUP_PREFIX}${timestamp(now)}.db`);

  const source = new Database(sourcePath, { readonly: true });
  try {
    await source.backup(file);
  } finally {
    source.close();
  }

  let verified: { tables: number; transactions: number };
  try {
    verified = verifyBackup(file);
  } catch (error) {
    // A backup that fails verification is worse than none, because it looks
    // like protection. Remove it so it cannot be restored by mistake.
    fs.unlinkSync(file);
    throw new Error(
      `Backup written to ${file} but failed verification, so it was deleted: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // Upload only AFTER verification passed. Shipping an unverified snapshot to
  // object storage would put a file that looks like a backup somewhere it is
  // even harder to notice is worthless.
  let uploadedKey: string | null = null;
  let uploadError: string | null = null;
  const s3 = s3ConfigFromEnv();
  if (s3) {
    const key = path.basename(file);
    try {
      await putObject(s3, key, fs.readFileSync(file), "application/vnd.sqlite3");
      uploadedKey = key;
    } catch (error) {
      uploadError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    file,
    bytes: fs.statSync(file).size,
    tables: verified.tables,
    transactions: verified.transactions,
    // Pruning applies to the LOCAL directory only. Remote objects are never
    // deleted from here: automatic deletion of off-site backups is exactly the
    // operation you do not want a bug in. Use a bucket lifecycle rule instead.
    prunedFiles: prune(directory, resolveRetention()),
    uploadedKey,
    uploadError,
  };
}

// Matches both the .ts entry (via tsx in development) and the bundled .js the
// container runs — the extension differs between those two worlds.
if (/backup\.(ts|js|mjs)$/.test(process.argv[1] ?? "")) {
  backup()
    .then((result) => {
      const megabytes = (result.bytes / 1_000_000).toFixed(2);
      console.log(
        `Backed up to ${result.file} (${megabytes} MB, ${result.tables} tables, ` +
          `${result.transactions} transactions) — verified.`,
      );
      if (result.prunedFiles.length) {
        console.log(`Pruned ${result.prunedFiles.length} old backup(s) beyond the retention limit.`);
      }

      if (result.uploadedKey) {
        console.log(`Uploaded to object storage as ${result.uploadedKey}.`);
      } else if (result.uploadError) {
        // Loud and non-zero: a cron that silently stops copying backups off the
        // machine is indistinguishable from one that is working.
        console.error(`\nWARNING: the local snapshot is valid, but the upload FAILED.`);
        console.error(`         ${result.uploadError}`);
        console.error(`         This machine now holds the only copy.`);
        process.exitCode = 1;
      } else {
        console.log("Object storage not configured — this is the only copy.");
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
