-- Simplified Salary Planner. Additive only: three new columns with defaults and one nullable link,
-- so every existing row keeps its values and no transaction, EMI payment or balance changes.

-- "Already in my balance": a record can be received with no income transaction behind it.
ALTER TABLE "MonthlySalary" ADD COLUMN "countedInBalance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MonthlySalary" ADD CONSTRAINT "MonthlySalary_countedInBalance_check" CHECK (NOT "countedInBalance" OR "expenseId" IS NULL);

-- Explicit, user-confirmed link from an EMI-tracker payment to the History expense that is the same money.
ALTER TABLE "EMIPayment" ADD COLUMN "expenseId" TEXT;
CREATE UNIQUE INDEX "EMIPayment_expenseId_key" ON "EMIPayment"("expenseId");
ALTER TABLE "EMIPayment" ADD CONSTRAINT "EMIPayment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Share of the remaining money suggested as savings. A calculation input only.
ALTER TABLE "BudgetPlan" ADD COLUMN "savingsPercent" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "BudgetPlan" ADD CONSTRAINT "BudgetPlan_savingsPercent_check" CHECK ("savingsPercent" BETWEEN 0 AND 100);
