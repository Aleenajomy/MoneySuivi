-- MoneySuivi: READ-ONLY check for duplicate recurring transactions created by the edit bug.
-- Run with: PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL" -f recurring-duplicates-check.sql
-- Lists, per user, auto-created transactions that share title, category, amount, type and date with
-- another transaction of the same user (the recurring template itself or another copy).
-- It shows counts and dates only; no titles of other users are joined or changed.
SHOW default_transaction_read_only;   -- must print "on"

\echo 'Number of affected groups and extra rows in total'
WITH groups AS (
  SELECT "userId", title, category, amount, type, "expenseDate"::date AS day, COUNT(*) AS n,
         COUNT(*) FILTER (WHERE "isAutoCreated") AS auto
  FROM "Expense"
  GROUP BY "userId", title, category, amount, type, "expenseDate"::date
  HAVING COUNT(*) > 1 AND COUNT(*) FILTER (WHERE "isAutoCreated") >= 1
)
SELECT COUNT(*) AS duplicate_groups, COALESCE(SUM(n - 1), 0) AS extra_rows, COUNT(DISTINCT "userId") AS users_affected FROM groups;

\echo 'Detail (most extra rows first)'
SELECT "userId", title, amount, day, n AS rows_on_that_day
FROM (
  SELECT "userId", title, category, amount, type, "expenseDate"::date AS day, COUNT(*) AS n,
         COUNT(*) FILTER (WHERE "isAutoCreated") AS auto
  FROM "Expense"
  GROUP BY "userId", title, category, amount, type, "expenseDate"::date
  HAVING COUNT(*) > 1 AND COUNT(*) FILTER (WHERE "isAutoCreated") >= 1
) g
ORDER BY n DESC, day DESC
LIMIT 50;
