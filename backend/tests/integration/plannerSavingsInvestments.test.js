const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, prisma, resetDb, createUser, auth } = require('../helpers/setup');
const { currentPeriod } = require('../../services/plannerService');

beforeEach(resetDb);
after(() => prisma.$disconnect());

const now = currentPeriod();
const shift = ({ year, month }, by) => {
  const i = year * 12 + (month - 1) + by;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
};
const iso = ({ year, month }, day = 5) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const q = ({ year, month }) => `year=${year}&month=${month}`;

const planner = (user) => ({
  get: (url) => request(app).get(`/api/planner${url}`).set(auth(user)),
  post: (url, body = {}) => request(app).post(`/api/planner${url}`).set(auth(user)).send(body),
  put: (url, body = {}) => request(app).put(`/api/planner${url}`).set(auth(user)).send(body),
  patch: (url, body = {}) => request(app).patch(`/api/planner${url}`).set(auth(user)).send(body),
  del: (url) => request(app).delete(`/api/planner${url}`).set(auth(user)),
});
const balances = async (user) => (await request(app).get('/api/expenses/balances').set(auth(user))).body.balances;
const expenseCount = (user) => prisma.expense.count({ where: { userId: user.id } });

// ---------------------------------------------------------------- savings goals

test('a goal tracks saved, remaining, progress and the monthly amount needed; no transaction is created', async () => {
  const user = await createUser();
  const p = planner(user);
  const target = shift(now, 3);
  const created = await p.post('/goals', { name: '  Emergency Fund ', targetAmount: 50000, initialAmount: '10000.50', monthlyContribution: 5000, targetDate: iso(target, 28) });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  let goal = created.body.goal;
  assert.equal(goal.name, 'Emergency Fund');
  assert.equal(goal.savedAmount, 10000.5);
  assert.equal(goal.remainingAmount, 39999.5);
  assert.equal(goal.progress, 20);
  assert.equal(goal.monthsLeft, 4);
  assert.equal(goal.requiredMonthly, 9999.88);

  goal = (await p.post(`/goals/${goal.id}/contributions`, { type: 'CONTRIBUTION', amount: 3000, date: iso(now, 2) })).body.goal;
  goal = (await p.post(`/goals/${goal.id}/contributions`, { type: 'WITHDRAWAL', amount: '500.25', date: iso(now, 3) })).body.goal;
  assert.equal(goal.savedAmount, 12500.25);
  assert.equal(goal.thisMonthAmount, 2499.75);

  // Earmarking only: no transaction, balances untouched; the month summary counts it as saved.
  assert.equal(await expenseCount(user), 0);
  assert.equal((await balances(user)).totalBalance, 0);
  const month = (await p.get(`/overview?${q(now)}`)).body;
  assert.equal(month.summary.actual.savingsNet, 2499.75);
  assert.equal(month.summary.actual.expenses, 0);

  const history = (await p.get(`/goals/${goal.id}/contributions`)).body.contributions;
  assert.deepEqual(history.map(c => [c.type, c.amount]), [['WITHDRAWAL', 500.25], ['CONTRIBUTION', 3000]]);
});

test('a withdrawal can never take a goal below zero, even when several race', async () => {
  const user = await createUser();
  const p = planner(user);
  const goal = (await p.post('/goals', { name: 'Trip', targetAmount: 10000, initialAmount: 1000 })).body.goal;
  await p.post(`/goals/${goal.id}/contributions`, { type: 'CONTRIBUTION', amount: 4000, date: iso(now) });

  const over = await p.post(`/goals/${goal.id}/contributions`, { type: 'WITHDRAWAL', amount: '5000.01', date: iso(now) });
  assert.equal(over.status, 409);
  assert.equal(over.body.code, 'INSUFFICIENT_SAVED');

  const results = await Promise.all(Array.from({ length: 5 }, () => p.post(`/goals/${goal.id}/contributions`, { type: 'WITHDRAWAL', amount: 3000, date: iso(now) })));
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409, 409, 409, 409]);
  assert.equal((await p.get('/goals')).body.goals[0].savedAmount, 2000);
});

