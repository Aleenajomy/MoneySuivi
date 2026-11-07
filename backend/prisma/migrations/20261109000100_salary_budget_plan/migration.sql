-- Simple monthly salary plan. Additive only: nine nullable planning columns on BudgetPlan, so every
-- existing row, transaction, EMI, EMI payment and balance is left exactly as it was.
ALTER TABLE "BudgetPlan"
  ADD COLUMN "salaryAmount" DECIMAL(14,2),
  ADD COLUMN "allowanceAmount" DECIMAL(14,2),
  ADD COLUMN "rentAmount" DECIMAL(14,2),
  ADD COLUMN "emiAmount" DECIMAL(14,2),
  ADD COLUMN "emergencySavingsAmount" DECIMAL(14,2),
  ADD COLUMN "generalSavingsAmount" DECIMAL(14,2),
  ADD COLUMN "shoppingAmount" DECIMAL(14,2),
  ADD COLUMN "travelAmount" DECIMAL(14,2),
  ADD COLUMN "foodAmount" DECIMAL(14,2);

ALTER TABLE "BudgetPlan" ADD CONSTRAINT "BudgetPlan_salaryPlan_amounts_check" CHECK (
  ("salaryAmount" IS NULL OR "salaryAmount" >= 0) AND
  ("allowanceAmount" IS NULL OR "allowanceAmount" >= 0) AND
  ("rentAmount" IS NULL OR "rentAmount" >= 0) AND
  ("emiAmount" IS NULL OR "emiAmount" >= 0) AND
  ("emergencySavingsAmount" IS NULL OR "emergencySavingsAmount" >= 0) AND
  ("generalSavingsAmount" IS NULL OR "generalSavingsAmount" >= 0) AND
  ("shoppingAmount" IS NULL OR "shoppingAmount" >= 0) AND
  ("travelAmount" IS NULL OR "travelAmount" >= 0) AND
  ("foodAmount" IS NULL OR "foodAmount" >= 0)
);
