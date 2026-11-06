# MoneySuivi production runbook

How to deploy, migrate, roll back, back up and scale the backend safely. Read the
"First deploy of the hardening release" section before shipping branch
`hardening/production-readiness`.

## 1. Environment variables (backend)

The server refuses to start when a required variable is missing or unsafe.

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes (`production` on Render) | Enables the production checks below, JSON logs, and drops `localhost` from CORS. |
| `DATABASE_URL` | yes | Pooled Neon URL. |
| `DIRECT_URL` | yes | Direct (non-pooled) Neon URL, used by migrations. |
| `JWT_SECRET` | yes | At least 32 characters in production (`openssl rand -hex 32`). Changing it signs everyone out. |
| `JWT_EXPIRE` | no (default `7d`) | Session length. |
| `APP_URL` | recommended | Frontend origin used in reset links. Defaults to `https://smartexpencetracker-frontend.onrender.com` (a warning is logged when unset). |
| `EMAIL_USER`, `EMAIL_PASS` | yes for password reset | SMTP credentials. Without them reset emails are not delivered and users cannot recover accounts. |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_FROM` | no | Defaults: Gmail, 587, `EMAIL_USER`. TLS certificates are now verified. |
| `SUPPORT_EMAIL_TO` | yes for support tickets | Recipient of support tickets. Falls back to `EMAIL_TO`; there is no hardcoded address any more. Without it tickets return 503. |
| `CORS_ORIGINS` | no | Extra comma-separated origins on top of the two Render URLs. |
| `APP_TIMEZONE` | no (default `Asia/Kolkata`) | Timezone of the midnight and 9 PM jobs. |
| `CRON_ENABLED` | no (default on) | Set `false` on every instance except one if you ever run more than one. |
| `RATE_LIMIT_ENABLED` | no (default on) | Only disable for load testing. |
| `PASSWORD_RESET_TTL_MINUTES` | no (default 30) | Reset link lifetime. |
| `VAPID_*`, `FIREBASE_*` | no | Push notifications; unchanged. |

## 2. Build and start commands

- Build: `npm install && npm run build`. `npm run build` is now
  `prisma generate && prisma migrate deploy` (it used to be `prisma db push`). Confirm the
  Render build command calls `npm run build`; if it calls `prisma db push` directly, change it.
- Start: `npm start`.
- Health check path: `/api/health`. It now returns 503 when the database is unreachable, so it
  is suitable as Render's health check.

`migrate deploy` only applies committed migrations and never resets data. If it fails, the build
fails and Render keeps serving the previous version.

## 3. First deploy of the hardening release

### 3.1 Before deploying

1. **Take a backup** (see section 5). On Neon, create a branch from the production branch named
   e.g. `pre-hardening-2026-10`; it is an instant copy you can restore from.
2. **Check migration state** with a read-only command from a trusted machine:
   ```bash
   cd backend
   DATABASE_URL="<prod direct url>" DIRECT_URL="<prod direct url>" npx prisma migrate status
   ```
   - If it lists the five migrations from `20260602000100_init` to
     `20260608161225_add_flexible_repayments` as applied and two as not yet applied, go on to 3.2.
   - If it reports that the database is not managed by migrations (`P3005`, or no
     `_prisma_migrations` table), the schema was created entirely with `db push`. Baseline it
     once by marking the five historical migrations as applied. This only writes rows to
     `_prisma_migrations` and does not touch your tables:
     ```bash
     for m in 20260602000100_init 20260605042428_add_recurring_budget_notifications \
              20260605121649_add_emi_assets_liabilities 20260608000100_add_account_balances \
              20260608161225_add_flexible_repayments; do
       npx prisma migrate resolve --applied "$m"
     done
     ```
3. **Set the new environment variables** on the backend service: `APP_URL`,
   `SUPPORT_EMAIL_TO`, and SMTP if it isn't set already. Make sure `JWT_SECRET` is at least 32
   characters; if you have to change it, every user will need to sign in again.

### 3.2 What the migrations do

| Migration | Effect | Risk |
|---|---|---|
| `20261019000100_sync_db_push_tables` | Creates `LedgerContact`, `LedgerEntry`, `PushSubscription`, `FcmToken`, their indexes and foreign keys **only if missing**; sets the `Expense.paymentMethod` default to `'UPI'` (matches the schema). | None for existing data. Rehearsed on a `db push` database with data: row counts unchanged. |
| `20261019000200_password_reset_and_session_version` | Adds `User.tokenVersion INT DEFAULT 0` and a `PasswordResetToken` table. | Additive. Old code ignores both, so rolling back the code stays safe. |
| `20261106000100_salary_planner` | Creates the Salary Planner tables (`IncomeSource`, `MonthlySalary`, `BudgetPlan`, `BudgetAllocation`, `AllocationAssignment`, `SavingsGoal`, `SavingsContribution`, `InvestmentPlan`, `InvestmentTransaction`) with `DECIMAL(14,2)` amounts, indexes, foreign keys and CHECK constraints. No existing table is altered. | Additive. Rehearsed on a seeded database: existing rows checksum-identical before and after. To undo, drop the nine tables (no existing data references them) and delete the migration row. |
| `20261107000100_planner_incentive_kind` | Widens the `kind` CHECK constraint on `IncomeSource` and `MonthlySalary` to allow `INCENTIVE`. | None: only replaces two constraints on planner tables; every existing row already satisfies the wider rule. |

Both scenarios were rehearsed locally against databases built the way production was, with
seeded data:

- A: old migrations plus `db push` tables. `migrate deploy` applied both migrations and data was
  preserved.
- B: pure `db push`. A plain `migrate deploy` failed safely with `P3005` and changed nothing;
  after the baseline in 3.1 it applied both and data was preserved.

In both, the result matched `schema.prisma` exactly.

### 3.3 Deploy

1. Deploy the backend. The build applies the migrations.
2. Deploy the frontend straight after. The old frontend's forgot-password form sends
   `{email, newPassword}`. The new API answers with a generic "link sent" message and **does
   not change the password**, so users on a stale PWA cache will be told their password was
   reset when it wasn't, until the service worker updates. Deploy both together to keep that
   window short.
3. Existing sessions stay valid: tokens issued before the release have no version and are
   treated as version 0.

### 3.4 Verify

- `GET /api/health` returns `{"database":"up"}`.
- Sign in with a real account.
- Request a password reset for your own address, follow the emailed link, and confirm the old
  session is signed out afterwards.
- Add a transaction and check the dashboard balances.
- The next morning, look for `[Cron] recurring completed` in the logs, with `created` and
  `failed` counts.

## 4. Rollback

- **Code:** use Render's "Rollback" to the previous deploy, for both services. This is safe
  with the new schema because the migrations are additive.
- **Warning:** rolling back the backend brings back the vulnerable
  `POST /api/auth/forgot-password` that sets any account's password from just an email. Only
  roll back for a short time, and take the service offline instead if the issue is unrelated
  to authentication.
- **Schema:** don't roll back migrations. If you really must, the new objects can be dropped
  with `DROP TABLE "PasswordResetToken"; ALTER TABLE "User" DROP COLUMN "tokenVersion";` and
  the migration row deleted from `_prisma_migrations`. The tables in the sync migration
  already existed in production and must **not** be dropped.

## 5. Backups and restore

**What has been verified:** the `pg_dump`/`pg_restore` procedure below round-trips a database
exactly. Tested locally with 20,000 synthetic transactions: same row count, same amount total,
and migration history preserved.

**What has not been verified:** Neon's own point-in-time restore window and retention for this
project's plan. Check them in the Neon console (Project → Settings → Storage / History
retention) and run a test restore to a new branch at least once.

Logical backup from a trusted machine (use the direct, non-pooled URL):

```bash
pg_dump --format=custom --no-owner --dbname "<prod direct url>" --file moneysuivi-$(date +%F).dump
```

Restore into an **empty** database or a new Neon branch, never over production:

```bash
pg_restore --no-owner --dbname "<empty target url>" moneysuivi-YYYY-MM-DD.dump
# verify
psql "<target url>" -c 'select count(*), sum(amount) from "Expense";'
```

Backup files contain every user's financial data. Store them encrypted and delete old copies.

## 6. Logging and monitoring

- In production, logs are JSON lines. Keys whose names suggest secrets (`password`, `token`,
  `secret`, `authorization`, `cookie`) are redacted. Request bodies are no longer logged; the
  EMI controller used to log full request bodies.
- Clients get a generic message for any unexpected error. The stack trace is in the logs.
- Each cron job logs `completed` or `failed` with its duration and counts. Set a Render log
  alert on `"[Cron]"` together with `failed`.
- Recommended next step: an external uptime monitor on `/api/health`.

### 6.1 Login log

Every successful sign-in through `POST /api/auth/login` adds a row to the `LoginEvent` table:
the user and the time, nothing else. Failed attempts and registrations are not recorded. Rows
are deleted along with their user. There is no UI. Read the table from the Neon SQL editor:

```sql
-- Most recent sign-ins
SELECT u.name, u.email, e."createdAt" AS "loggedInAt"
FROM "LoginEvent" e JOIN "User" u ON u.id = e."userId"
ORDER BY e."createdAt" DESC
LIMIT 100;

