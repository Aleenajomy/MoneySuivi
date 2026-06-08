ALTER TABLE "Expense" ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'Cash';
ALTER TABLE "Expense" ADD COLUMN "fromAccountType" TEXT;
ALTER TABLE "Expense" ADD COLUMN "toAccountType" TEXT;

UPDATE "Expense"
SET "accountType" = CASE
  WHEN LOWER(TRIM(COALESCE("paymentMethod", ''))) = 'upi' THEN 'UPI'
  WHEN LOWER(TRIM(COALESCE("paymentMethod", ''))) IN ('debit card', 'net banking', 'bank', 'bank transfer') THEN 'Bank'
  WHEN LOWER(TRIM(COALESCE("paymentMethod", ''))) = 'credit card' THEN 'Credit Card'
  WHEN LOWER(TRIM(COALESCE("paymentMethod", ''))) = 'wallet' THEN 'Wallet'
  ELSE 'Cash'
END
WHERE "accountType" = 'Cash';

CREATE INDEX "Expense_userId_accountType_idx" ON "Expense"("userId", "accountType");
