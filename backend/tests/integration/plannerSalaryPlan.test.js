// The simple monthly salary plan: My Salary -> Fixed Expenses -> Monthly Budget -> Savings ->
// Remaining Money. Every test also proves the plan is planning-only: balances, History, EMIs, EMI
// payments, Lend/Borrow and Net Worth never change.
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
const next = shift(now, 1);
const prev = shift(now, -1);
const iso = ({ year, month }, day = 5) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const q = ({ year, month }) => `year=${year}&month=${month}`;

const call = (user) => ({
  get: (url) => request(app).get(url).set(auth(user)),
  post: (url, body = {}) => request(app).post(url).set(auth(user)).send(body),
  put: (url, body = {}) => request(app).put(url).set(auth(user)).send(body),
  patch: (url, body = {}) => request(app).patch(url).set(auth(user)).send(body),
});
const plan = (user) => {
  const c = call(user);
  return {
    get: (period) => c.get(`/api/planner/salary-plan?${q(period)}`),
    init: (period) => c.post('/api/planner/salary-plan/init', period),
    put: (period, values) => c.put('/api/planner/salary-plan', { ...period, ...values }),
    reset: (period) => c.post('/api/planner/salary-plan/reset', period),
  };
};

const ROWS = ['cashBalance', 'upiBalance', 'creditCardBalance', 'debitCardBalance', 'netBankingBalance', 'totalBalance'];
const snapshot = async (user) => {
  const where = { userId: user.id };
  const [balances, history, emis, payments, contacts, entries, assets, liabilities, netWorth] = await Promise.all([
    call(user).get('/api/expenses/balances').then(r => Object.fromEntries(ROWS.map(k => [k, r.body.balances[k]]))),
    prisma.expense.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.eMI.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.eMIPayment.findMany({ where: { emi: where }, orderBy: { id: 'asc' } }),
    prisma.ledgerContact.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.ledgerEntry.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.asset.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.liability.findMany({ where, orderBy: { id: 'asc' } }),
    call(user).get('/api/networth/summary').then(r => r.body),
  ]);
  return JSON.parse(JSON.stringify({ balances, history, emis, payments, contacts, entries, assets, liabilities, netWorth }));
};

// A user with money and records everywhere, including two active fixed EMIs totalling ₹4,100.
const seedUser = async () => {
  const user = await createUser();
  const c = call(user);
  const tx = (body) => c.post('/api/expenses', { category: 'Other', accountType: 'UPI', paymentMethod: 'UPI', expenseDate: iso(prev, 1), ...body });
  await tx({ title: 'Opening', amount: 40000, type: 'income', category: 'Salary' });
  await tx({ title: 'Cash', amount: 3000, type: 'income', accountType: 'Cash', paymentMethod: 'Cash' });
  await tx({ title: 'Mess bill', amount: 2560, type: 'expense', category: 'Food', accountType: 'Cash', paymentMethod: 'Cash' });
  const phone = (await c.post('/api/emis', { title: 'Phone', type: 'FIXED', totalAmount: 30000, emiAmount: 2500, totalInstallments: 12, startDate: iso(prev, 1) })).body.emi;
  await c.post('/api/emis', { title: 'Laptop', type: 'FIXED', totalAmount: 19200, emiAmount: 1600, totalInstallments: 12, startDate: iso(prev, 1) });
  await c.post('/api/emis', { title: 'Bike loan', type: 'FLEXIBLE', totalAmount: 50000, interestRate: 10, startDate: iso(prev, 1) });
  await c.patch(`/api/emis/${phone.id}/pay`, { paidAt: iso(now, 3) });
  const contact = (await c.post('/api/ledger/contacts', { name: 'Ravi' })).body;
  await c.post(`/api/ledger/contacts/${contact.contact?.id || contact.id}/entries`, { type: 'LENT', amount: 1000, date: iso(prev, 3) });
  await c.post('/api/networth/assets', { name: 'Gold coin', type: 'Gold', value: 8000 });
  return { user, p: plan(user) };
};

const DEFAULTS = {
  salaryAmount: 15000, allowanceAmount: 2560, rentAmount: 2500, emiAmount: 4100,
  emergencySavingsAmount: 2000, generalSavingsAmount: 2000, shoppingAmount: 1500, travelAmount: 1000, foodAmount: 1000,
};

test('first month starts from the default plan, with EMI taken from active fixed EMIs', async () => {
  const { user, p } = await seedUser();
  const start = await snapshot(user);
  const res = await p.init(now);
  assert.equal(res.status, 201);
  assert.equal(res.body.created, true);
  assert.deepEqual(res.body.plan, DEFAULTS);
  assert.equal(res.body.emiTrackerTotal, 4100);
  assert.deepEqual(await snapshot(user), start);
});

