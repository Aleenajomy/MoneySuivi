const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const calc = require('../../utils/plannerCalculations');

test('toPaise converts numbers, strings and Prisma Decimals without float error', () => {
  assert.equal(calc.toPaise(15000), 1500000);
  assert.equal(calc.toPaise('15000.5'), 1500050);
  assert.equal(calc.toPaise(' 0.07 '), 7);
  assert.equal(calc.toPaise(0.1 + 0.2), 30);
  assert.equal(calc.toPaise(1234.56), 123456);
  assert.equal(calc.toPaise(new Prisma.Decimal('999999999999.99')), 99999999999999);
  assert.equal(calc.toPaise(-12.3), -1230);
  assert.equal(calc.toPaise('-0'), 0);
  assert.equal(calc.toPaise(null), 0);
  assert.equal(calc.toPaise(undefined), 0);
});

test('toPaise rejects anything that is not an amount with at most 2 decimals', () => {
  for (const bad of ['12.345', 'abc', '1e5', '--1', NaN, Infinity]) {
    assert.throws(() => calc.toPaise(bad), RangeError, String(bad));
  }
});

test('paise round-trip to API numbers and Decimal strings exactly', () => {
  assert.equal(calc.fromPaise(123456), 1234.56);
  assert.equal(calc.fromPaise(30), 0.3);
  assert.equal(calc.paiseToDecimalString(1500050), '15000.50');
  assert.equal(calc.paiseToDecimalString(7), '0.07');
  assert.equal(calc.paiseToDecimalString(-1230), '-12.30');
  assert.equal(calc.paiseToDecimalString(99999999999999), '999999999999.99');
  for (const text of ['0.01', '0.10', '1.00', '19999.99', '123456789.05']) {
    assert.equal(calc.paiseToDecimalString(calc.toPaise(text)), text);
  }
});

test('sums stay exact over many small amounts and refuse unsafe totals', () => {
  assert.equal(calc.sumPaise(Array(1000).fill(calc.toPaise(0.1))), 10000);
  assert.throws(() => calc.sumPaise([Number.MAX_SAFE_INTEGER, 1]), RangeError);
  assert.throws(() => calc.fromPaise(0.5), RangeError);
});

test('percentOf rounds and returns null when there is no base', () => {
  assert.equal(calc.percentOf(1, 3), 33);
  assert.equal(calc.percentOf(2, 3), 67);
  assert.equal(calc.percentOf(150, 100), 150);
  assert.equal(calc.percentOf(5, 0), null);
});

test('income summary splits salary from additional income and tracks pending', () => {
  const s = calc.summarizeIncome([
    { kind: 'SALARY', expectedPaise: 1500000, receivedPaise: 1500000 },
    { kind: 'ALLOWANCE', expectedPaise: 100000, receivedPaise: 0 },
    { kind: 'INCENTIVE', expectedPaise: 50000, receivedPaise: 60000 },
  ]);
  assert.deepEqual(s, {
    expected: 1650000, received: 1560000, expectedSalary: 1500000, expectedAdditional: 150000,
    pending: 90000, receivedCount: 2, count: 3,
  });
});

test('the example salary distribution allocates exactly ₹15,000 with nothing left over', () => {
  const p = (group, rupees) => ({ group, plannedPaise: calc.toPaise(rupees) });
  const plan = calc.summarizePlan([
    p('FIXED', 3500), p('FIXED', 2500), p('VARIABLE', 1000), p('FIXED', 1000),
    p('SAVINGS', 3000), p('VARIABLE', 4000),
  ]);
  assert.equal(plan.plannedExpenses, 1200000);
  assert.equal(plan.plannedSavings, 300000);
  assert.equal(plan.plannedInvestments, 0);
  assert.equal(plan.totalAllocated, 1500000);

  const income = calc.summarizeIncome([{ kind: 'SALARY', expectedPaise: 1500000, receivedPaise: 0 }]);
  const summary = calc.buildMonthSummary({ income, plan, actuals: calc.classifyActuals([]) });
  assert.equal(summary.unallocated, 0);
  assert.equal(summary.overAllocated, false);
  assert.equal(summary.allocatedPercent, 100);
});

