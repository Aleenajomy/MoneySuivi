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
const prev = shift(now, -1);
const iso = ({ year, month }, day = 3) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const q = ({ year, month }) => `year=${year}&month=${month}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const p = (user) => ({
  get: (url) => request(app).get(`/api/planner${url}`).set(auth(user)),
  post: (url, body = {}) => request(app).post(`/api/planner${url}`).set(auth(user)).send(body),
});
const spend = (user, period, title, amount, category) => request(app).post('/api/expenses').set(auth(user))
  .send({ title, amount, category, type: 'expense', accountType: 'UPI', paymentMethod: 'UPI', expenseDate: iso(period, 4) });

// Two months of real activity: salary received, a plan, spending, a goal contribution, an investment.
const seed = async (user) => {
  const api = p(user);
  await api.post('/income-sources', { name: 'Salary', expectedAmount: 15000 });
  const goal = (await api.post('/goals', { name: 'Emergency Fund', targetAmount: 50000 })).body.goal;
  const gold = (await api.post('/investments', { name: 'Gold', category: 'GOLD', monthlyPlannedAmount: 1000 })).body.investmentId;
  for (const period of [prev, now]) {
    const month = (await api.post('/budgets', period)).body;
    if (!month.plan.allocations.length) {
      for (const line of [
        { group: 'FIXED', name: 'Rent', plannedAmount: 3500, matchCategories: ['Bills'] },
        { group: 'VARIABLE', name: 'Food', plannedAmount: 2000, matchCategories: ['Food'] },
        { group: 'SAVINGS', name: 'Emergency', plannedAmount: 2000, savingsGoalId: goal.id },
        { group: 'INVESTMENT', name: 'Gold', plannedAmount: 1000, investmentPlanId: gold },
      ]) assert.equal((await api.post(`/budgets/${month.plan.id}/allocations`, line)).status, 201);
    }
    // A source created today only applies from this month, so last month's salary is a one-off record.
    const salary = (await api.get(`/salaries?${q(period)}`)).body.salaries[0]
      || (await api.post('/salaries', { ...period, label: 'Salary', kind: 'SALARY', expectedAmount: 15000 })).body.salary;
    await api.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 15000, receivedAt: iso(period, 1) });
    await spend(user, period, 'Rent', 3500, 'Bills');
  }
  await spend(user, prev, 'Groceries', 2000, 'Food');
  await spend(user, now, 'Groceries', 2600, 'Food');
  await api.post(`/goals/${goal.id}/contributions`, { type: 'CONTRIBUTION', amount: 2250, date: iso(now, 5) });
  await api.post(`/investments/${gold}/transactions`, { type: 'BUY', amount: 1000, date: iso(now, 6) });
  return { goal };
};

test('the report matches the month overview exactly and explains the month with real numbers', async () => {
  const user = await createUser();
  await seed(user);
  const api = p(user);
  const before = await prisma.expense.count({ where: { userId: user.id } });

  const res = await api.get(`/report?${q(now)}`);
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  const { kpis, trend, categories, lines, goals, insights } = res.body;
  const overview = (await api.get(`/overview?${q(now)}`)).body.summary;

  assert.deepEqual(
    [kpis.income, kpis.expenses, kpis.savingsNet, kpis.investmentNet, kpis.available, kpis.plannedExpenses],
    [overview.actual.income, overview.actual.expenses, overview.actual.savingsNet, overview.actual.investmentNet, overview.actual.available, overview.plan.plannedExpenses],
  );
  assert.deepEqual([kpis.income, kpis.expenses, kpis.available], [15000, 6100, 5650]);
  assert.equal(kpis.budgetUtilization, 111); // 6,100 of 5,500 planned
  assert.equal(kpis.savingsRate, 15);

  assert.equal(trend.length, 6);
  assert.deepEqual(trend.slice(-2).map(t => [t.year, t.month, t.income, t.expenses]), [
    [prev.year, prev.month, 15000, 5500], [now.year, now.month, 15000, 6100],
  ]);
  assert.ok(trend.slice(0, 4).every(t => t.income === 0 && t.expenses === 0 && !t.hasPlan));

  assert.deepEqual(categories.map(c => [c.category, c.amount, c.share, c.previousAmount]), [['Bills', 3500, 57, 3500], ['Food', 2600, 43, 2000]]);
  assert.deepEqual(lines.map(l => [l.name, l.planned, l.actual, l.utilization]), [['Rent', 3500, 3500, 100], ['Food', 2000, 2600, 130]]);
  assert.deepEqual(goals.map(g => [g.name, g.savedAmount, g.progress]), [['Emergency Fund', 2250, 5]]);

  const text = insights.map(i => i.text);
  assert.ok(text.includes('Food is ₹600 over plan (₹2,600 of ₹2,000).'), text.join('\n'));
  assert.ok(text.includes(`You spent 30% more on Food than in ${MONTHS[prev.month - 1]} ${prev.year} (₹2,600 vs ₹2,000).`), text.join('\n'));
  assert.ok(text.includes('Your savings rate is 15%: you set aside ₹2,250 of the ₹15,000 you received, and invested ₹1,000.'), text.join('\n'));
  assert.ok(text.includes('Fixed costs (Rent) took 23% of the income you received.'), text.join('\n'));

  // Reading the report never writes anything.
  assert.equal(await prisma.expense.count({ where: { userId: user.id } }), before);
});

test('a month with nothing recorded gives empty figures and no invented insights', async () => {
  const user = await createUser();
  const future = shift(now, 3);
  const res = await p(user).get(`/report?${q(future)}&months=3`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.insights, []);
  assert.deepEqual(res.body.categories, []);
  assert.deepEqual(res.body.lines, []);
  assert.equal(res.body.trend.length, 3);
  assert.equal(res.body.kpis.budgetUtilization, null);
  assert.equal(res.body.kpis.savingsRate, null);
  assert.equal(await prisma.budgetPlan.count({ where: { userId: user.id } }), 0);
});

test('reports only ever contain the signed-in user\'s data, and inputs are validated', async () => {
  const user = await createUser();
  const other = await createUser();
  await seed(other);
  const mine = (await p(user).get(`/report?${q(now)}`)).body;
  assert.deepEqual([mine.kpis.income, mine.kpis.expenses, mine.categories, mine.goals, mine.insights], [0, 0, [], [], []]);
  for (const url of ['/report?months=1', '/report?months=13', '/report?year=2026', '/report?year=1999&month=1']) {
    assert.equal((await p(user).get(url)).status, 400, url);
  }
  assert.equal((await request(app).get('/api/planner/report')).status, 401);
});
