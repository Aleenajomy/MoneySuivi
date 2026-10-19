# MoneySuivi security and correctness audit — October 2026

**Scope:** the backend (Express, Prisma, PostgreSQL), the frontend (React PWA), migrations,
CI and dependencies at `main` `6d47754`.

**Method:**
- Read every route, controller, service and middleware.
- Applied the migrations to an empty Postgres and diffed the result against `schema.prisma`.
- Ran `npm audit`.
- Load-tested before and after on synthetic data.

Every fix has an automated test. For the regression fixes marked **[mutation-checked]**, I put
the original bug back and confirmed the test fails.

**Severity:**
- Critical: account takeover or cross-user data access.
- High: wrong financial data, or a likely outage.
- Medium: limited security or correctness impact.
- Low: hardening.

## Fixed

| # | Severity | Finding | Where (before) | Fix | Test |
|---|---|---|---|---|---|
| C1 | Critical | `POST /api/auth/forgot-password` took `{email, newPassword}` with no verification, so anyone who knew an email could take over the account. | `controllers/authController.js` `forgotPassword` | Emailed single-use token: 32 random bytes, stored as SHA-256, 30-minute expiry. It is consumed with a conditional update inside a transaction, so concurrent replays succeed exactly once. The response is identical for unknown emails and doesn't wait for the email to send. A successful reset revokes all sessions. The old payload no longer changes anything. | `auth.test.js`: legacy payload regression, lifecycle, replay, expiry, concurrency, superseded link **[mutation-checked]** |
| H1 | High | Asset and liability updates spread `req.body` into Prisma, so a client could set `userId` and move a record into another account (or alter `id`). | `controllers/netWorthController.js` `updateAsset`/`updateLiability` | Explicit allow-list of fields, plus validation. | `authorization.test.js` mass-assignment test **[mutation-checked]** |
| H2 | High | Recurring occurrences didn't copy `accountType`/`fromAccountType`/`toAccountType`, so every auto-created UPI, Bank or Card transaction counted against **Cash**, and recurring transfers moved Bank → Cash. | `services/cronJob.js` | All fields copied; the occurrence uses its scheduled date. | `finance.test.js` **[mutation-checked]** |
| H3 | High | No rate limiting on login, register or password reset (credential stuffing, mail bombing). | `routes/auth.js` | Per-IP and per-account limits on login; per-IP limits on register and reset; per-IP and per-email limits on forgot-password; limits on support tickets; a general API limit. `trust proxy` is set so Render clients aren't all counted as one IP. | `auth.test.js` rate-limit tests |
| H4 | High | Migration drift: `LedgerContact`, `LedgerEntry`, `PushSubscription` and `FcmToken` existed only through `prisma db push`, and the build ran `db push`. A database rebuilt from migrations would be missing those tables. | `prisma/migrations`, `package.json` | Idempotent sync migration; the build runs `migrate deploy`; CI fails if the migrations diverge from the schema. Rehearsed on `db push`-built databases with data (see PRODUCTION.md §3). | CI `migrate diff --exit-code` |
| H5 | High | Analytics, balances and net worth loaded **every transaction** on each request: 17–19 req/s, p50 about 0.5–0.6 s and 725 MB peak memory with 20k transactions, above a 512 MB Render instance. | `controllers/expenseController.js`, `netWorthController.js` | SQL `groupBy` over account combinations (`services/balanceService.js`). Measured 12–30× faster, 239 MB peak. | Unit test: aggregated rows equal per-row results; load test |
| H6 | High | `bcryptjs` blocked the event loop for about 243 ms per login, so login capped at 4 req/s and stalled all other requests. | `authController.js` | Native `bcrypt` (same hash format, verified both ways): 22 req/s, other requests unaffected. | Load test |
| H7 | High | Vulnerable runtime dependencies: `proxy-addr` (critical, via express), `nodemailer` ≤ 10.0.8 (high: credential disclosure, DoS), `axios`, `form-data`, `qs`, `body-parser`. | lockfiles | `npm audit fix`, nodemailer 10.1.7. | CI `npm audit --audit-level=critical` |
| M1 | Medium | Login said whether the email existed (404 vs 401, different codes and messages). | `authController.js` `login` | One 401 `INVALID_CREDENTIALS`, plus a bcrypt compare against a dummy hash so timing matches. | `auth.test.js` |
| M2 | Medium | Support email inserted user text into HTML unescaped, header injection was possible through the subject, there was a hardcoded personal fallback recipient, and SMTP TLS verification was off (`rejectUnauthorized: false`). Failures returned `success: true`. | `routes/support.js`, `services/mailService.js` | Escaping, CR/LF stripping, `SUPPORT_EMAIL_TO` with 503 when unset, TLS verification on, honest status codes, length limits. | `finance.test.js` support test |
| M3 | Medium | `error.message` was returned to clients from every controller (Prisma and SQL details). | all controllers | `utils/http.js` generic 500s; details go to redacted logs. | `validation.test.js` leak test |
| M4 | Medium | `/api/expenses/analytics-debug` was live in production. | `expenseController.js` | Removed. | `authorization.test.js` |
| M5 | Medium | Concurrent EMI "Pay" requests could record two payments against one installment count. | `emiController.js` | Optimistic lock on `updatedAt` in the same transaction; the loser gets 409. | `finance.test.js` **[mutation-checked]** |
| M6 | Medium | Budget-alert de-duplication queried `category = 'Food'` while alerts are stored as `'Budget Alert'`. It never matched, so every expense over 80% raised another alert. | `services/budgetAlertService.js` | Query on the stored category and message prefix. | `finance.test.js` **[mutation-checked]** |
| M7 | Medium | `setMonth` overflow: a monthly item on Jan 31 ran on Mar 3, and EMI due dates drifted the same way. | `cronJob.js`, `expenseController.js`, `emiController.js` | Month-end clamping computed from the anchor date (Jan 31 → Feb 28 → Mar 31). | `recurrence.test.js` |
| M8 | Medium | The midnight cron ran on server time (UTC, which is 05:30 IST), had no protection against duplicate runs across instances or retries, and never caught up properly after downtime. | `cronJob.js` | `Asia/Kolkata` schedule; compare-and-swap per occurrence; catch-up capped at 60 per run; logs outcome and duration. | `finance.test.js`: concurrent runs, catch-up, IST boundary **[mutation-checked]** |
| M9 | Medium | Reset-all ran unrelated deletes in parallel without a transaction, left ledger data behind, and had no server-side confirmation. | `authController.js` `resetAllData` | One transaction covering all financial tables; requires the account password. Devices and the account itself are kept. | `finance.test.js`: completeness, atomicity, other-user isolation |
| M10 | Medium | No validation on EMI, ledger, net worth, notifications, profile, budget updates or list queries. NaN amounts, invalid dates and bad ids caused 500s; page size was unlimited. | routes | express-validator on every route: amounts > 0 with ≤ 2 decimals, ISO dates, enums, lengths, UUID ids, `limit` ≤ 100. | `validation.test.js` |
| M11 | Medium | Password change didn't revoke other sessions; the JWT algorithm wasn't pinned. | `middleware/auth.js` | `tokenVersion` claim checked on every request; HS256 pinned; the changing device gets a new token. | `auth.test.js` |
| M12 | Medium | EMI create and update logged full request bodies (financial data). | `emiController.js` | Removed; the logger redacts secret-like keys. | — |
| M13 | Medium | CSV export allowed spreadsheet formulas (`=HYPERLINK(...)` in a title). | `exportController.js` | Cells starting with `= + - @` are prefixed with a quote. | `finance.test.js` |
| L1 | Low | CORS preflight used `cors()` defaults, so `OPTIONS` allowed every origin. | `server.js` | Preflight uses the same allow-list. | `validation.test.js` |
| L2 | Low | No security headers; `X-Powered-By` exposed. | `server.js` | `helmet`. | `validation.test.js` |
| L3 | Low | Duplicate `/budgets` mount without `/api`, and an unused `/api/transactions` alias. | `server.js` | Removed. Neither is called by the frontend (checked every `api.*` call). | `authorization.test.js` |
| L4 | Low | Weak or missing `JWT_SECRET` wasn't detected at startup. | `server.js` | `config/env.js` fails fast (≥ 32 characters in production). | Manual smoke test |
| L5 | Low | Password policy was 6 characters, with no maximum (bcrypt truncates at 72 bytes). | auth routes, UI | 8–72 for new passwords; existing passwords still sign in. | `auth.test.js`, Playwright |
| L6 | Low | A Playwright test (`cash-balance-and-startup`) failed on `main` with a strict-mode selector violation. | test | Selector fixed. | Playwright |