test('removing a deposit or lowering the starting amount cannot strand earlier withdrawals', async () => {
  const user = await createUser();
  const p = planner(user);
  const goal = (await p.post('/goals', { name: 'Laptop', targetAmount: 80000, initialAmount: 1000 })).body.goal;
  await p.post(`/goals/${goal.id}/contributions`, { type: 'CONTRIBUTION', amount: 5000, date: iso(now) });
  await p.post(`/goals/${goal.id}/contributions`, { type: 'WITHDRAWAL', amount: 5500, date: iso(now) });
  const [, deposit] = (await p.get(`/goals/${goal.id}/contributions`)).body.contributions;

  assert.equal((await p.del(`/goals/contributions/${deposit.id}`)).status, 409);
  assert.equal((await p.put(`/goals/${goal.id}`, { initialAmount: 400 })).status, 409);
  const ok = await p.put(`/goals/${goal.id}`, { initialAmount: 500, targetAmount: 60000, targetDate: null });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.goal.savedAmount, 0);
  assert.equal(ok.body.goal.targetDate, null);
});

test('archive, unarchive and delete; deleting unlinks the budget line but keeps it', async () => {
  const user = await createUser();
  const p = planner(user);
  const goal = (await p.post('/goals', { name: 'Gift', targetAmount: 2000 })).body.goal;
  await p.post(`/goals/${goal.id}/contributions`, { type: 'CONTRIBUTION', amount: 500, date: iso(now) });
  const planId = (await p.post('/budgets', now)).body.plan.id;
  const lineId = (await p.post(`/budgets/${planId}/allocations`, { group: 'SAVINGS', name: 'Gift', plannedAmount: 500, savingsGoalId: goal.id })).body.allocationId;

  assert.equal((await p.patch(`/goals/${goal.id}/archive`, { archived: true })).body.goal.archived, true);
  assert.equal((await p.patch(`/goals/${goal.id}/archive`, { archived: false })).body.goal.archived, false);
  assert.equal((await p.del(`/goals/${goal.id}`)).status, 200);
  assert.equal(await prisma.savingsContribution.count(), 0);
  const line = (await p.get(`/budgets?${q(now)}`)).body.plan.allocations.find(a => a.id === lineId);
  assert.equal(line.savingsGoalId, null);
  assert.equal(line.actualAmount, null);
});

// ---------------------------------------------------------------- investments

test('a buy creates exactly one Investment expense, kept out of spending; a redemption one income', async () => {
  const user = await createUser();
  const p = planner(user);
  const res = await p.post('/investments', { name: 'Nifty Index Fund', category: 'INDEX_FUND', monthlyPlannedAmount: 2000 });
  assert.equal(res.status, 201);
  const planId = res.body.investmentId;

  let inv = (await p.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 1500, date: iso(now, 3), paymentMethod: 'UPI' })).body;
  inv = (await p.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: '1000.50', date: iso(shift(now, -1), 3), paymentMethod: 'UPI' })).body;
  inv = (await p.post(`/investments/${planId}/transactions`, { type: 'REDEEM', amount: 300, date: iso(now, 4), paymentMethod: 'Net Banking' })).body;

  const expenses = await prisma.expense.findMany({ where: { userId: user.id }, orderBy: { expenseDate: 'asc' } });
  assert.equal(expenses.length, 3);
  assert.deepEqual(expenses.map(e => [e.type, e.category, e.amount, e.title]), [
    ['expense', 'Investment', 1000.5, 'Nifty Index Fund'], ['expense', 'Investment', 1500, 'Nifty Index Fund'], ['income', 'Investment', 300, 'Nifty Index Fund'],
  ]);
  assert.equal(await prisma.investmentTransaction.count(), 3);
  const b = await balances(user);
  assert.equal(b.upiBalance, -2500.5);
  assert.equal(b.netBankingBalance, 300);

  const plan = inv.plans[0];
  assert.equal(plan.investedTotal, 2200.5);
  assert.equal(plan.thisMonthAmount, 1200);
  assert.equal(plan.thisMonthProgress, 60);
  assert.equal(inv.summary.plannedThisMonth, 2000);
  assert.equal(inv.summary.investedThisMonth, 1200);

  const month = (await p.get(`/overview?${q(now)}`)).body.summary.actual;
  assert.equal(month.expenses, 0);
  assert.equal(month.income, 0);
  assert.equal(month.investmentNet, 1200);
  assert.equal(month.available, -1200);
});