-- Last sign-in and total sign-ins per user
SELECT u.name, u.email, MAX(e."createdAt") AS "lastLogin", COUNT(e.id) AS "logins"
FROM "User" u LEFT JOIN "LoginEvent" e ON e."userId" = u.id
GROUP BY u.id
ORDER BY "lastLogin" DESC NULLS LAST;
```

Times are stored in UTC. The log starts empty on the day this release is deployed, because
earlier sign-ins were never stored.

## 7. Capacity and scaling

### 7.1 Measured results

Test setup: a laptop with an AMD Ryzen 7 5825U (8 cores / 16 threads), Node 22,
Postgres 16 in Docker on the same machine, and one synthetic user with 20,000 transactions.
Tool: autocannon, 10 connections for 15 s per endpoint, rate limiting and cron disabled.
Reproduce with `backend/loadtest/seed.js` and `backend/loadtest/run.sh`.

| Endpoint | Before (main `6d47754`) | After | Why |
|---|---|---|---|
| `GET /api/expenses/analytics` | 17 req/s, p50 593 ms, p99 809 ms | 200 req/s, p50 48 ms, p99 74 ms | Balances are aggregated in SQL instead of loading every transaction. |
| `GET /api/expenses/balances` | 19 req/s, p50 505 ms | 575 req/s, p50 17 ms | Same. |
| `GET /api/networth/summary` | 19 req/s, p50 518 ms | 532 req/s, p50 18 ms | Same. |
| `GET /api/expenses?page=1` | 916 req/s, p50 10 ms | 929 req/s, p50 10 ms | Unchanged; page size is now capped at 100. |
| `GET /api/budgets` | 1368 req/s, p50 6 ms | 1362 req/s, p50 6 ms | Unchanged. |
| Peak backend memory (RSS) | **725 MB** | **239 MB** | The old code exceeded a 512 MB Render instance with large histories. |
| `POST /api/auth/login` | 4 req/s, p50 2.4 s | 22 req/s, p50 398 ms | Native bcrypt no longer blocks the event loop. |
| Other requests during a login flood | blocked ~243 ms per login | `/api/budgets` p99 7 ms | Same. |

At 50 connections, analytics held about 197 req/s with p50 243 ms and p99 484 ms. It is
throughput-bound at that point.

### 7.2 What these numbers do and don't say

- They come from a fast laptop with a local database. A Render instance has a fraction of a
  CPU, and Neon adds network latency to every query, so expect lower throughput and higher
  latency there. The before/after ratios are what carry over. Re-run `loadtest/run.sh` against
  a staging service (never production) to get absolute numbers for your Render plan.
- Login is CPU-bound by design (bcrypt cost 12). It is the first thing to saturate on a small
  instance.

### 7.3 Known limits and scaling triggers

- **Single instance assumed.** Rate-limit counters are in memory per process, and the cron jobs
  run in every process that has `CRON_ENABLED` on. Recurring transactions are protected against
  duplicates across instances (compare-and-swap), but daily summaries and EMI reminders would be
  sent once per instance. Before adding a second instance: set `CRON_ENABLED=false` on all but
  one, and move rate limiting to a shared store (e.g. Redis via `rate-limit-redis`).
- **Daily summary** sends one notification per user in sequence. That is fine for thousands of
  users; consider batching past roughly 10k.
- **Exports** load the full filtered history into memory. That is fine at 20k rows; add
  streaming or a row cap if users reach hundreds of thousands.
- **Scale up when:** p95 latency on `/api/expenses/analytics` stays above 500 ms, CPU stays
  above 70%, memory goes above 70% of the instance, or the Neon connection limit is approached.
  Vertical scaling (a larger Render instance) is the first step; nothing here needs queues or
  microservices yet.

## 8. Known limitations and follow-up work

- **Money is stored as `Float` (double precision).** All writes and reported totals are now
  rounded to paise and inputs are limited to 2 decimals. For balances in the tens of crores
  this keeps results exact, but the type is not ideal for money. The migration plan to `Decimal`
  is in `docs/AUDIT.md`. It changes column types on live data and the API's number format, so
  it needs a deliberate decision and a maintenance window.
- **Session token in `localStorage`.** Any XSS in the frontend could read it. Moving to an
  httpOnly cookie needs CSRF protection and a coordinated frontend change.
- **No email verification at registration**, and registration still says when an email is
  already registered. That is a standard UX trade-off, mitigated by rate limiting.
- **No self-service account deletion endpoint.**
- **Remaining `npm audit` advisories need major upgrades.** I didn't do them here; upgrade one
  at a time, each with the full test suite.
  - Backend (3 high): all in the Prisma CLI's config loader (`@prisma/config` → `deepmerge-ts`),
    which runs at build time, not in the request path. Fixed in Prisma 7, which needs a new
    config file and driver adapters.
  - Frontend build tooling: `vite` 5 → 8, `vite-plugin-pwa` → 1.x/2.x, `tailwindcss` 3 → 4.
    These run on developer machines and CI, not in users' browsers.
  - Frontend runtime: `react-router-dom` 6 → 7 (moderate), and `firebase` 12, whose advisories
    are in `@firebase/firestore` / `@grpc/grpc-js`. The app only uses Firebase Messaging; npm's
    suggested "fix" is a downgrade to 9.x, so leave it and recheck when firebase releases a patch.

## 9. Salary Planner release

The Salary Planner (Phases 2–7) adds the **Salary Planner** screen:

- seven tabs: Overview, Salary, Budget, Spending, Goals, Invest and Bills;
- the `/api/planner/*` endpoints, documented in [PLANNER_API.md](PLANNER_API.md);
- a nightly bill reminder.

It reuses the existing transactions, EMIs and recurring payments. It never creates a copy of
them.

### 9.1 What changes in production

| Change | Effect |
|---|---|
| Migrations `20261106000100_salary_planner` and `20261107000100_planner_incentive_kind` | **Additive.** They add nine new tables and widen one CHECK constraint. No existing table or row is altered. See §3.2. |
| Phases 3–7 | No further migrations. |
| History edit and delete of a transaction (`expenseController`) | If the transaction backs a received salary in the planner and the change turns it into something else (an expense, an investment, another month) or deletes it, that salary record goes back to pending, in the same database transaction. All other transactions behave exactly as before. |
| Recurring edits (fix #16) | Editing a recurring payment no longer moves its schedule backwards, so it no longer re-creates past occurrences. Turning recurring back on starts from today. |
| Nightly job (00:00 Asia/Kolkata) | A new `bill-reminders` step runs after `recurring` and `emi-reminders`. |
| Reset All Data | Also deletes the user's planner data, in the same transaction. |

### 9.2 Before deploying

1. **Take a backup or Neon branch** (§5).
2. **Check the migration state, read-only.** This only reads catalog tables and migration history,
   never user records:

   ```
   PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL" -f docs/sql/planner-migration-check.sql
   ```

   - Both planner migrations should be finished, and section 4 of the output (failed migrations)
     should be empty.
   - A failed migration blocks every deploy with `P3009`. Stop and investigate it before
     deploying again; never reset the database.
3. **Check for duplicate recurring transactions**, read-only. The edit bug fixed in #16 may already
   have created some:

   ```
   PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL" -f docs/sql/recurring-duplicates-check.sql
   ```

   Any cleanup is a separate, reviewed step, done after the backup.
4. **Check Render.** Confirm the backend's build command is `npm install && npm run build` (which
   runs `prisma migrate deploy`), and check whether Auto-Deploy is on for `main`. If it is, merging
   is deploying.

### 9.3 Deploy

1. Deploy the **backend** first. Its build applies any pending migration. A failed migration fails
   the build, and Render keeps serving the previous version.
2. Then deploy the **frontend**. The new screens only call endpoints that the new backend already
   serves.

### 9.4 Smoke test after deploying

These need no account:

```
curl -s https://smartexpencetracker.onrender.com/api/health                     # 200, "database":"up"
curl -s -o /dev/null -w '%{http_code}\n' https://smartexpencetracker.onrender.com/api/planner/report   # 401 (route exists, needs sign-in)
```

Then, in the app, signed in with a **test account**:

1. Open **Salary Planner**. Each tab loads without a "Could not load" message.
2. Add a salary source, mark it received, and confirm one income appears in History.
3. Add a budget line, then an expense in History, and confirm the line's "Spent" updates.
4. Add money to a goal, and confirm no transaction appears in History.
5. Record an investment buy, and confirm exactly one Investment transaction appears in History.
6. Open **Bills** and check the recurring payments and EMIs you know about.

### 9.5 Monitoring

- **Nightly job.** Render logs show `[Cron] recurring completed`, `[Cron] emi-reminders completed`
  and `[Cron] bill-reminders completed` with counts and duration. Alert on `[Cron] … failed`.
- **Errors.** Planner endpoints log errors as `planner.<action>` through the same redacting logger.
  No request bodies or amounts are logged.
- **Latency.** `node loadtest/planner-latency.js 20000`, run against a **local test** database,
  seeds 20,000 transactions plus a year of planner data and times every read endpoint. It refuses
  any non-local, non-test database. On a laptop, p50 is:

  | Endpoint | p50 |
  |---|---|
  | overview | 22 ms |
  | report (6 months) | 71 ms |
  | report (12 months) | 138 ms |
  | bills | 13 ms |
  | spending | 20 ms |
  | goals | 4 ms |
  | investments | 14 ms |

  A small Render instance will be several times slower. The report is the heaviest endpoint
  because it recomputes each month in its trend. It is capped at 12 months, and it computes two
  months at a time so it can't exhaust the connection pool shared with the rest of the app.

### 9.6 Rollback

- **Code.** Use Render's Rollback for both services. This is safe because the planner migrations
  are additive and the previous code ignores the new tables.
  - Rolling back past #16 brings back the recurring-edit duplicate bug.
  - Rolling back past the Phase 4 review fix brings back the History reset gap for linked salaries.
- **Schema.** Don't roll back migrations. If it is ever really necessary, the nine planner tables
  can be dropped, because nothing outside the planner references them. Then delete their rows from
  `_prisma_migrations`.

### 9.7 Known limitations

These are documented in PLANNER_API.md:

- A savings withdrawal may be dated before the deposits that cover it. Only the overall balance is
  checked.
- EMI payments keep their time of day, so one made just after midnight IST on the 1st can be
  grouped into the previous month.
- A recurring bill that was stopped, or an EMI that was completed, no longer appears in past
  months unless a payment was made that month.
- A recurring bill created after midnight for the next day gets no reminder.
- **No linter is configured** in either package. `vite build` and `node --check` are the static
  checks.