## Open: accepted or needing a decision

| # | Item | Why it is still open | Recommendation |
|---|---|---|---|
| O1 | Money stored as `Float`. | Changing column types on live financial data, plus the API number format, is a decision for the owner, not a side effect of a hardening pass. Current mitigation: inputs limited to 2 decimals and every stored or reported amount rounded to paise. Rounding to paise after each operation keeps totals correct while values stay far below 2^53 paise (about ₹90 trillion), which covers this app's ranges. | Plan below. |
| O2 | JWT stored in `localStorage`. | Moving to an httpOnly cookie needs CSRF protection and a coordinated frontend/TWA change. | Do it together with a Content Security Policy on the frontend host. |
| O3 | Registration reveals existing emails (409). | Hiding it requires email verification at sign-up. Mitigated by rate limits. | Add email verification. |
| O4 | Rate limits and cron assume one backend instance. | Shared state (Redis) isn't justified for one instance. | See PRODUCTION.md §7.3 before scaling out. |
| O5 | Manually created liabilities (`/api/networth/liabilities`) aren't counted in net worth. | Deliberate (commit `caa0cb9`; the UI says liabilities come from Loans and EMIs). | Confirm the intent; remove the unused endpoints or include them. |
| O6 | Budget and analytics month ranges use server time. | Dates are stored as UTC midnight of the chosen calendar day, so this matches what users pick. Only legacy rows with a time of day near midnight IST could fall into the neighbouring month. | Leave as is; revisit if timed transactions are added. |
| O7 | Major dependency upgrades (Prisma 7, Vite 8, Tailwind 4, React Router 7). | Breaking changes; remaining advisories are in build tooling, plus a moderate one in React Router. | One upgrade per PR with the full suite. |
| O8 | Frontend refactor of the large pages (EMITracker 721 lines, Dashboard 626, Ledger 617). | Not started: this pass prioritised security and financial correctness, and the existing UI behaviour is covered only by mocked Playwright tests. A refactor without stronger UI tests risks regressions. The frontend still duplicates `getLoanDetails` from the backend. | Next phase: extract shared loan and balance maths into one module, add component tests, then split the pages. |

