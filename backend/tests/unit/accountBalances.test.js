const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateBalances, normalizeAccountType } = require('../../utils/accountBalances');

test('income and expense move the matching account bucket', () => {
  const b = calculateBalances([
    { type: 'income', amount: 1000, accountType: 'Cash', paymentMethod: 'Cash' },
    { type: 'expense', amount: 250, accountType: 'UPI', paymentMethod: 'UPI' },
    { type: 'income', amount: 5000, accountType: 'Bank', paymentMethod: 'Net Banking' },
  ]);
  assert.equal(b.cashBalance, 1000);
  assert.equal(b.upiBalance, -250);
  assert.equal(b.netBankingBalance, 5000);
  assert.equal(b.totalBalance, 5750);
});

test('a transfer moves money between accounts without changing the total', () => {
  const b = calculateBalances([
    { type: 'income', amount: 10000, accountType: 'Bank', paymentMethod: 'Net Banking' },
    { type: 'transfer', amount: 2000, accountType: 'Bank', paymentMethod: 'Bank', fromAccountType: 'Bank', toAccountType: 'Cash' },
  ]);
  assert.equal(b.netBankingBalance, 8000);
  assert.equal(b.cashBalance, 2000);
  assert.equal(b.totalBalance, 10000);
});

test('credit card spending is a negative balance included in the total', () => {
  const b = calculateBalances([{ type: 'expense', amount: 1500, accountType: 'Credit Card', paymentMethod: 'Credit Card' }]);
  assert.equal(b.creditCardBalance, -1500);
  assert.equal(b.totalBalance, -1500);
  assert.equal(b.bankBalance, 0);
});

test('aggregated group rows produce the same balances as individual rows', () => {
  const rows = [
    { type: 'expense', amount: 100, accountType: 'UPI', paymentMethod: 'UPI' },
    { type: 'expense', amount: 200, accountType: 'UPI', paymentMethod: 'UPI' },
  ];
  assert.deepEqual(calculateBalances(rows), calculateBalances([{ type: 'expense', amount: 300, accountType: 'UPI', paymentMethod: 'UPI' }]));
});

test('money paid or received via Other lands in the Other bucket, not UPI', () => {
  const b = calculateBalances([
    { type: 'income', amount: 700, accountType: 'Net Banking', paymentMethod: 'Other' },
    // Entries saved before the fix carried accountType UPI.
    { type: 'income', amount: 300, accountType: 'UPI', paymentMethod: 'Other' },
    { type: 'expense', amount: 100, accountType: 'UPI', paymentMethod: 'Other' },
  ]);
  assert.equal(b.netBankingBalance, 900);
  assert.equal(b.upiBalance, 0);
  assert.equal(b.totalBalance, 900);
});

test('normalizeAccountType maps aliases to canonical accounts', () => {
  assert.equal(normalizeAccountType('net banking'), 'Bank');
  assert.equal(normalizeAccountType('wallet'), 'UPI');
  assert.equal(normalizeAccountType(undefined), 'Cash');
});
