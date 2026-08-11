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
| `npm run db:studio` | Drizzle Studio, to browse the database |

The database file defaults to `./data/swing-society.db` and is gitignored. Override with
`DATABASE_URL=/path/to/file.db`. Backing up the app means copying that one file.

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

- **No authentication.** Anyone who can reach the port can read and edit everything. Run it on a
  trusted network, or put a reverse proxy with auth in front of it before exposing it.
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

Attendance and attendance-weighted revenue allocation · workshops, parties and Swing Buzz as first
class entities with their own P&L · students and real subscription sales feeding actuals
automatically · cash-flow timing · scenario comparison in the planner · CSV import from the bank ·
authentication.

---

## Testing

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