test('History edits and deletes of investment transactions are reflected; unlinked ones reconcile', async () => {
  const user = await createUser();
  const p = planner(user);
  const planId = (await p.post('/investments', { name: 'Gold', category: 'GOLD', monthlyPlannedAmount: 1000 })).body.investmentId;
  await p.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 1000, date: iso(now, 3) });
  const [tx] = (await p.get(`/investments/${planId}/transactions`)).body.transactions;

  await request(app).put(`/api/expenses/${tx.expenseId}`).set(auth(user)).send({ amount: 1250 });
  let inv = (await p.get('/investments')).body;
  assert.equal(inv.plans[0].investedTotal, 1250);

  // An Investment-category expense entered in History without a plan.
  await request(app).post('/api/expenses').set(auth(user)).send({ title: 'Gold coin', amount: 700, type: 'expense', category: 'Investment', accountType: 'Cash', paymentMethod: 'Cash', expenseDate: iso(now, 6) });
  inv = (await p.get('/investments')).body;
  assert.equal(inv.summary.unlinkedThisMonth, 700);
  assert.equal(inv.summary.totalThisMonth, 1950);
  assert.equal((await p.get(`/overview?${q(now)}`)).body.summary.actual.investmentNet, 1950);

  await request(app).delete(`/api/expenses/${tx.expenseId}`).set(auth(user));
  assert.equal(await prisma.investmentTransaction.count(), 0);
  assert.equal((await p.get('/investments')).body.plans[0].investedTotal, 0);
});

test('deleting an investment with transactions needs explicit confirmation; deleting one transaction removes its expense', async () => {
  const user = await createUser();
  const p = planner(user);
  const planId = (await p.post('/investments', { name: 'Stocks', category: 'STOCK' })).body.investmentId;
  await p.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 500, date: iso(now) });
  await p.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 700, date: iso(now) });
  const [first] = (await p.get(`/investments/${planId}/transactions`)).body.transactions;

  assert.equal((await p.del(`/investments/transactions/${first.id}`)).status, 200);
  assert.equal(await expenseCount(user), 1);

  const refused = await p.del(`/investments/${planId}`);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'HAS_TRANSACTIONS');
  assert.equal((await p.patch(`/investments/${planId}/active`, { active: false })).body.plans[0].active, false);
  assert.equal((await p.del(`/investments/${planId}?deleteTransactions=true`)).status, 200);
  assert.equal(await expenseCount(user), 0);
  assert.equal(await prisma.investmentPlan.count(), 0);
});

// ---------------------------------------------------------------- budget line links

test('savings and investment lines linked to a goal/investment show this month\'s actuals', async () => {
  const user = await createUser();
  const p = planner(user);
  const goal = (await p.post('/goals', { name: 'Emergency', targetAmount: 50000 })).body.goal;
  const goldId = (await p.post('/investments', { name: 'Gold', category: 'GOLD' })).body.investmentId;
  const planId = (await p.post('/budgets', now)).body.plan.id;
  const saveLine = (await p.post(`/budgets/${planId}/allocations`, { group: 'SAVINGS', name: 'Emergency Fund', plannedAmount: 2000, savingsGoalId: goal.id })).body.allocationId;
  const goldLine = (await p.post(`/budgets/${planId}/allocations`, { group: 'INVESTMENT', name: 'Gold', plannedAmount: 1000, investmentPlanId: goldId })).body.allocationId;
  const loose = (await p.post(`/budgets/${planId}/allocations`, { group: 'SAVINGS', name: 'Loose', plannedAmount: 100 })).body.allocationId;

  await p.post(`/goals/${goal.id}/contributions`, { type: 'CONTRIBUTION', amount: 2500, date: iso(now) });
  await p.post(`/goals/${goal.id}/contributions`, { type: 'CONTRIBUTION', amount: 999, date: iso(shift(now, -1)) });
  await p.post(`/investments/${goldId}/transactions`, { type: 'BUY', amount: 800, date: iso(now) });

  const lines = Object.fromEntries((await p.get(`/budgets?${q(now)}`)).body.plan.allocations.map(a => [a.id, a]));
  assert.deepEqual([lines[saveLine].actualAmount, lines[saveLine].remainingAmount, lines[saveLine].utilization], [2500, -500, 125]);
  assert.deepEqual([lines[goldLine].actualAmount, lines[goldLine].remainingAmount, lines[goldLine].utilization], [800, 200, 80]);
  assert.equal(lines[loose].actualAmount, null);

  // Copying into a new month keeps the links.
  const later = (await p.post('/budgets', shift(now, 1))).body.plan.allocations;
  assert.equal(later.find(a => a.name === 'Emergency Fund').savingsGoalId, goal.id);
  assert.equal(later.find(a => a.name === 'Gold').investmentPlanId, goldId);
});

