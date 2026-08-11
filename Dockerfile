# syntax=docker/dockerfile:1

# Swing Society Finance — production image.
#
# Multi-stage so the build toolchain needed to compile better-sqlite3 never
# reaches the final image. The database itself lives on a mounted volume, NOT in
# the image: see compose.yaml.

FROM node:24-slim AS base
ENV NODE_ENV=production


# ---------------------------------------------------------------- dependencies
# better-sqlite3 is a native module. If no prebuilt binary matches this platform
# it compiles from source, which needs python3/make/g++ — hence installing them
# here rather than hoping for a prebuild.
FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
# devDependencies are needed to BUILD (next, typescript, esbuild) even though
# NODE_ENV=production would normally skip them.
RUN npm ci --include=dev


# --------------------------------------------------------------------- builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# The database CLI scripts are TypeScript and use "@/" path aliases, so the
# runtime image would otherwise need tsx and the whole TS toolchain. Bundling
# them to plain JS here keeps the final image lean. better-sqlite3 stays
# external so the native binary is loaded from node_modules rather than inlined.
RUN npx esbuild src/db/init.ts src/db/backup.ts \
  --bundle \
  --platform=node \
  --format=cjs \
  --target=node24 \
  --outdir=dist-scripts \
  --external:better-sqlite3 \
  --tsconfig=tsconfig.json \
  --log-level=warning


# ---------------------------------------------------------------------- runner
FROM base AS runner
WORKDIR /app

# gosu lets the entrypoint fix volume ownership as root and then drop to an
# unprivileged user before the application itself ever runs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 swing \
  && useradd --system --uid 1001 --gid swing swing

# `output: "standalone"` produces a server with only the traced dependencies —
# including better-sqlite3's compiled binary, built for THIS image's platform in
# the deps stage above.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Migrations are read from "<cwd>/drizzle" at runtime, so they must ship.
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/dist-scripts ./dist-scripts

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Defaults point at the mount points declared in compose.yaml. The database must
# live on a volume; anything written inside the container is lost on redeploy.
ENV DATABASE_URL=/data/swing-society.db \
    BACKUP_DIR=/backups \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN mkdir -p /data /backups && chown swing:swing /data /backups

EXPOSE 3000

# Uses node rather than curl/wget so no extra package is needed. Hits the one
# unauthenticated route; a non-200 marks the container unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
