// Regression tests for the findings of the pre-release review of the whole Salary Planner.
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
const api = (user) => ({
  get: (url) => request(app).get(`/api/planner${url}`).set(auth(user)),
  post: (url, body = {}) => request(app).post(`/api/planner${url}`).set(auth(user)).send(body),
  put: (url, body = {}) => request(app).put(`/api/planner${url}`).set(auth(user)).send(body),
  patch: (url, body = {}) => request(app).patch(`/api/planner${url}`).set(auth(user)).send(body),
  del: (url) => request(app).delete(`/api/planner${url}`).set(auth(user)),
});
const tx = (user, body) => request(app).post('/api/expenses').set(auth(user))
  .send({ category: 'Other', type: 'expense', accountType: 'UPI', paymentMethod: 'UPI', expenseDate: iso(now), ...body });

test('deleting an investment never deletes a buy the user recategorised in History', async () => {
  const user = await createUser();
  const p = api(user);
  const planId = (await p.post('/investments', { name: 'Gold', category: 'GOLD' })).body.investmentId;
  await p.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 1000, date: iso(now) });
  await p.post(`/investments/${planId}/transactions`, { type: 'BUY', amount: 400, date: iso(now) });
  const [first, second] = (await p.get(`/investments/${planId}/transactions`)).body.transactions;
  await request(app).put(`/api/expenses/${second.expenseId}`).set(auth(user)).send({ category: 'Shopping' });

  assert.equal((await p.get('/investments')).body.plans[0].transactionCount, 1);
  assert.equal((await p.del(`/investments/${planId}`)).status, 409);
  assert.equal((await p.del(`/investments/${planId}?deleteTransactions=true`)).status, 200);
  assert.equal(await prisma.expense.findUnique({ where: { id: first.expenseId } }), null);
  const kept = await prisma.expense.findUnique({ where: { id: second.expenseId } });
  assert.equal(kept.category, 'Shopping');

  // With only recategorised buys left, the investment deletes without touching History at all.
  const other = (await p.post('/investments', { name: 'Stocks', category: 'STOCK' })).body.investmentId;
  await p.post(`/investments/${other}/transactions`, { type: 'BUY', amount: 250, date: iso(now) });
  const [only] = (await p.get(`/investments/${other}/transactions`)).body.transactions;
  await request(app).put(`/api/expenses/${only.expenseId}`).set(auth(user)).send({ category: 'Food' });
  assert.equal((await p.del(`/investments/${other}`)).status, 200);
  assert.ok(await prisma.expense.findUnique({ where: { id: only.expenseId } }));
});

test('copying repeating lines never makes two lines in a month track the same goal', async () => {
  const user = await createUser();
  const p = api(user);
  const goal = (await p.post('/goals', { name: 'Emergency', targetAmount: 50000 })).body.goal;
  const earlier = (await p.post('/budgets', now)).body.plan.id;
  await p.post(`/budgets/${earlier}/allocations`, { group: 'SAVINGS', name: 'Emergency Fund', plannedAmount: 2000, savingsGoalId: goal.id });
  const later = (await p.post('/budgets', shift(now, 1))).body.plan;
  const copied = later.allocations.find(a => a.name === 'Emergency Fund');
  assert.equal(copied.savingsGoalId, goal.id);
  await p.put(`/budgets/allocations/${copied.id}`, { name: 'EF' });

  const res = await p.post(`/budgets/${later.id}/copy-recurring`);
  assert.equal(res.body.copied, 1);
  const tracking = res.body.plan.allocations.filter(a => a.savingsGoalId === goal.id);
  assert.deepEqual(tracking.map(a => a.name), ['EF']);
  assert.equal(res.body.plan.allocations.find(a => a.name === 'Emergency Fund').savingsGoalId, null);
});

test('an income too large for the planner is refused cleanly when linked', async () => {
  const user = await createUser();
  const p = api(user);
  await p.post('/income-sources', { name: 'Salary', expectedAmount: 15000 });
  const salary = (await p.post('/budgets', now)).body.salaries[0];
  const huge = (await tx(user, { title: 'Windfall', amount: 1e12, type: 'income', category: 'Salary', expenseDate: iso(now, 2) })).body.expense;
  const res = await p.post(`/salaries/${salary.id}/receive`, { mode: 'link', expenseId: huge.id });
  assert.equal(res.status, 400);
  assert.equal((await prisma.monthlySalary.findUnique({ where: { id: salary.id } })).receivedAt, null);
});