test('link rules: right group, own goal, one line per goal per month; changing group drops the link', async () => {
  const user = await createUser();
  const other = await createUser();
  const p = planner(user);
  const goal = (await p.post('/goals', { name: 'Emergency', targetAmount: 50000 })).body.goal;
  const theirGoal = (await planner(other).post('/goals', { name: 'Theirs', targetAmount: 1 })).body.goal;
  const goldId = (await p.post('/investments', { name: 'Gold', category: 'GOLD' })).body.investmentId;
  const planId = (await p.post('/budgets', now)).body.plan.id;
  const line = (await p.post(`/budgets/${planId}/allocations`, { group: 'SAVINGS', name: 'A', plannedAmount: 1, savingsGoalId: goal.id })).body.allocationId;

  const cases = [
    [p.post(`/budgets/${planId}/allocations`, { group: 'FIXED', name: 'B', plannedAmount: 1, savingsGoalId: goal.id }), 400],
    [p.post(`/budgets/${planId}/allocations`, { group: 'SAVINGS', name: 'C', plannedAmount: 1, investmentPlanId: goldId }), 400],
    [p.post(`/budgets/${planId}/allocations`, { group: 'SAVINGS', name: 'D', plannedAmount: 1, savingsGoalId: theirGoal.id }), 404],
    [p.post(`/budgets/${planId}/allocations`, { group: 'SAVINGS', name: 'E', plannedAmount: 1, savingsGoalId: goal.id }), 409],
    [p.post(`/budgets/${planId}/allocations`, { group: 'SAVINGS', name: 'F', plannedAmount: 1, savingsGoalId: 'nope' }), 400],
  ];
  for (const [req, status] of cases) {
    const res = await req;
    assert.equal(res.status, status, JSON.stringify(res.body));
  }

  const moved = (await p.put(`/budgets/allocations/${line}`, { group: 'FIXED' })).body.plan.allocations.find(a => a.id === line);
  assert.equal(moved.savingsGoalId, null);
  const relinked = (await p.put(`/budgets/allocations/${line}`, { group: 'SAVINGS', savingsGoalId: goal.id })).body.plan.allocations.find(a => a.id === line);
  assert.equal(relinked.savingsGoalId, goal.id);
  const unlinked = (await p.put(`/budgets/${planId}`, { allocations: [{ id: line, savingsGoalId: null }] })).body.plan.allocations.find(a => a.id === line);
  assert.equal(unlinked.savingsGoalId, null);
});

// ---------------------------------------------------------------- isolation and validation

