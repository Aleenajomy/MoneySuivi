-- Allows the INCENTIVE income kind. Only widens two CHECK constraints on planner tables;
-- every existing row already satisfies the new rule, so no data changes.
ALTER TABLE "IncomeSource" DROP CONSTRAINT "IncomeSource_kind_check";
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_kind_check" CHECK ("kind" IN ('SALARY', 'ALLOWANCE', 'BONUS', 'INCENTIVE', 'OTHER'));

ALTER TABLE "MonthlySalary" DROP CONSTRAINT "MonthlySalary_kind_check";
ALTER TABLE "MonthlySalary" ADD CONSTRAINT "MonthlySalary_kind_check" CHECK ("kind" IN ('SALARY', 'ALLOWANCE', 'BONUS', 'INCENTIVE', 'OTHER'));
