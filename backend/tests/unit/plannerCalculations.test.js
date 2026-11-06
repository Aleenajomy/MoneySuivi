const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const calc = require('../../utils/plannerCalculations');

test('toPaise converts numbers, strings and Prisma Decimals without float error', () => {
  assert.equal(calc.toPaise(15000), 1500000n);
  assert.equal(calc.toPaise('15000.5'), 1500050n);
  assert.equal(calc.toPaise(' 0.07 '), 7n);
  assert.equal(calc.toPaise(0.1 + 0.2), 30n);
  assert.equal(calc.toPaise(1234.56), 123456n);
  assert.equal(calc.toPaise(new Prisma.Decimal('999999999999.99')), 99999999999999n);
  assert.equal(calc.toPaise(-12.3), -1230n);
  assert.equal(calc.toPaise('-0'), 0n);
  assert.equal(calc.toPaise(null), 0n);
  assert.equal(calc.toPaise(undefined), 0n);
});

test('toPaise rejects anything that is not an amount with at most 2 decimals', () => {
  for (const bad of ['12.345', 'abc', '1e5', '--1', NaN, Infinity]) {
    assert.throws(() => calc.toPaise(bad), RangeError, String(bad));
  }
});

test('paise round-trip to API amounts and Decimal strings exactly', () => {
  assert.equal(calc.toApiAmount(123456n), 1234.56);
  assert.equal(calc.toApiAmount(30n), 0.3);
  assert.equal(calc.toApiAmount(-1230n), -12.3);
  assert.equal(calc.paiseToDecimalString(1500050n), '15000.50');
  assert.equal(calc.paiseToDecimalString(7n), '0.07');
  assert.equal(calc.paiseToDecimalString(-1230n), '-12.30');
  assert.equal(calc.paiseToDecimalString(99999999999999n), '999999999999.99');
  assert.equal(calc.paiseToNumber(1500050n), 15000.5);
  for (const text of ['0.01', '0.10', '1.00', '19999.99', '123456789.05']) {
    assert.equal(calc.paiseToDecimalString(calc.toPaise(text)), text);
  }
});

test('sums stay exact over many small amounts', () => {
  assert.equal(calc.sumPaise(Array(1000).fill(calc.toPaise(0.1))), 10000n);
  assert.equal(calc.sumPaise([0.1, '0.2', 0.3]), 60n);
});

test('totals beyond the old safe-integer limit stay exact instead of failing (finding 4)', () => {
  // 91 maximum-size amounts used to overflow Number.MAX_SAFE_INTEGER paise and make the month 500.
  const max = calc.toPaise(calc.MAX_PLANNER_AMOUNT);
  const total = calc.sumPaise(Array(91).fill(max));
  assert.equal(total, 9099999999999909n);
  assert.ok(total > BigInt(Number.MAX_SAFE_INTEGER));
  assert.equal(calc.paiseToDecimalString(total), '90999999999999.09');
  // Too big to be an exact JSON number, so it is sent as the exact decimal string.
  assert.equal(calc.toApiAmount(total), '90999999999999.09');
  const plan = calc.summarizePlan(Array(1000).fill({ group: 'FIXED', plannedPaise: max }));
  assert.equal(plan.totalAllocated, max * 1000n);
  assert.equal(calc.toApiAmount(plan.totalAllocated), '999999999999990.00');
});

test('API amounts are numbers exactly up to ₹10 lakh crore and exact strings above', () => {
  assert.equal(calc.toApiAmount(999999999999999n), 9999999999999.99);
  assert.equal(String(calc.toApiAmount(999999999999999n)), '9999999999999.99');
  assert.equal(calc.toApiAmount(1000000000000000n), '10000000000000.00');
  assert.equal(calc.toApiAmount(-1000000000000001n), '-10000000000000.01');
  assert.equal(calc.toApiAmount(0n), 0);
});

test('percentOf rounds half up and returns null when there is no base', () => {
  assert.equal(calc.percentOf(1, 3), 33);
  assert.equal(calc.percentOf(1n, 200n), 1);
  assert.equal(calc.percentOf(999999999999999n * 91n, 999999999999999n), 9100);
  assert.equal(calc.percentOf(2, 3), 67);
  assert.equal(calc.percentOf(150, 100), 150);
  assert.equal(calc.percentOf(5, 0), null);
});

test('income summary splits salary from additional income and tracks pending', () => {
  const s = calc.summarizeIncome([
    { kind: 'SALARY', expectedPaise: 1500000n, receivedPaise: 1500000n },
    { kind: 'ALLOWANCE', expectedPaise: 100000n, receivedPaise: 0n },
    { kind: 'INCENTIVE', expectedPaise: 50000n, receivedPaise: 60000n },
  ]);
  assert.deepEqual(s, {
    expected: 1650000n, received: 1560000n, expectedSalary: 1500000n, expectedAdditional: 150000n,
    pending: 90000n, receivedCount: 2, count: 3,
  });
});

