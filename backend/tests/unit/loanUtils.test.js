const test = require('node:test');
const assert = require('node:assert/strict');
const { getLoanDetails } = require('../../utils/loanUtils');

const close = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);

// Standard EMI formula: E = P r (1+r)^n / ((1+r)^n - 1)
const emiFor = (P, annualRate, n) => {
  const r = annualRate / 12 / 100;
  return (P * r * (1 + r) ** n) / ((1 + r) ** n - 1);
};

test('fixed EMI without interest: remaining = total - paid installments', () => {
  const d = getLoanDetails({ type: 'FIXED', totalAmount: 12000, emiAmount: 1000, totalInstallments: 12, paidInstallments: 3, paidAmount: 3000, interestRate: null });
  assert.equal(d.hasInterest, false);
  assert.equal(d.remainingBalance, 9000);
  assert.equal(d.amountPaid, 3000);
});

test('fixed EMI with interest follows the amortisation schedule', () => {
  const P = 100000, rate = 12, n = 12;
  const E = emiFor(P, rate, n);
  const d = getLoanDetails({ type: 'FIXED', totalAmount: P, emiAmount: E, totalInstallments: n, paidInstallments: 1, interestRate: rate });
  // First month: interest = 1% of 100000 = 1000, so principal repaid = E - 1000.
  close(d.interestPaid, 1000);
  close(d.principalPaid, E - 1000);
  close(d.remainingBalance, P - (E - 1000));
  close(d.totalPayableAmount, E * n);
});

test('fixed EMI fully paid leaves (near) zero principal', () => {
  const P = 50000, rate = 10, n = 6;
  const E = emiFor(P, rate, n);
  const d = getLoanDetails({ type: 'FIXED', totalAmount: P, emiAmount: E, totalInstallments: n, paidInstallments: n, interestRate: rate });
  close(d.remainingBalance, 0, 0.05);
  close(d.principalPaid, P, 0.05);
});

test('flexible loan without interest: remaining = principal - paid', () => {
  const d = getLoanDetails({ type: 'FLEXIBLE', totalAmount: 20000, paidAmount: 5000, interestRate: null, payments: [] });
  assert.equal(d.remainingBalance, 15000);
});

test('flexible loan accrues monthly interest on anniversaries and applies payments to interest first', () => {
  const start = new Date('2026-01-10T00:00:00Z');
  const d = getLoanDetails({
    type: 'FLEXIBLE',
    totalAmount: 120000,
    interestRate: 12,
    startDate: start,
    paidAmount: 3000,
    active: false, // freeze "now" at the last payment so the test is deterministic
    payments: [{ amount: 3000, paidAt: new Date('2026-02-15T00:00:00Z') }],
  });
  // One anniversary (Feb 10) before the payment: interest = 120000 * 1% = 1200.
  close(d.accruedInterest, 1200);
  close(d.interestPaid, 1200);
  close(d.principalPaid, 1800);
  close(d.remainingBalance, 120000 + 1200 - 3000);
});

test('flexible loan treats paidAmount beyond recorded payments as an initial payment on the start date', () => {
  const d = getLoanDetails({
    type: 'FLEXIBLE', totalAmount: 10000, interestRate: 12, startDate: new Date('2026-01-01T00:00:00Z'),
    paidAmount: 2000, active: false, payments: [],
  });
  close(d.principalPaid, 2000);
  close(d.remainingBalance, 8000);
});