test('the calculation: ₹15,000 − ₹2,500 − ₹4,100 = ₹8,400; extra balance ₹900; savings ₹4,000; expenses ₹10,100', async () => {
  const { p } = await seedUser();
  const { summary } = (await p.init(now)).body;
  assert.deepEqual(summary, {
    salary: 15000,
    allowance: 2560,
    incomeWithAllowance: 17560,
    fixedExpenses: 6600,
    afterFixed: 8400,
    allocated: 7500,
    extraBalance: 900,
    overBudget: 0,
    plannedSavings: 4000,
    spending: 3500,
    plannedExpenses: 10100,
    moneyRemaining: 900,
    breakdown: {
      fixed: { amount: 6600, percent: 44 },
      spending: { amount: 3500, percent: 23 },
      savings: { amount: 4000, percent: 27 },
      remaining: { amount: 900, percent: 6 },
    },
  });
  // Every rupee of salary is accounted for exactly once.
  assert.equal(summary.plannedSavings + summary.plannedExpenses + summary.moneyRemaining, summary.salary);
});

test('the company allowance is shown separately and never enters the salary budget', async () => {
  const { p } = await seedUser();
  await p.init(now);
  const base = (await p.get(now)).body.summary;
  const { summary } = (await p.put(now, { allowanceAmount: 9999 })).body;
  assert.equal(summary.incomeWithAllowance, 15000 + 9999);
  for (const key of ['afterFixed', 'extraBalance', 'plannedSavings', 'plannedExpenses', 'moneyRemaining']) {
    assert.equal(summary[key], base[key], key);
  }
  assert.deepEqual(summary.breakdown, base.breakdown);
});

test('extra balance is calculated, and allocating more than is left shows the over-budget amount', async () => {
  const { p } = await seedUser();
  await p.init(now);
  let { summary } = (await p.put(now, { shoppingAmount: 2400 })).body;
  assert.equal(summary.extraBalance, 0);
  assert.equal(summary.overBudget, 0, 'exactly the full ₹8,400');

  ({ summary } = (await p.put(now, { shoppingAmount: 2500 })).body);
  assert.equal(summary.extraBalance, 0);
  assert.equal(summary.moneyRemaining, 0);
  assert.equal(summary.overBudget, 100);

  // Fixed expenses above the salary: the shortfall and every allocation are over budget.
  ({ summary } = (await p.put(now, { salaryAmount: 6000, shoppingAmount: 1500 })).body);
  assert.equal(summary.afterFixed, -600);
  assert.equal(summary.overBudget, 8100);
  assert.equal(summary.moneyRemaining, 0);
});

test('amounts in paise are exact', async () => {
  const { p } = await seedUser();
  await p.init(now);
  const { summary } = (await p.put(now, { salaryAmount: '15000.10', rentAmount: '2500.20', foodAmount: '999.99' })).body;
  assert.equal(summary.afterFixed, 8399.9);
  assert.equal(summary.extraBalance, 899.91);
});

test('a new month copies the previous month; editing one month never changes another', async () => {
  const { p } = await seedUser();
  await p.init(now);
  await p.put(now, { salaryAmount: 16000, travelAmount: 1200 });
  const copied = (await p.init(next)).body.plan;
  assert.equal(copied.salaryAmount, 16000);
  assert.equal(copied.travelAmount, 1200);
  await p.put(next, { travelAmount: 500 });
  assert.equal((await p.get(now)).body.plan.travelAmount, 1200);
  assert.equal((await p.init(next)).body.created, false, 'setting up again changes nothing');
  assert.equal((await p.get(next)).body.plan.travelAmount, 500);
});

test('reading a month never creates it; a past month is only set up when asked', async () => {
  const { user, p } = await seedUser();
  const res = await p.get(prev);
  assert.equal(res.status, 200);
  assert.equal(res.body.plan, null);
  assert.equal(res.body.emiTrackerTotal, 4100);
  assert.equal(await prisma.budgetPlan.count({ where: { userId: user.id } }), 0);
});

test('editing EMI in the planner changes only the plan, never the EMI records or payments', async () => {
  const { user, p } = await seedUser();
  await p.init(now);
  const start = await snapshot(user);
  const { plan: values, emiTrackerTotal, summary } = (await p.put(now, { emiAmount: 3000, rentAmount: 3000 })).body;
  assert.equal(values.emiAmount, 3000);
  assert.equal(emiTrackerTotal, 4100);
  assert.equal(summary.afterFixed, 9000);
  assert.deepEqual(await snapshot(user), start);
});