test('zero income: nothing is unallocated by percentage and over-allocation is flagged', () => {
  const income = calc.summarizeIncome([]);
  const plan = calc.summarizePlan([{ group: 'FIXED', plannedPaise: 350000 }]);
  const summary = calc.buildMonthSummary({ income, plan, actuals: calc.classifyActuals([]) });
  assert.equal(summary.unallocated, -350000);
  assert.equal(summary.overAllocated, true);
  assert.equal(summary.allocatedPercent, null);
  assert.equal(summary.actual.available, 0);
});

test('actuals ignore transfers, keep investments apart and add EMI payments as spending', () => {
  const a = calc.classifyActuals([
    { id: 'salary', type: 'income', category: 'Salary', amountPaise: 1500000 },
    { id: 'atm', type: 'transfer', category: 'Transfer', amountPaise: 500000 },
    { id: 'rent', type: 'expense', category: 'Bills', amountPaise: 350000 },
    { id: 'gold', type: 'expense', category: 'Investment', amountPaise: 100000 },
    { id: 'linked', type: 'expense', category: 'Shopping', amountPaise: 20000, isInvestment: true },
    { id: 'redeem', type: 'income', category: 'investment', amountPaise: 30000 },
  ], [{ id: 'p1', amountPaise: 200000 }]);
  assert.equal(a.income, 1500000);
  assert.equal(a.investmentNet, 90000);
  assert.equal(a.expenses, 550000);
  assert.equal(a.emi, 200000);
  assert.deepEqual(a.spending.map(s => s.id), ['rent', 'emi:p1']);

  const summary = calc.buildMonthSummary({
    income: calc.summarizeIncome([]), plan: calc.summarizePlan([]), actuals: a, savingsNet: 300000,
  });
  // 15,000 - 5,500 spent - 3,000 saved - 900 invested
  assert.equal(summary.actual.available, 560000);
});

test('each transaction counts toward exactly one allocation', () => {
  const allocations = [
    { id: 'rent', group: 'FIXED', matchCategories: ['Bills'], sortOrder: 0 },
    { id: 'power', group: 'FIXED', matchCategories: ['bills'], sortOrder: 1 },
    { id: 'mess', group: 'FIXED', matchCategories: ['Food'], sortOrder: 2 },
    { id: 'loan', group: 'FIXED', matchCategories: ['EMI'], sortOrder: 3 },
    { id: 'save', group: 'SAVINGS', matchCategories: ['Shopping'], sortOrder: 4 },
  ];
  const spending = [
    { id: 'e1', category: 'Bills', amountPaise: 350000 },
    { id: 'e2', category: 'Bills', amountPaise: 50000, assignedAllocationId: 'power' },
    { id: 'e3', category: ' food ', amountPaise: 25000 },
    { id: 'emi:p1', category: 'EMI', amountPaise: 200000 },
    { id: 'e4', category: 'Shopping', amountPaise: 10000 },
    { id: 'e5', category: 'Travel', amountPaise: 5000, assignedAllocationId: 'deleted-allocation' },
  ];
  const m = calc.matchSpending(allocations, spending);
  assert.equal(m.byAllocation.get('rent'), 350000);
  assert.equal(m.byAllocation.get('power'), 50000);
  assert.equal(m.byAllocation.get('mess'), 25000);
  assert.equal(m.byAllocation.get('loan'), 200000);
  // Savings/investment lines never absorb spending by category.
  assert.equal(m.byAllocation.get('save'), 0);
  assert.equal(m.unplanned, 15000);
  assert.deepEqual(m.unplannedByCategory, [{ category: 'Shopping', paise: 10000 }, { category: 'Travel', paise: 5000 }]);

  const total = [...m.byAllocation.values()].reduce((s, v) => s + v, 0) + m.unplanned;
  assert.equal(total, spending.reduce((s, v) => s + v.amountPaise, 0));
});

