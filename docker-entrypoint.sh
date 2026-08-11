#!/bin/sh
set -e

# Container entrypoint.
#
# Runs as root only long enough to fix volume ownership, then drops to the
# unprivileged `swing` user for migrations and for the application itself.

DB_PATH="${DATABASE_URL:-/data/swing-society.db}"
DB_DIR="$(dirname "$DB_PATH")"

if [ "$(id -u)" = "0" ]; then
  # A freshly created Docker volume is owned by root, so the application user
  # could not write to it. Fixing it here means the operator does not have to
  # think about UIDs on the host.
  mkdir -p "$DB_DIR" "${BACKUP_DIR:-/backups}"
  chown -R swing:swing "$DB_DIR" "${BACKUP_DIR:-/backups}"
  # Re-exec this same script as swing, so everything below is unprivileged.
  exec gosu swing "$0" "$@"
fi

# Refuse to start unprotected. proxy.ts also fails closed and would serve 503s,
# but failing HERE is far easier to diagnose: the operator sees the reason in
# the container log instead of a bare 503 in the browser.
if [ -z "$AUTH_USER" ] || [ -z "$AUTH_PASSWORD" ]; then
  echo "FATAL: AUTH_USER and AUTH_PASSWORD must be set." >&2
  echo "       Refusing to start a finance application with no authentication." >&2
  exit 1
fi

# Applies migrations and inserts any missing reference data. Both are idempotent
# and safe against a live database, so this runs on every start — which means a
# deploy carrying a new migration needs no separate manual step.
echo "Preparing database at $DB_PATH ..."
node /app/dist-scripts/init.js

exec "$@"