test('reset restores the default plan with the current EMI total; nothing else changes', async () => {
  const { user, p } = await seedUser();
  await p.init(now);
  await p.put(now, { salaryAmount: 1, allowanceAmount: 0, emiAmount: 0, foodAmount: 7 });
  const start = await snapshot(user);
  const res = await p.reset(now);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.plan, DEFAULTS);
  assert.deepEqual(await snapshot(user), start);
});

test('setting up a month concurrently creates one plan', async () => {
  const { user, p } = await seedUser();
  const results = await Promise.all(Array.from({ length: 5 }, () => p.init(now)));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 200, 200, 200, 201]);
  assert.equal(await prisma.budgetPlan.count({ where: { userId: user.id } }), 1);
});

test('a month planned under the earlier planner keeps its lines and gains the salary plan', async () => {
  const { user, p } = await seedUser();
  const old = (await call(user).post('/api/planner/budgets', { ...now, defaults: true })).body.plan;
  const lines = await prisma.budgetAllocation.findMany({ where: { planId: old.id }, orderBy: { id: 'asc' } });
  assert.ok(lines.length > 0);
  const res = await p.init(now);
  assert.equal(res.body.created, true);
  assert.deepEqual(res.body.plan, DEFAULTS);
  assert.deepEqual(await prisma.budgetAllocation.findMany({ where: { planId: old.id }, orderBy: { id: 'asc' } }), lines);
});

test('invalid input is rejected and changes nothing', async () => {
  const { user, p } = await seedUser();
  await p.init(now);
  const before = await prisma.budgetPlan.findMany({ where: { userId: user.id } });
  const bad = [
    p.put(now, { salaryAmount: -1 }),
    p.put(now, { rentAmount: '2500.555' }),
    p.put(now, { emiAmount: 'abc' }),
    p.put(now, { foodAmount: null }),
    p.put(now, { travelAmount: 1e13 }),
    p.put({ year: now.year }, { salaryAmount: 1 }),
    p.put({ year: now.year, month: 13 }, { salaryAmount: 1 }),
    p.init({ year: 1999, month: 1 }),
    p.get({ year: now.year, month: 0 }),
  ];
  for (const res of await Promise.all(bad)) assert.equal(res.status, 400, `${res.req.method} ${res.req.path} ${JSON.stringify(res.body)}`);
  assert.deepEqual(await prisma.budgetPlan.findMany({ where: { userId: user.id } }), before);
});

test('each user only ever sees and changes their own plan', async () => {
  const { user, p } = await seedUser();
  await p.init(now);
  await p.put(now, { salaryAmount: 20000 });
  const other = await createUser();
  const o = plan(other);
  assert.equal((await o.get(now)).body.plan, null);
  await o.init(now);
  await o.put(now, { salaryAmount: 1 });
  await o.reset(now);
  assert.equal((await p.get(now)).body.plan.salaryAmount, 20000);
  assert.equal(await prisma.budgetPlan.count({ where: { userId: user.id } }), 1);
});

test('salary plan endpoints require authentication', async () => {
  for (const res of await Promise.all([
    request(app).get(`/api/planner/salary-plan?${q(now)}`),
    request(app).post('/api/planner/salary-plan/init').send(now),
    request(app).put('/api/planner/salary-plan').send({ ...now, salaryAmount: 1 }),
    request(app).post('/api/planner/salary-plan/reset').send(now),
  ])) assert.equal(res.status, 401);
});

test('a full planning session never changes balances, History, EMI, EMI payments, Lend/Borrow or Net Worth', async () => {
  const { user, p } = await seedUser();
  const start = await snapshot(user);
  const transactions = await prisma.expense.count();
  await p.get(now);
  await p.init(now);
  await p.put(now, { salaryAmount: 15500, allowanceAmount: 2600 });
  await p.put(now, { rentAmount: 2600, emiAmount: 4200 });
  await p.put(now, { emergencySavingsAmount: 2500, generalSavingsAmount: 1500, shoppingAmount: 9999 });
  await p.put(now, { shoppingAmount: 1500, travelAmount: 800, foodAmount: 1200 });
  await p.init(next);
  await p.put(next, { salaryAmount: 0 });
  await p.reset(next);
  await p.reset(now);
  await p.init(prev);
  assert.deepEqual(await snapshot(user), start);
  assert.equal(await prisma.expense.count(), transactions);
});