test('the example salary distribution allocates exactly ₹15,000 with nothing left over', () => {
  const p = (group, rupees) => ({ group, plannedPaise: calc.toPaise(rupees) });
  const plan = calc.summarizePlan([
    p('FIXED', 3500), p('FIXED', 2500), p('VARIABLE', 1000), p('FIXED', 1000),
    p('SAVINGS', 3000), p('VARIABLE', 4000),
  ]);
  assert.equal(plan.plannedExpenses, 1200000n);
  assert.equal(plan.plannedSavings, 300000n);
  assert.equal(plan.plannedInvestments, 0n);
  assert.equal(plan.totalAllocated, 1500000n);

  const income = calc.summarizeIncome([{ kind: 'SALARY', expectedPaise: 1500000n, receivedPaise: 0n }]);
  const summary = calc.buildMonthSummary({ income, plan, actuals: calc.classifyActuals([]) });
  assert.equal(summary.unallocated, 0n);
  assert.equal(summary.overAllocated, false);
  assert.equal(summary.allocatedPercent, 100);
});

test('zero income: nothing is unallocated by percentage and over-allocation is flagged', () => {
  const income = calc.summarizeIncome([]);
  const plan = calc.summarizePlan([{ group: 'FIXED', plannedPaise: 350000n }]);
  const summary = calc.buildMonthSummary({ income, plan, actuals: calc.classifyActuals([]) });
  assert.equal(summary.unallocated, -350000n);
  assert.equal(summary.overAllocated, true);
  assert.equal(summary.allocatedPercent, null);
  assert.equal(summary.actual.available, 0n);
});

test('actuals ignore transfers, keep investments apart and add EMI payments as spending', () => {
  const a = calc.classifyActuals([
    { id: 'salary', type: 'income', category: 'Salary', amountPaise: 1500000n },
    { id: 'atm', type: 'transfer', category: 'Transfer', amountPaise: 500000n },
    { id: 'rent', type: 'expense', category: 'Bills', amountPaise: 350000n },
    { id: 'gold', type: 'expense', category: 'Investment', amountPaise: 100000n },
    { id: 'linked', type: 'expense', category: 'Shopping', amountPaise: 20000n, isInvestment: true },
    { id: 'redeem', type: 'income', category: 'investment', amountPaise: 30000n },
  ], [{ id: 'p1', amountPaise: 200000n }]);
  assert.equal(a.income, 1500000n);
  assert.equal(a.investmentNet, 90000n);
  assert.equal(a.expenses, 550000n);
  assert.equal(a.emi, 200000n);
  assert.deepEqual(a.spending.map(s => s.id), ['rent', 'emi:p1']);

  const summary = calc.buildMonthSummary({
    income: calc.summarizeIncome([]), plan: calc.summarizePlan([]), actuals: a, savingsNet: 300000n,
  });
  // 15,000 - 5,500 spent - 3,000 saved - 900 invested
  assert.equal(summary.actual.available, 560000n);
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
    { id: 'e1', category: 'Bills', amountPaise: 350000n },
    { id: 'e2', category: 'Bills', amountPaise: 50000n, assignedAllocationId: 'power' },
    { id: 'e3', category: ' food ', amountPaise: 25000n },
    { id: 'emi:p1', category: 'EMI', amountPaise: 200000n },
    { id: 'e4', category: 'Shopping', amountPaise: 10000n },
    { id: 'e5', category: 'Travel', amountPaise: 5000n, assignedAllocationId: 'deleted-allocation' },
  ];
  const m = calc.matchSpending(allocations, spending);
  assert.equal(m.byAllocation.get('rent'), 350000n);
  assert.equal(m.byAllocation.get('power'), 50000n);
  assert.equal(m.byAllocation.get('mess'), 25000n);
  assert.equal(m.byAllocation.get('loan'), 200000n);
  // Savings/investment lines never absorb spending by category.
  assert.equal(m.byAllocation.get('save'), 0n);
  assert.equal(m.unplanned, 15000n);
  assert.deepEqual(m.unplannedByCategory, [{ category: 'Shopping', paise: 10000n }, { category: 'Travel', paise: 5000n }]);

  const total = [...m.byAllocation.values()].reduce((s, v) => s + v, 0n) + m.unplanned;
  assert.equal(total, spending.reduce((s, v) => s + v.amountPaise, 0n));
});

