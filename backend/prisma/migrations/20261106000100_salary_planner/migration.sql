-- Salary & Monthly Financial Planner.
-- Additive only: new tables, indexes and foreign keys. No existing table or row is altered,
-- so rolling back the code leaves all existing data untouched.

-- CreateTable
CREATE TABLE "IncomeSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SALARY',
    "expectedAmount" DECIMAL(14,2) NOT NULL,
    "payDay" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlySalary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "incomeSourceId" TEXT,
    "label" VARCHAR(50) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SALARY',
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "expectedAmount" DECIMAL(14,2) NOT NULL,
    "receivedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3),
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlySalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAllocation" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "plannedAmount" DECIMAL(14,2) NOT NULL,
    "matchCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recurring" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "savingsGoalId" TEXT,
    "investmentPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationAssignment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllocationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "targetAmount" DECIMAL(14,2) NOT NULL,
    "initialAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "monthlyContribution" DECIMAL(14,2),
    "targetDate" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsContribution" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CONTRIBUTION',
    "amount" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "category" TEXT NOT NULL,
    "monthlyPlannedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentTransaction" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BUY',
    "amount" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" VARCHAR(300),
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomeSource_userId_active_idx" ON "IncomeSource"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySalary_expenseId_key" ON "MonthlySalary"("expenseId");

-- CreateIndex
CREATE INDEX "MonthlySalary_userId_year_month_idx" ON "MonthlySalary"("userId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySalary_incomeSourceId_year_month_key" ON "MonthlySalary"("incomeSourceId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetPlan_userId_year_month_key" ON "BudgetPlan"("userId", "year", "month");

-- CreateIndex
CREATE INDEX "BudgetAllocation_savingsGoalId_idx" ON "BudgetAllocation"("savingsGoalId");

-- CreateIndex
CREATE INDEX "BudgetAllocation_investmentPlanId_idx" ON "BudgetAllocation"("investmentPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAllocation_planId_name_key" ON "BudgetAllocation"("planId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AllocationAssignment_expenseId_key" ON "AllocationAssignment"("expenseId");

-- CreateIndex
CREATE INDEX "AllocationAssignment_allocationId_idx" ON "AllocationAssignment"("allocationId");

-- CreateIndex
CREATE INDEX "SavingsGoal_userId_archived_idx" ON "SavingsGoal"("userId", "archived");

-- CreateIndex
CREATE INDEX "SavingsContribution_goalId_date_idx" ON "SavingsContribution"("goalId", "date");

-- CreateIndex
CREATE INDEX "InvestmentPlan_userId_active_idx" ON "InvestmentPlan"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentTransaction_expenseId_key" ON "InvestmentTransaction"("expenseId");

-- CreateIndex
CREATE INDEX "InvestmentTransaction_planId_date_idx" ON "InvestmentTransaction"("planId", "date");

-- AddForeignKey
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlySalary" ADD CONSTRAINT "MonthlySalary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlySalary" ADD CONSTRAINT "MonthlySalary_incomeSourceId_fkey" FOREIGN KEY ("incomeSourceId") REFERENCES "IncomeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlySalary" ADD CONSTRAINT "MonthlySalary_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetPlan" ADD CONSTRAINT "BudgetPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BudgetPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_savingsGoalId_fkey" FOREIGN KEY ("savingsGoalId") REFERENCES "SavingsGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_investmentPlanId_fkey" FOREIGN KEY ("investmentPlanId") REFERENCES "InvestmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationAssignment" ADD CONSTRAINT "AllocationAssignment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationAssignment" ADD CONSTRAINT "AllocationAssignment_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "BudgetAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsContribution" ADD CONSTRAINT "SavingsContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentPlan" ADD CONSTRAINT "InvestmentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InvestmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Database-level guards behind the API validation. Prisma does not model CHECK constraints,
-- so they do not show up in `migrate diff`.
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_kind_check" CHECK ("kind" IN ('SALARY', 'ALLOWANCE', 'BONUS', 'OTHER'));
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_expectedAmount_check" CHECK ("expectedAmount" >= 0);
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_payDay_check" CHECK ("payDay" IS NULL OR "payDay" BETWEEN 1 AND 31);

ALTER TABLE "MonthlySalary" ADD CONSTRAINT "MonthlySalary_kind_check" CHECK ("kind" IN ('SALARY', 'ALLOWANCE', 'BONUS', 'OTHER'));
ALTER TABLE "MonthlySalary" ADD CONSTRAINT "MonthlySalary_month_check" CHECK ("month" BETWEEN 1 AND 12);
ALTER TABLE "MonthlySalary" ADD CONSTRAINT "MonthlySalary_amounts_check" CHECK ("expectedAmount" >= 0 AND "receivedAmount" >= 0);

ALTER TABLE "BudgetPlan" ADD CONSTRAINT "BudgetPlan_month_check" CHECK ("month" BETWEEN 1 AND 12);

ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_group_check" CHECK ("group" IN ('FIXED', 'VARIABLE', 'SAVINGS', 'INVESTMENT'));
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_plannedAmount_check" CHECK ("plannedAmount" >= 0);

ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_amounts_check" CHECK ("targetAmount" > 0 AND "initialAmount" >= 0 AND ("monthlyContribution" IS NULL OR "monthlyContribution" >= 0));

ALTER TABLE "SavingsContribution" ADD CONSTRAINT "SavingsContribution_type_check" CHECK ("type" IN ('CONTRIBUTION', 'WITHDRAWAL'));
ALTER TABLE "SavingsContribution" ADD CONSTRAINT "SavingsContribution_amount_check" CHECK ("amount" > 0);

ALTER TABLE "InvestmentPlan" ADD CONSTRAINT "InvestmentPlan_category_check" CHECK ("category" IN ('GOLD', 'GOLD_ETF', 'MUTUAL_FUND', 'INDEX_FUND', 'STOCK', 'OTHER'));
ALTER TABLE "InvestmentPlan" ADD CONSTRAINT "InvestmentPlan_monthlyPlannedAmount_check" CHECK ("monthlyPlannedAmount" >= 0);

ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_type_check" CHECK ("type" IN ('BUY', 'REDEEM'));
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_amount_check" CHECK ("amount" > 0);