## Migration plan: Float → Decimal (O1)

1. **Inventory.** Money columns: `Expense.amount`, `Budget.monthlyLimit`, `User.budgetLimit`,
   `EMI.totalAmount`/`emiAmount`/`paidAmount`, `EMIPayment.amount`, `Asset.value`,
   `Liability.value`, `LedgerEntry.amount`. Not money: `EMI.interestRate`,
   `Notification.percentage`.
2. **Measure.** Run against production, read-only:
   `SELECT count(*) FROM "Expense" WHERE amount::numeric <> round(amount::numeric, 2);`
   for each column. Any rows with more than 2 decimals predate the new validation; decide and
   document their rounding (half-up to paise).
3. **Code first.** Represent amounts as integer paise or `Prisma.Decimal` inside calculations,
   and convert at the API boundary so the frontend keeps receiving numbers. Integer paise stays
   exact up to ₹90 trillion. Update `utils/money.js`, `loanUtils`, `accountBalances` and their
   tests.
4. **Migration.** For each column:
   `ALTER TABLE ... ALTER COLUMN ... TYPE NUMERIC(14,2) USING round(col::numeric, 2)`.
   This rewrites the table under an exclusive lock, so run it in a short maintenance window
   after a Neon branch backup.
5. **Verify.** Compare per-user `count` and `sum` of every money column before and after; they
   must match to the paisa. Re-run the integration suite against a restored copy.

## How to verify this report

```bash
cd backend && TEST_DATABASE_URL=postgresql://test:test@localhost:55432/moneysuivi_test npm test
cd frontend && npm run build && npx playwright test
```

Results at the time of writing:
- Backend: 24 unit and 45 integration tests passed.
- Frontend: production build succeeded; 41 Playwright tests passed.
- Audits: `npm audit --audit-level=critical` is clean in both packages.