test('a user cannot see or change another user\'s goals or investments', async () => {
  const victim = await createUser();
  const attacker = await createUser();
  const v = planner(victim);
  const goal = (await v.post('/goals', { name: 'Mine', targetAmount: 1000, initialAmount: 500 })).body.goal;
  await v.post(`/goals/${goal.id}/contributions`, { type: 'CONTRIBUTION', amount: 100, date: iso(now) });
  const [contribution] = (await v.get(`/goals/${goal.id}/contributions`)).body.contributions;
  const planId = (await v.post('/investments', { name: 'Gold', category: 'GOLD' })).body.investmentId;
  await v.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 100, date: iso(now) });
  const [tx] = (await v.get(`/investments/${planId}/transactions`)).body.transactions;
  const a = planner(attacker);

  const attempts = [
    a.put(`/goals/${goal.id}`, { name: 'x' }),
    a.patch(`/goals/${goal.id}/archive`, { archived: true }),
    a.del(`/goals/${goal.id}`),
    a.get(`/goals/${goal.id}/contributions`),
    a.post(`/goals/${goal.id}/contributions`, { type: 'WITHDRAWAL', amount: 1, date: iso(now) }),
    a.del(`/goals/contributions/${contribution.id}`),
    a.put(`/investments/${planId}`, { name: 'x' }),
    a.patch(`/investments/${planId}/active`, { active: false }),
    a.del(`/investments/${planId}?deleteTransactions=true`),
    a.get(`/investments/${planId}/transactions`),
    a.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 1, date: iso(now) }),
    a.del(`/investments/transactions/${tx.id}`),
  ];
  for (const res of await Promise.all(attempts)) assert.equal(res.status, 404, `${res.req.method} ${res.req.path}`);
  assert.deepEqual((await a.get('/goals')).body.goals, []);
  assert.deepEqual((await a.get('/investments')).body.plans, []);
  assert.equal(await prisma.savingsContribution.count(), 1);
  assert.equal(await prisma.expense.count({ where: { userId: victim.id } }), 1);
  assert.equal(await prisma.expense.count({ where: { userId: attacker.id } }), 0);
});

test('invalid goal, contribution, investment and transaction input is rejected', async () => {
  const user = await createUser();
  const p = planner(user);
  const goal = (await p.post('/goals', { name: 'G', targetAmount: 100 })).body.goal;
  const planId = (await p.post('/investments', { name: 'I', category: 'OTHER' })).body.investmentId;
  const bad = [
    p.post('/goals', { name: ' ', targetAmount: 100 }),
    p.post('/goals', { name: 'G', targetAmount: 0 }),
    p.post('/goals', { name: 'G', targetAmount: -1 }),
    p.post('/goals', { name: 'G', targetAmount: '1.001' }),
    p.post('/goals', { name: 'G', targetAmount: 100, targetDate: '2026-02-30' }),
    p.post('/goals', { name: 'G', targetAmount: 100, monthlyContribution: -5 }),
    p.put(`/goals/${goal.id}`, { targetAmount: null }),
    p.post(`/goals/${goal.id}/contributions`, { type: 'GIFT', amount: 1, date: iso(now) }),
    p.post(`/goals/${goal.id}/contributions`, { type: 'CONTRIBUTION', amount: 0, date: iso(now) }),
    p.post(`/goals/${goal.id}/contributions`, { type: 'CONTRIBUTION', amount: 1, date: 'today' }),
    p.post('/investments', { name: 'X', category: 'CRYPTO' }),
    p.post('/investments', { name: '', category: 'GOLD' }),
    p.post('/investments', { name: 'X', category: 'GOLD', monthlyPlannedAmount: -1 }),
    p.post(`/investments/${planId}/transactions`, { type: 'SELL', amount: 1, date: iso(now) }),
    p.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 0, date: iso(now) }),
    p.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 1, date: '2026-13-01' }),
    p.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 1, date: iso(now), paymentMethod: 'Bitcoin' }),
    p.get('/goals?year=2026'),
  ];
  for (const res of await Promise.all(bad)) assert.equal(res.status, 400, `${res.req.method} ${res.req.path} ${JSON.stringify(res.body)}`);
  assert.equal(await expenseCount(user), 0);
});

// ---------------------------------------------------------------- follow-ups from the Phase 5 review