test('lists are rejected wherever a single value is expected, in the body and the query', async () => {
  const user = await createUser();
  const p = api(user);
  const source = (await p.post('/income-sources', { name: 'Salary', expectedAmount: 15000 })).body.incomeSource;
  const planId = (await p.post('/budgets', now)).body.plan.id;
  const goal = (await p.post('/goals', { name: 'G', targetAmount: 100, initialAmount: 50 })).body.goal;
  const bad = [
    p.post('/income-sources', { name: 'S', kind: ['SALARY'], expectedAmount: 1 }),
    p.post('/income-sources', { name: ['S'], expectedAmount: 1 }),
    p.patch(`/income-sources/${source.id}/active`, { active: [true] }),
    p.post(`/budgets/${planId}/allocations`, { group: ['FIXED'], name: 'X', plannedAmount: 1 }),
    p.put(`/budgets/${planId}`, { allocations: [{ id: '00000000-0000-4000-8000-000000000000', recurring: [true] }] }),
    p.post('/investments', { name: 'I', category: ['GOLD'] }),
    p.post(`/goals/${goal.id}/contributions`, { type: ['WITHDRAWAL'], amount: 1, date: iso(now) }),
    p.post(`/goals/${goal.id}/contributions`, { type: 'CONTRIBUTION', amount: ['1'], date: iso(now) }),
    request(app).get(`/api/planner/overview?year=${now.year}&year=${now.year}&month=${now.month}`).set(auth(user)),
    request(app).post('/api/planner/income-sources').set(auth(user)).send([{ name: 'S', expectedAmount: 1 }]),
  ];
  for (const res of await Promise.all(bad)) assert.equal(res.status, 400, `${res.req.method} ${res.req.path} ${JSON.stringify(res.body)}`);
  // Fields that really are lists still work.
  assert.equal((await p.post(`/budgets/${planId}/allocations`, { group: 'FIXED', name: 'Rent', plannedAmount: 1, matchCategories: ['Bills'] })).status, 201);
});

test('concurrent bulk and single budget edits finish without errors', async () => {
  const user = await createUser();
  const p = api(user);
  const goal = (await p.post('/goals', { name: 'G', targetAmount: 100 })).body.goal;
  const planId = (await p.post('/budgets', now)).body.plan.id;
  const a = (await p.post(`/budgets/${planId}/allocations`, { group: 'SAVINGS', name: 'A', plannedAmount: 1 })).body.allocationId;
  const b = (await p.post(`/budgets/${planId}/allocations`, { group: 'FIXED', name: 'B', plannedAmount: 1 })).body.allocationId;
  for (let i = 0; i < 5; i += 1) {
    const results = await Promise.all([
      p.put(`/budgets/${planId}`, { allocations: [{ id: b, plannedAmount: 2 + i }, { id: a, savingsGoalId: i % 2 ? goal.id : null }] }),
      p.put(`/budgets/allocations/${a}`, { savingsGoalId: i % 2 ? null : goal.id }),
      p.post(`/budgets/${planId}/allocations`, { group: 'VARIABLE', name: `C${i}`, plannedAmount: 1 }),
    ]);
    for (const r of results) assert.ok(r.status < 500, `${r.status} ${JSON.stringify(r.body)}`);
  }
});

test('the report never says money was spent outside a plan that does not exist', async () => {
  const user = await createUser();
  const past = shift(now, -2);
  await tx(user, { title: 'Groceries', amount: 2500, category: 'Food', expenseDate: iso(past) });
  const res = await api(user).get(`/report?${q(past)}`);
  assert.equal(res.status, 200);
  assert.ok(!res.body.insights.some(i => i.id === 'unplanned'), JSON.stringify(res.body.insights));
  assert.deepEqual(res.body.categories.map(c => [c.category, c.amount]), [['Food', 2500]]);
});
