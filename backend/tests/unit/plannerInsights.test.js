const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../../utils/plannerCalculations');
const { buildInsights, inr } = require('../../utils/plannerInsights');

const r = (rupees) => calc.toPaise(rupees);
// A raw month like plannerService.getMonth({ includeRaw: true }) returns.
const month = ({ expected = 0, received = 0, plan = [], spending = [], savings = 0, invested = 0, unplanned = [] } = {}) => {
  const income = calc.summarizeIncome(expected || received ? [{ kind: 'SALARY', expectedPaise: r(expected), receivedPaise: r(received) }] : []);
  const planSummary = calc.summarizePlan(plan.map(a => ({ group: a.group, plannedPaise: r(a.planned) })));
  const expenses = spending.reduce((t, s) => t + r(s.amount), 0n);
  const actuals = { income: r(received), expenses, emi: 0n, investmentNet: r(invested), spending };
  const summary = calc.buildMonthSummary({ income, plan: planSummary, actuals, savingsNet: r(savings) });
  const byCategory = [...spending.reduce((m, s) => m.set(s.category, (m.get(s.category) || 0n) + r(s.amount)), new Map())].map(([category, paise]) => ({ category, paise }));
  return {
    summary,
    spendingCount: spending.length,
    unplanned: unplanned.reduce((t, u) => t + r(u.amount), 0n),
    unplannedByCategory: unplanned.map(u => ({ category: u.category, paise: r(u.amount) })),
    byCategory,
    allocations: plan.map((a, i) => ({ id: `a${i}`, name: a.name, group: a.group, savingsGoalId: a.goal || null, plannedPaise: r(a.planned), spentPaise: r(a.spent || 0) })),
  };
};
const texts = (insights) => insights.map(i => i.text);
const base = { previousLabel: 'October 2026', isCurrentMonth: true, hasStarted: true };

test('an empty month produces no insights at all: nothing is assumed', () => {
  assert.deepEqual(buildInsights({ ...base, current: month(), previous: month() }), []);
  assert.deepEqual(buildInsights({ ...base, current: month(), previous: null, isCurrentMonth: false, hasStarted: false }), []);
});

test('the example insights, each backed by the numbers it quotes', () => {
  const current = month({
    expected: 15000, received: 15000, savings: 2250,
    plan: [
      { group: 'FIXED', name: 'Rent', planned: 3500, spent: 3500 },
      { group: 'FIXED', name: 'Bills', planned: 1750, spent: 1750 },
      { group: 'VARIABLE', name: 'Food', planned: 2000, spent: 2400 },
      { group: 'SAVINGS', name: 'Emergency', planned: 2000, goal: 'g1' },
    ],
    spending: [{ category: 'Food', amount: 2400 }, { category: 'Bills', amount: 5250 }],
  });
  const previous = month({ received: 15000, spending: [{ category: 'Food', amount: 2000 }, { category: 'Bills', amount: 5250 }] });
  const out = texts(buildInsights({ ...base, current, previous, goals: [{ id: 'g1', name: 'Emergency Fund', reached: false, archived: false }] }));
  assert.deepEqual(out, [
    'Food is ₹400 over plan (₹2,400 of ₹2,000).',
    'You spent 20% more on Food than in October 2026 (₹2,400 vs ₹2,000).',
    'Fixed costs (Rent and Bills) took 35% of the income you received.',
    'Your savings rate is 15%: you set aside ₹2,250 of the ₹15,000 you received.',
    '₹5,750 of your expected income isn\'t allocated yet.',
    'You could add up to ₹5,100 more to Emergency Fund this month: that much is both unallocated and still available.',
  ]);
});

test('a suggestion never exceeds what is still available, and is rounded down to ₹100', () => {
  const current = month({ expected: 15000, received: 15000, plan: [{ group: 'SAVINGS', name: 'E', planned: 1000, goal: 'g1' }], spending: [{ category: 'Bills', amount: 14450.5 }] });
  const out = buildInsights({ ...base, current, previous: null, goals: [{ id: 'g1', name: 'Emergency Fund', reached: false, archived: false }] });
  assert.ok(texts(out).includes('You could add up to ₹500 more to Emergency Fund this month: that much is both unallocated and still available.'));
  // A reached or archived goal, or a past month, gets no suggestion.
  for (const variant of [{ goals: [{ id: 'g1', name: 'E', reached: true, archived: false }] }, { goals: [{ id: 'g1', name: 'E', reached: false, archived: true }] }, { isCurrentMonth: false }]) {
    assert.ok(!buildInsights({ ...base, current, previous: null, goals: [{ id: 'g1', name: 'E', reached: false, archived: false }], ...variant }).some(i => i.id.startsWith('suggest:')));
  }
});

test('category changes need real spending in both months and a meaningful difference', () => {
  const now = month({ received: 1000, spending: [{ category: 'Food', amount: 3000 }, { category: 'Travel', amount: 450 }, { category: 'Fun', amount: 1100 }] });
  const before = month({ received: 1000, spending: [{ category: 'Food', amount: 2000 }, { category: 'Travel', amount: 100 }, { category: 'Fun', amount: 1000 }] });
  const ids = buildInsights({ ...base, current: now, previous: before }).map(i => i.id);
  assert.ok(ids.includes('category:Food'));
  assert.ok(!ids.includes('category:Travel')); // under ₹500
  assert.ok(!ids.includes('category:Fun')); // +10%
  assert.ok(!buildInsights({ ...base, current: now, previous: month() }).some(i => i.id.startsWith('category:')));
  const less = buildInsights({ ...base, current: before, previous: now }).find(i => i.id === 'category:Food');
  assert.deepEqual([less.tone, less.text], ['positive', 'You spent 33% less on Food than in October 2026 (₹2,000 vs ₹3,000).']);
});

test('warnings: over-allocation, overdue EMIs, unplanned spending, goals behind or past their date', () => {
  const current = month({ expected: 10000, plan: [{ group: 'FIXED', name: 'Rent', planned: 12000 }], unplanned: [{ category: 'Shopping', amount: 300 }] });
  const out = texts(buildInsights({
    ...base, current, previous: null,
    overdueEmis: [{ title: 'Phone' }, { title: 'Bike' }],
    goals: [
      { id: 'g1', name: 'Goa trip', reached: false, archived: false, overdue: false, requiredMonthlyPaise: r(5000), monthlyContributionPaise: r(3000), targetLabel: 'Mar 2027' },
      { id: 'g2', name: 'Laptop', reached: false, archived: false, overdue: true, remainingPaise: r(12000.5) },
    ],
  }));
  assert.deepEqual(out, [
    'Phone and Bike EMIs are overdue.',
    'You\'ve planned ₹2,000 more than your expected income of ₹10,000.',
    '₹300 was spent outside your plan, mostly on Shopping.',
    'Fixed costs (Rent) are planned at 120% of your expected income.',
    'To reach Goa trip by Mar 2027 you\'d need ₹5,000 a month, ₹2,000 more than you planned.',
    'Laptop\'s target date has passed with ₹12,000.50 still to go.',
  ]);
});

test('amounts in insights are exact Indian rupee figures', () => {
  assert.equal(inr(150000050n), '₹15,00,000.50');
  assert.equal(inr(9099999999999909n), '₹9,09,99,99,99,99,999.09');
});