test('a buy changed in History into a transfer or another category stops counting as investment everywhere', async () => {
  const user = await createUser();
  const p = planner(user);
  const planId = (await p.post('/investments', { name: 'Gold', category: 'GOLD', monthlyPlannedAmount: 1000 })).body.investmentId;
  const budgetId = (await p.post('/budgets', now)).body.plan.id;
  await p.post(`/budgets/${budgetId}/allocations`, { group: 'INVESTMENT', name: 'Gold', plannedAmount: 1000, investmentPlanId: planId });
  await p.post(`/budgets/${budgetId}/allocations`, { group: 'VARIABLE', name: 'Food', plannedAmount: 3000, matchCategories: ['Food'] });
  await p.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 1000, date: iso(now) });
  await p.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 400, date: iso(now) });
  const [first, second] = (await p.get(`/investments/${planId}/transactions`)).body.transactions;

  await request(app).put(`/api/expenses/${first.expenseId}`).set(auth(user)).send({ type: 'transfer', fromAccountType: 'Bank', toAccountType: 'Cash' });
  await request(app).put(`/api/expenses/${second.expenseId}`).set(auth(user)).send({ category: 'Food' });

  const inv = (await p.get('/investments')).body;
  assert.equal(inv.plans[0].investedTotal, 0);
  assert.equal(inv.plans[0].transactionCount, 0);
  const month = (await p.get(`/overview?${q(now)}`)).body;
  assert.equal(month.summary.actual.investmentNet, 0);
  assert.equal(month.summary.actual.expenses, 400);
  const lines = Object.fromEntries(month.plan.allocations.map(a => [a.name, a.actualAmount]));
  assert.deepEqual(lines, { Gold: 0, Food: 400 });
  // Analytics agrees: the recategorised buy is Food spending, not investment.
  const analytics = (await request(app).get('/api/expenses/analytics').set(auth(user))).body.analytics;
  assert.equal(analytics.categorySpending.find(c => c._id === 'Food').total, 400);
  // ...and, being spending now, it can be pinned to a budget line like any other expense.
  const foodLine = month.plan.allocations.find(a => a.name === 'Food').id;
  assert.equal((await p.put(`/transactions/${second.expenseId}/assignment`, { allocationId: foodLine })).status, 200);
});

test('a paused investment takes no new buys but can be redeemed; an archived goal takes no entries', async () => {
  const user = await createUser();
  const p = planner(user);
  const planId = (await p.post('/investments', { name: 'Stocks', category: 'STOCK' })).body.investmentId;
  await p.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 1000, date: iso(now) });
  await p.patch(`/investments/${planId}/active`, { active: false });
  const buy = await p.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 1, date: iso(now) });
  assert.equal(buy.status, 409);
  assert.equal(buy.body.code, 'PAUSED');
  assert.equal((await p.post(`/investments/${planId}/transactions`, { type: 'REDEEM', amount: 1500, date: iso(now) })).status, 201);
  assert.equal((await p.get('/investments')).body.plans[0].investedTotal, -500);
  assert.equal(await expenseCount(user), 2);

  const goal = (await p.post('/goals', { name: 'Old goal', targetAmount: 100, initialAmount: 50 })).body.goal;
  await p.patch(`/goals/${goal.id}/archive`, { archived: true });
  for (const type of ['CONTRIBUTION', 'WITHDRAWAL']) {
    const res = await p.post(`/goals/${goal.id}/contributions`, { type, amount: 1, date: iso(now) });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'ARCHIVED');
  }
});

test('recording a buy while the investment is being deleted never leaves an orphaned transaction', async () => {
  const user = await createUser();
  const p = planner(user);
  for (let i = 0; i < 5; i += 1) {
    const planId = (await p.post('/investments', { name: `Fund ${i}`, category: 'MUTUAL_FUND' })).body.investmentId;
    const [buy, del] = await Promise.all([
      p.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 100, date: iso(now) }),
      p.del(`/investments/${planId}`),
    ]);
    assert.ok([201, 404].includes(buy.status), `buy ${buy.status}`);
    assert.ok([200, 409].includes(del.status), `delete ${del.status}`);
    // Every Investment expense is still backed by an investment record.
    const orphans = await prisma.expense.count({ where: { userId: user.id, category: 'Investment', investmentTransaction: { is: null } } });
    assert.equal(orphans, 0);
  }
});
