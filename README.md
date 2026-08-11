# Swing Society Finance

A management finance dashboard and season planner for Swing Society, a dance school.

It answers nine questions: how much came in, how much went out, what the monthly and seasonal
profit was, where income comes from, where money goes, what the next season is expected to earn and
cost, which courses are financially attractive, how many students a course needs to break even, and
how the season is tracking against its plan.

This is a **management tool, not accounting software**. It does not replace bookkeeping, does not
file anything, and its P&L is a cash-basis summary of recorded transactions rather than a statutory
financial statement.

---

## Getting started

Requires Node 20+ (developed on Node 25). No database server — SQLite lives in a single file.

```bash
npm install
npm run db:migrate
npm run db:seed      # optional: fictional demo data so every screen has content
npm run dev
```

Then open <http://localhost:3000>.

While demo data is present, a banner appears at the top of every page. It disappears once the demo
marker is cleared — see [Demo data](#demo-data).

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a migration after editing the schema |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | **Replaces all data** with the demo dataset |
| `npm run db:init` | Production bootstrap: migrate + real reference data, idempotent |
| `npm run db:backup` | Verified, timestamped snapshot of the database |
| `npm run db:studio` | Drizzle Studio, to browse the database |

The database file defaults to `./data/swing-society.db` and is gitignored. Override with
`DATABASE_URL=/path/to/file.db`.

Copy `.env.example` to `.env.local` for local configuration; `.env*` is gitignored.

---

## Security

The whole application sits behind HTTP Basic authentication, implemented in [`src/proxy.ts`](src/proxy.ts).
One file covers every route, every server action and every asset — there is no session store, no user
table and no password reset flow.

```bash
AUTH_USER=swing
AUTH_PASSWORD=$(openssl rand -base64 24)
```

Three behaviours worth knowing:

- **Development stays open.** With both variables unset and `NODE_ENV != production`, there is no
  login prompt, so `npm run dev` needs no setup.
- **Production fails closed.** With them unset in production the app returns `503` and serves
  nothing. Forgetting to configure credentials cannot silently expose financial data.
- **Credentials are compared in constant time**, using SHA-256 digests and `timingSafeEqual`, with
  both the username and password always checked so timing cannot reveal a correct username alone.

> ⚠ **Basic auth is base64-encoded, not encrypted. Deploy only behind TLS.** Over plain HTTP the
> credentials are readable by anyone on the network path. Terminate TLS at a reverse proxy
> (Caddy does it automatically) or a load balancer.

This is deliberately the simplest thing that works for a handful of operators. If Swing Society ever
needs per-user permissions or an audit trail of who changed what, **replace it wholesale rather than
growing it**.

---

## Backups

The entire business sits in one SQLite file, so backups are not optional.

```bash
npm run db:backup
```

Each run writes a timestamped snapshot to `backups/`, keeps the most recent 14, and — critically —
**verifies what it wrote**: it reopens the file, runs `PRAGMA integrity_check`, and confirms the
application tables are readable. A snapshot that fails verification is deleted rather than left to
look like protection.

Do not simply `cp` the database file while the app is running. It runs in WAL mode, so recent writes
live in a separate `-wal` file and a plain copy can capture a torn or stale snapshot. The script uses
SQLite's online backup API, which is consistent and safe against a live database. It then folds the
WAL into the snapshot so each backup is **one self-contained file** you can copy anywhere.

Schedule it — daily at 02:30, keeping 30 days. In development:

```bash
30 2 * * * cd /path/to/swing-society-finance && BACKUP_RETENTION=30 /usr/local/bin/npm run db:backup >> /var/log/swing-backup.log 2>&1
```

In production the same script runs inside the container. Where its output lands differs by target:

- **Docker Compose** — writes to `backups/` bind-mounted from the host, so snapshots are already off
  the container and on a filesystem you control:
  ```bash
  30 2 * * * cd /path/to/swing-society-finance && /usr/bin/docker compose exec -T app node /app/dist-scripts/backup.js >> /var/log/swing-backup.log 2>&1
  ```
- **Fly.io** — writes to `/data/backups`, which is *the same volume as the database*. Getting a copy
  off the machine takes an extra step, and it matters: see
  [Backups on Fly](#backups-on-fly).

**To restore**, stop the app and put the snapshot in place. It is a complete database, not a diff:

```bash
# development
cp backups/swing-society-2026-08-11T162528Z.db data/swing-society.db

# production — the volume is only safely writable while nothing is using it
docker compose stop app
docker compose run --rm -v ./backups:/backups --entrypoint sh app \
  -c "cp /backups/swing-society-2026-08-11T162528Z.db /data/swing-society.db"
docker compose start app
```

`backups/` is gitignored. Copy it somewhere off the machine — a backup on the same disk as the
original protects against mistakes, not hardware failure.

---

## Deployment

Runs as a Docker container. The database lives on a volume, never in the image. Two supported
targets: **Fly.io** (the deployed setup) and **Docker Compose** (any host you control).

### Fly.io

Configuration is in [`fly.toml`](fly.toml). One-time setup:

```bash
brew install flyctl
fly auth login

fly apps create swing-society-finance          # name must be globally unique
fly volumes create swing_data --region fra --size 1

# Credentials go in secrets, never in fly.toml — that file is committed to git.
fly secrets set AUTH_USER=swing AUTH_PASSWORD="$(openssl rand -base64 24)"

fly deploy
```

Afterwards, `fly deploy` alone ships a new version. TLS is terminated at Fly's edge and
`force_https` redirects plain HTTP, which is what makes Basic auth safe here.

> ⚠ **Never run more than one machine.** SQLite has a single writer and a Fly volume attaches to one
> machine at a time. A second machine either fails to mount the volume or — worse, if given its own —
> gives you two divergent copies of the finances that cannot be merged. Check with `fly status`; fix
> with `fly scale count 1`.

The machine stops when idle and starts on the next request (a couple of seconds), so cost is mostly
the volume. Set `min_machines_running = 1` if that ever annoys you.

| | |
|---|---|
| Logs | `fly logs` |
| Status | `fly status` |
| Shell | `fly ssh console` |
| Backup now | `fly ssh console -C "node /app/dist-scripts/backup.js"` |

#### Backups on Fly

`BACKUP_DIR` points at `/data/backups` — the same volume as the database — so local snapshots alone
would not survive losing that volume. Object storage closes that gap.

Create a bucket and wire in the credentials it prints:

```bash
fly storage create                       # provisions a Tigris bucket
fly secrets set \
  S3_ENDPOINT=https://fly.storage.tigris.dev \
  S3_BUCKET=<bucket-name> \
  S3_ACCESS_KEY_ID=<key> \
  S3_SECRET_ACCESS_KEY=<secret> \
  S3_REGION=auto
```

Every backup is then uploaded **after** it passes verification, so an unusable snapshot is never
shipped somewhere it is even harder to notice. If the upload fails, the run prints the provider's
error, says plainly that this machine now holds the only copy, and **exits non-zero** so a cron job
raises an alarm — a backup process that silently stops copying is indistinguishable from one that
works.

With no `S3_*` variables set, backups stay local and the script says so rather than implying safety.

Remaining caveat worth knowing: Tigris lives inside your Fly account, so this protects against
losing the volume but not against losing the account. Pulling an occasional copy to your own machine
at season close covers that:

```bash
fly ssh console -C "node /app/dist-scripts/backup.js"
fly ssh sftp get /data/backups/<filename> ./backups/<filename>
```

Fly's automatic daily volume snapshots sit underneath all of this as a short-retention safety net.

**Remote objects are never deleted by the script.** Local pruning respects `BACKUP_RETENTION`; the
bucket grows until you add a lifecycle rule. Automatic deletion of off-site backups is not worth
risking a bug in — at 160 KB a snapshot, years of daily backups cost pennies.

**To restore**, upload a snapshot and put it in place:

```bash
fly ssh sftp shell                       # then: put ./backups/<file> /data/restore.db
fly ssh console -C "sh -c 'cp /data/restore.db /data/swing-society.db'"
fly apps restart swing-society-finance
```

---

### Docker Compose

For any host you control — a VPS, a NAS, a machine at the studio.

```bash
cp .env.example .env          # then set AUTH_USER and AUTH_PASSWORD
docker compose up -d --build
```

That is the whole procedure. On start the container applies migrations and inserts the reference
data — the 11 categories, 4 courses, 8 activities and 7 subscription products — plus the Autumn 2026
season if no season exists. Both steps are **idempotent and safe against live data**, so they run on
every start and a deploy carrying a new migration needs no separate manual step.

The result is an empty ledger: real reference data, no fictional transactions, and no demo banner.

> **`db:migrate` alone is not enough.** A transaction requires a category, and the composite foreign
> key means a migrated-but-unseeded database cannot accept a single row. `db:init` — which the
> entrypoint runs for you — is what makes the database usable.

#### TLS is not optional (Compose only — Fly handles this at its edge)

`compose.yaml` publishes to `127.0.0.1:3000` deliberately. **Do not change that to `0.0.0.0` or
publish port 3000 to the internet.** Basic auth is base64, not encryption; without TLS the password
crosses the network in clear text on every request.

Put a terminator in front. Caddy is two lines and obtains certificates automatically:

```caddy
swing.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

#### Upgrading

```bash
git pull
docker compose up -d --build
```

The volume is untouched by a rebuild. Take a backup first anyway if the release contains a migration
— migrations are not reversible.

#### Operating notes

| | |
|---|---|
| Logs | `docker compose logs -f` |
| Health | `docker compose ps` — reports `healthy` via `/api/health` |
| Backup now | `docker compose exec -T app node /app/dist-scripts/backup.js` |
| Shell | `docker compose exec app sh` |

Three deliberate safety behaviours, each verified:

- **The container refuses to start** with `AUTH_USER`/`AUTH_PASSWORD` unset, rather than serving an
  unprotected finance app. The error names the missing variables in the log.
- **The application process runs as an unprivileged user** (`swing`, uid 1001). The entrypoint is
  root only long enough to fix volume ownership, then drops privileges.
- **`/api/health` is the only unauthenticated route.** It reports liveness and nothing else — no
  figures, no counts, no configuration — and it queries the database, so a container whose volume
  failed to mount reports unhealthy instead of falsely healthy.

---

## Architecture

```
src/
  domain/          Pure calculations — no database, no React, no framework imports
    money.ts         Integer-cent arithmetic, parsing and EUR formatting
    categories.ts    Default category codes and the planner-derived rule
    finance/         P&L, monthly aggregation, forecast-vs-actual variance
    planning/        Subscription revenue, teacher/studio cost, profitability,
                     break-even, offering and season forecasts
  db/              Drizzle schema, migrations, connection, demo seed
  services/        Loads rows and delegates to domain/ — contains no formulas
  app/             Next.js App Router pages and server actions
  components/      Presentational primitives and charts
  lib/             Date and period formatting
```

**No financial formula lives in a React component or a service.** Everything calculable sits in
`src/domain`, which imports nothing from the framework or the database. That is what lets the course
planning screen recalculate live in the browser using the very same functions the server uses to
build reports — there is no second implementation to drift out of step. It is also why the
calculations can be tested exhaustively without a database or a rendered page.

### Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · SQLite via better-sqlite3 ·
Drizzle ORM · Recharts · Vitest.

Mutations use server actions rather than a REST layer — for an internal tool with a handful of
users, an API surface would be indirection without a payoff.

---

## Decisions worth knowing

### Money is always integer cents

SQLite has no decimal type and IEEE-754 floats cannot represent `0.10` exactly, so every monetary
value — stored, computed, and passed around — is a whole number of cents. Rounding happens as late
as possible, ideally only in `formatEur`.

Two calculations are inherently fractional and round explicitly, once, at the end: studio cost with
a fractional class length, and revenue per student. Both are documented at the call site.

User input arrives as **text** and is parsed by `parseEurosToCents`, which does decimal arithmetic on
the digit string and never creates a float. It accepts both `1.234,56` and `1,234.56`. The numeric
`eurosToCents` exists for trusted literals like seed data, and cannot recover precision a caller has
already lost — `eurosToCents(1.005)` is 100 cents, while `parseEurosToCents("1.005")` is 101.

### Durations are stored as integer minutes

A 90-minute class is stored as `90`, not `1.5` hours, so no float reaches the database at all. The UI
displays and accepts hours.

### Category integrity is enforced by the database

Categories are rows, not an enum, so new ones can be added at runtime. "A transaction's category must
match its type" is enforced by a **composite foreign key** on `(category_id, type)` referencing
`categories(id, type)` — not merely by application code. Filing income under an expense category is
rejected by SQLite itself. `src/db/constraints.test.ts` proves this and the other §26 rules by
writing bad data and expecting rejection.

Because of this, Swing Buzz needs two category codes (`SWING_BUZZ_INCOME` and `SWING_BUZZ_EXPENSE`);
a single shared row could not satisfy the constraint on both sides of the P&L.

Note that SQLite enforces foreign keys only when `PRAGMA foreign_keys = ON`, which
`src/db/client.ts` sets on every connection. Without it every foreign key here would be decoration.

### Variance semantics

> **Revenue variance = actual − forecast. Expense variance = forecast − actual.**

Both are signed so a **positive variance always means better than planned**, whichever row it
appears in: earning more is positive, and so is spending less. Net profit follows the revenue rule.
Without the flip, a column of numbers would mean "good" in one row and "bad" in the next.

This is a reporting convention only; it never changes a stored amount.

### Contribution, not net profit

Course profitability subtracts only **direct** costs (teachers, studio). Marketing and administration
stay as season overhead and are deliberately not allocated to courses, because any allocation key
would be arbitrary and would distort the comparison between courses.

So a course's figure is a *contribution* — what it puts towards covering overhead — not net profit.

### Course fees, teacher and studio costs are planner-derived

The season forecast takes those three categories from the course planner. Entering them by hand as
well would count the same euro twice, so the domain layer **throws** on such a line and the UI omits
those categories from the dropdown entirely.

### Actuals belong to the season they are tagged with

A transaction counts towards the season on its record, not the season its date falls inside. A
payment that arrives late still counts where it was earned.

### Courses vs course offerings

A `Course` ("Lindy Hop — Intermediate") is season-independent and keeps one identity across years. A
`CourseOffering` is that course run in one season, and carries the planning assumptions. This is what
makes year-on-year comparison possible.

### Expected students ≠ expected subscription sales

These are tracked separately and never derived from each other. One student may buy several
subscriptions across a season, so revenue is built from the expected subscription mix, never from a
headcount multiplied by a price.

---

## Break-even methodology

> Break-even students = total direct costs ÷ average expected revenue per student, **rounded up**.

Labelled as a management estimate throughout the UI, because it rests on an assumption: that
additional students buy a mix of subscriptions similar to the planned one.

One consequence is worth understanding. Because revenue per student is derived from planned revenue
÷ planned students, **reducing expected students while leaving the sales mix untouched lowers the
break-even number**, since each remaining student is implicitly worth more. That is arithmetically
correct but reads as backwards, so the planner displays *Revenue per student* directly above
break-even to make the driver visible. When changing the expected headcount, change the expected
sales mix to match.

Break-even is reported as not computable — rather than as zero or infinity — when there are no
expected students or no expected revenue, since revenue per student is undefined in those cases.

---

## What is built

**MVP 1 — financial core:** seasons, categories, activities, transactions with fast entry and
filtering, monthly and season P&L, dashboard with KPIs, monthly income-vs-expense chart, income and
expense breakdowns, recent transactions.

**MVP 2 — course and subscription planner:** courses, course offerings, subscription products and
pricing, expected students, expected subscription mix, per-teacher costs, studio costs, course
revenue forecast, contribution profit and margin, break-even and safety margin, capacity utilisation,
season roll-up, and forecast vs actual.

### Deliberately not built

Attendance tracking, individual class scheduling, workshops/parties/festival as operational entities,
ticketing, bank and payment-provider integrations, automated accounting, and authentication.

The schema leaves room for them. In particular `students`, `subscriptions` and
`subscription_course_offerings` **exist as tables with no UI or services**: spec §6 requires the model
to express that one subscription may grant access to several course offerings, and having that
many-to-many in place now means an attendance-weighted revenue allocation can be added later without
migrating the financial core. The `activities.kind` column plays the same role for workshops, parties
and the festival.

---

## Known limitations

- **Authentication is a single shared credential.** There are no user accounts, so there is no record
  of *who* made a change — only that it was made. Adequate for a few trusted operators; not adequate
  if you need accountability.
- **Revenue is attributed to the offering the expected sale was entered against.** A subscription
  covering several courses is not yet split between them. The data model supports a better split;
  the planner does not implement one.
- **Single-user assumptions.** No optimistic locking; two people editing the same course plan at once
  will have the last save win.
- **The P&L is cash-basis** on transaction date, with no accruals or deferred revenue. A subscription
  spanning two months is recognised when it is recorded, not spread across the months it covers.
- **`transactions.status`** distinguishes `PENDING` from `SETTLED`, but reports currently include
  both. If pending amounts start to matter, reporting needs a filter.
- **Seasons may overlap** and nothing prevents it; a transaction belongs to at most one.
- **No pagination** on the transactions table. Fine for thousands of rows, not for millions.

## Possible next steps

Accrual treatment for multi-month subscriptions, which currently distorts month-on-month comparison
more than anything else here · attendance and attendance-weighted revenue allocation · workshops,
parties and Swing Buzz as first class entities with their own P&L · students and real subscription
sales feeding actuals
automatically · cash-flow timing · scenario comparison in the planner · CSV import from the bank ·
authentication.

---

## Testing

Three of the tests exercise Signature V4 against a **real S3 server** rather than a mock, because a
mock would accept an invalid signature and prove nothing. They skip themselves when no server is
reachable, so `npm test` works offline. To include them:

```bash
docker run -d --name minio-test -p 127.0.0.1:9100:9000 \
  -e MINIO_ROOT_USER=testkey -e MINIO_ROOT_PASSWORD=testsecret123 \
  minio/minio server /data
```


129 unit tests covering the calculation layer and the database constraints.

```bash
npm test
```

The calculation tests reproduce every worked example in the specification — the €1,040 contribution
and 34.7% margin, the 17-student break-even with a +8 safety margin, the €3,640 subscription mix, and
the full forecast-vs-actual table — and then push on the edges: zero revenue, zero students, zero
costs, zero weeks, negative and fractional inputs, and very large values. Where a value is undefined
(a margin with no revenue, break-even with no students), the code returns `null` and the UI renders
an em dash, rather than producing `NaN` or `Infinity`.

The database tests write invalid rows through the ORM and assert SQLite rejects them, so the §26
integrity rules are verified as constraints rather than assumed.

## Demo data

`npm run db:seed` **replaces all data** with a fictional dataset: two seasons (Spring 2026 closed
with a full set of actuals, Autumn 2026 in planning), four courses, the seven live subscription
products, four teachers, course plans for both seasons, and around forty transactions. Spring's
actuals are calibrated to land within a few percent of its plan so the forecast-vs-actual screen
shows a realistic near-miss.

The seed refuses to run when `NODE_ENV=production` and records a marker in `app_meta` that drives
the demo banner. To clear the banner without wiping data, delete that row:

```bash
npx tsx -e "import('./src/db/client').then(async ({db})=>{const {appMeta,DEMO_DATA_KEY}=await import('./src/db/schema');const {eq}=await import('drizzle-orm');db.delete(appMeta).where(eq(appMeta.key,DEMO_DATA_KEY)).run()})"
```