test('large amounts near the DECIMAL(14,2) limit stay exact', () => {
  const max = calc.toPaise(calc.MAX_PLANNER_AMOUNT);
  const plan = calc.summarizePlan([{ group: 'FIXED', plannedPaise: max }, { group: 'SAVINGS', plannedPaise: max }]);
  assert.equal(plan.totalAllocated, 2 * max);
  assert.equal(calc.paiseToDecimalString(plan.totalAllocated), '1999999999999.98');
});

test('name keywords skip generic words so "Other Bills" does not grab every bill', () => {
  assert.deepEqual(calc.nameKeywords('Mess / Food'), ['mess', 'food']);
  assert.deepEqual(calc.nameKeywords('Rent / Accommodation'), ['rent', 'accommodation']);
  assert.deepEqual(calc.nameKeywords('Other Bills'), []);
  assert.deepEqual(calc.nameKeywords('EMI / Loan'), ['emi', 'loan']);
  assert.deepEqual(calc.nameKeywords('Personal Care'), ['care']);
});

test('matching order: manual assignment, then the line named in the title, then category', () => {
  const allocations = [
    { id: 'bills', group: 'FIXED', name: 'Other Bills', matchCategories: ['Bills'], sortOrder: 0 },
    { id: 'rent', group: 'FIXED', name: 'Rent / Accommodation', matchCategories: [], sortOrder: 1 },
    { id: 'mess', group: 'FIXED', name: 'Mess / Food', matchCategories: ['Food'], sortOrder: 2 },
    { id: 'outside', group: 'VARIABLE', name: 'Food outside', matchCategories: [], sortOrder: 3 },
    { id: 'gold', group: 'INVESTMENT', name: 'Rent savings', matchCategories: ['Bills'], sortOrder: 4 },
  ];
  const m = calc.matchSpending(allocations, [
    { id: 'rent-tx', title: 'House rent Nov', category: 'Bills', amountPaise: 350000 },
    { id: 'mess-tx', title: 'Mess', category: 'Food', amountPaise: 250000 },
    { id: 'snack', title: 'Snacks', category: 'Food', amountPaise: 5000 },
    { id: 'outside-tx', title: 'Food outside with friends', category: 'Food', amountPaise: 80000 },
    { id: 'power', title: 'Electricity', category: 'Bills', amountPaise: 60000 },
    { id: 'pinned', title: 'Mess advance', category: 'Food', amountPaise: 10000, assignedAllocationId: 'outside' },
    { id: 'gift', title: 'Gift', category: 'Shopping', amountPaise: 20000 },
  ]);
  const how = Object.fromEntries(m.resolved.map(r => [r.id, [r.allocationId, r.matchedBy]]));
  assert.deepEqual(how, {
    'rent-tx': ['rent', 'NAME'],
    'mess-tx': ['mess', 'NAME'],
    snack: ['mess', 'CATEGORY'],
    'outside-tx': ['outside', 'NAME'],
    power: ['bills', 'CATEGORY'],
    pinned: ['outside', 'ASSIGNED'],
    gift: [null, 'UNPLANNED'],
  });
  assert.equal(m.byAllocation.get('mess'), 255000);
  assert.equal(m.byAllocation.get('outside'), 90000);
  assert.equal(m.byAllocation.get('gold'), 0);
  assert.equal(m.unplanned, 20000);
});

test('a ₹2,500 Mess expense reduces the Mess line and nothing else', () => {
  const allocations = [
    { id: 'rent', group: 'FIXED', name: 'Rent', matchCategories: [], sortOrder: 0 },
    { id: 'mess', group: 'FIXED', name: 'Mess / Food', matchCategories: ['Food'], sortOrder: 1 },
  ];
  const m = calc.matchSpending(allocations, [{ id: 'e1', title: 'Mess', category: 'Food', amountPaise: 250000 }]);
  assert.equal(m.byAllocation.get('mess'), 250000);
  assert.equal(m.byAllocation.get('rent'), 0);
  assert.equal(m.unplanned, 0);
});