test('large amounts near the DECIMAL(14,2) limit stay exact', () => {
  const max = calc.toPaise(calc.MAX_PLANNER_AMOUNT);
  const plan = calc.summarizePlan([{ group: 'FIXED', plannedPaise: max }, { group: 'SAVINGS', plannedPaise: max }]);
  assert.equal(plan.totalAllocated, 2n * max);
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
    { id: 'rent-tx', title: 'House rent Nov', category: 'Bills', amountPaise: 350000n },
    { id: 'mess-tx', title: 'Mess', category: 'Food', amountPaise: 250000n },
    { id: 'snack', title: 'Snacks', category: 'Food', amountPaise: 5000n },
    { id: 'outside-tx', title: 'Food outside with friends', category: 'Food', amountPaise: 80000n },
    { id: 'power', title: 'Electricity', category: 'Bills', amountPaise: 60000n },
    { id: 'pinned', title: 'Mess advance', category: 'Food', amountPaise: 10000n, assignedAllocationId: 'outside' },
    { id: 'gift', title: 'Gift', category: 'Shopping', amountPaise: 20000n },
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
  assert.equal(m.byAllocation.get('mess'), 255000n);
  assert.equal(m.byAllocation.get('outside'), 90000n);
  assert.equal(m.byAllocation.get('gold'), 0n);
  assert.equal(m.unplanned, 20000n);
});

test('a ₹2,500 Mess expense reduces the Mess line and nothing else', () => {
  const allocations = [
    { id: 'rent', group: 'FIXED', name: 'Rent', matchCategories: [], sortOrder: 0 },
    { id: 'mess', group: 'FIXED', name: 'Mess / Food', matchCategories: ['Food'], sortOrder: 1 },
  ];
  const m = calc.matchSpending(allocations, [{ id: 'e1', title: 'Mess', category: 'Food', amountPaise: 250000n }]);
  assert.equal(m.byAllocation.get('mess'), 250000n);
  assert.equal(m.byAllocation.get('rent'), 0n);
  assert.equal(m.unplanned, 0n);
});

test('a pin to a line that became Savings/Investment is ignored, so the spending stays visible (finding 1)', () => {
  const allocations = [
    { id: 'rent', group: 'SAVINGS', name: 'Rent', matchCategories: [], sortOrder: 0 },
    { id: 'bills', group: 'FIXED', name: 'Other Bills', matchCategories: ['Bills'], sortOrder: 1 },
  ];
  const m = calc.matchSpending(allocations, [
    { id: 'pinned-to-savings', title: 'Flat', category: 'Bills', amountPaise: 350000n, assignedAllocationId: 'rent' },
    { id: 'pinned-orphan', title: 'Gift', category: 'Shopping', amountPaise: 5000n, assignedAllocationId: 'rent' },
  ]);
  const how = Object.fromEntries(m.resolved.map(r => [r.id, [r.allocationId, r.matchedBy]]));
  assert.deepEqual(how, { 'pinned-to-savings': ['bills', 'CATEGORY'], 'pinned-orphan': [null, 'UNPLANNED'] });
  assert.equal(m.byAllocation.get('rent'), 0n);
  assert.equal(m.byAllocation.get('bills') + m.unplanned, 355000n);
});

test('output helpers only take BigInt paise, so a Number can never be silently read as rupees', () => {
  assert.throws(() => calc.paiseToDecimalString(150), TypeError);
  assert.throws(() => calc.toApiAmount(150), TypeError);
  assert.throws(() => calc.paiseToNumber('150'), TypeError);
  assert.equal(calc.paiseToDecimalString(150n), '1.50');
});

test('goal status: progress, remaining and the monthly amount still needed, counting this month', () => {
  const d = (s) => new Date(`${s}T00:00:00.000Z`);
  const today = d('2026-11-06');
  const g = calc.goalStatus({ targetPaise: 5000000n, savedPaise: 1000000n, targetDate: d('2027-02-28'), today });
  assert.equal(g.remaining, 4000000n);
  assert.equal(g.progress, 20);
  assert.equal(g.monthsLeft, 4); // Nov, Dec, Jan, Feb
  assert.equal(g.requiredMonthly, 1000000n);
  assert.equal(g.reached, false);
  assert.equal(g.overdue, false);

  // Uneven split rounds up to the paisa so the target is still met.
  assert.equal(calc.goalStatus({ targetPaise: 100n, savedPaise: 0n, targetDate: d('2027-01-15'), today }).requiredMonthly, 34n);
  // Target date this month: everything left is needed now.
  assert.equal(calc.goalStatus({ targetPaise: 100n, savedPaise: 40n, targetDate: d('2026-11-30'), today }).requiredMonthly, 60n);
  // Past target date: overdue, no monthly figure.
  const late = calc.goalStatus({ targetPaise: 100n, savedPaise: 40n, targetDate: d('2026-10-31'), today });
  assert.deepEqual([late.overdue, late.monthsLeft, late.requiredMonthly], [true, 0, null]);
  // Reached (even over-saved): nothing remaining, nothing required, progress above 100 is kept.
  const done = calc.goalStatus({ targetPaise: 100n, savedPaise: 150n, targetDate: d('2026-10-31'), today });
  assert.deepEqual([done.reached, done.remaining, done.requiredMonthly, done.overdue, done.progress], [true, 0n, null, false, 150]);
  // No target date.
  assert.deepEqual([calc.goalStatus({ targetPaise: 100n, savedPaise: 0n, today }).monthsLeft, calc.goalStatus({ targetPaise: 100n, savedPaise: 0n, today }).requiredMonthly], [null, null]);
});
