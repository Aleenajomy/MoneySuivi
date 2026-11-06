-- MoneySuivi: read-only production check for the Salary Planner migrations.
-- Run with the session forced read-only, e.g.:
--   PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL" -f planner-migration-check.sql
-- It only SELECTs from catalog/metadata tables and never reads user financial rows.

SHOW default_transaction_read_only;   -- must print "on"

\echo '1. Latest Prisma migration history (expect both planner migrations finished, none rolled back)'
SELECT migration_name,
       started_at,
       finished_at,
       rolled_back_at,
       (logs IS NOT NULL) AS has_error_log
FROM "_prisma_migrations"
ORDER BY started_at DESC
LIMIT 6;

\echo '2. Planner tables present (expect 9 rows if 20261106000100_salary_planner is applied, 0 if not)'
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('IncomeSource', 'MonthlySalary', 'BudgetPlan', 'BudgetAllocation', 'AllocationAssignment',
                     'SavingsGoal', 'SavingsContribution', 'InvestmentPlan', 'InvestmentTransaction')
ORDER BY table_name;

\echo '3. Income kind constraints (INCENTIVE present only if 20261107000100_planner_incentive_kind is applied)'
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN ('IncomeSource_kind_check', 'MonthlySalary_kind_check');

\echo '4. Any failed or unfinished migration (expect 0 rows; a row here blocks every future deploy with P3009)'
SELECT migration_name, started_at
FROM "_prisma_migrations"
WHERE finished_at IS NULL AND rolled_back_at IS NULL;
