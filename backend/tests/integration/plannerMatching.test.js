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
const iso = ({ year, month }, day = 5) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const q = ({ year, month }) => `year=${year}&month=${month}`;

const planner = (user) => ({
  get: (url) => request(app).get(`/api/planner${url}`).set(auth(user)),
  post: (url, body = {}) => request(app).post(`/api/planner${url}`).set(auth(user)).send(body),
  put: (url, body = {}) => request(app).put(`/api/planner${url}`).set(auth(user)).send(body),
  del: (url) => request(app).delete(`/api/planner${url}`).set(auth(user)),
});
const tx = async (user, body) => {
  const res = await request(app).post('/api/expenses').set(auth(user))
    .send({ type: 'expense', category: 'Other', accountType: 'UPI', paymentMethod: 'UPI', expenseDate: iso(now), ...body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.expense;
};

// Salary ₹15,000 with Rent, Mess, Other Bills and Emergency Fund lines for the given month.
const setUpPlan = async (user, period = now) => {
  const p = planner(user);
  await p.post('/income-sources', { name: 'Salary', expectedAmount: 15000 });
  const created = (await p.post('/budgets', period)).body.plan;
  const planId = created.id;
  // A later month already has the repeating lines copied in from the earlier one.
  const existing = new Set(created.allocations.map(a => a.name));
  for (const line of [
    { group: 'FIXED', name: 'Rent / Accommodation', plannedAmount: 3500 },
    { group: 'FIXED', name: 'Mess / Food', plannedAmount: 2500, matchCategories: ['Food'] },
    { group: 'FIXED', name: 'Other Bills', plannedAmount: 1000, matchCategories: ['Bills'] },
    { group: 'SAVINGS', name: 'Emergency Fund', plannedAmount: 2000 },
  ].filter(l => !existing.has(l.name))) assert.equal((await p.post(`/budgets/${planId}/allocations`, line)).status, 201);
  const lines = Object.fromEntries((await p.get(`/budgets?${q(period)}`)).body.plan.allocations.map(a => [a.name, a]));
  return { p, planId, lines };
};
const overview = async (p, period = now) => (await p.get(`/overview?${q(period)}`)).body;
const line = (month, name) => month.plan.allocations.find(a => a.name === name);
const item = (month, id) => month.spending.find(s => s.id === id);

test('a ₹2,500 Mess expense from History lands on the Mess line without creating anything', async () => {
  const user = await createUser();
  const { p } = await setUpPlan(user);
  const mess = await tx(user, { title: 'Mess', amount: 2500, category: 'Food' });
  const before = await prisma.expense.count({ where: { userId: user.id } });

  const month = await overview(p);
  assert.equal(line(month, 'Mess / Food').actualAmount, 2500);
  assert.equal(line(month, 'Mess / Food').remainingAmount, 0);
  assert.equal(line(month, 'Mess / Food').utilization, 100);
  assert.equal(line(month, 'Mess / Food').transactionCount, 1);
  assert.equal(line(month, 'Rent / Accommodation').actualAmount, 0);
  assert.equal(month.summary.actual.expenses, 2500);
  assert.deepEqual(month.summary.unplanned, []);
  assert.deepEqual(
    (({ title, amount, allocationId, matchedBy, reassignable, source }) => ({ title, amount, allocationId, matchedBy, reassignable, source }))(item(month, mess.id)),
    { title: 'Mess', amount: 2500, allocationId: line(month, 'Mess / Food').id, matchedBy: 'NAME', reassignable: true, source: 'TRANSACTION' },
  );

  // Reading the planner again and again never adds transactions.
  await overview(p);
  await p.get(`/budgets/spending?${q(now)}`);
  assert.equal(await prisma.expense.count({ where: { userId: user.id } }), before);
});

test('editing or deleting the transaction in History updates the plan immediately', async () => {
  const user = await createUser();
  const { p } = await setUpPlan(user);
  const mess = await tx(user, { title: 'Mess', amount: 2500, category: 'Food' });
  await request(app).put(`/api/expenses/${mess.id}`).set(auth(user)).send({ amount: 2750.5 });
  let month = await overview(p);
  assert.equal(line(month, 'Mess / Food').actualAmount, 2750.5);
  assert.equal(line(month, 'Mess / Food').remainingAmount, -250.5);

  await request(app).delete(`/api/expenses/${mess.id}`).set(auth(user));
  month = await overview(p);
  assert.equal(line(month, 'Mess / Food').actualAmount, 0);
  assert.equal(month.summary.actual.expenses, 0);
});

test('manual reassignment moves spending between lines and can be undone', async () => {
  const user = await createUser();
  const { p, lines } = await setUpPlan(user);
  const rent = await tx(user, { title: 'November payment', amount: 3500, category: 'Bills' });
  await tx(user, { title: 'Electricity', amount: 600, category: 'Bills' });

  let month = await overview(p);
  assert.equal(item(month, rent.id).matchedBy, 'CATEGORY');
  assert.equal(line(month, 'Other Bills').actualAmount, 4100);

  const moved = await p.put(`/transactions/${rent.id}/assignment`, { allocationId: lines['Rent / Accommodation'].id });
  assert.equal(moved.status, 200);
  month = moved.body;
  assert.equal(line(month, 'Rent / Accommodation').actualAmount, 3500);
  assert.equal(line(month, 'Other Bills').actualAmount, 600);
  assert.equal(item(month, rent.id).matchedBy, 'ASSIGNED');
  assert.equal(month.summary.actual.expenses, 4100);

  // Reassigning again replaces the pin; the transaction is still counted once.
  month = (await p.put(`/transactions/${rent.id}/assignment`, { allocationId: lines['Mess / Food'].id })).body;
  assert.equal(line(month, 'Mess / Food').actualAmount, 3500);
  assert.equal(line(month, 'Rent / Accommodation').actualAmount, 0);
  assert.equal(await prisma.allocationAssignment.count(), 1);
  const total = month.plan.allocations.reduce((s, a) => s + (a.actualAmount || 0), 0);
  assert.equal(total, month.summary.actual.expenses);

  month = (await p.del(`/transactions/${rent.id}/assignment`)).body;
  assert.equal(item(month, rent.id).matchedBy, 'CATEGORY');
  assert.equal(line(month, 'Other Bills').actualAmount, 4100);
  assert.equal(await prisma.allocationAssignment.count(), 0);

  // The transaction itself is never modified by assigning it.
  const stored = await prisma.expense.findUnique({ where: { id: rent.id } });
  assert.equal(stored.category, 'Bills');
  assert.equal(stored.amount, 3500);
});

test('concurrent reassignments leave exactly one pin', async () => {
  const user = await createUser();
  const { p, lines } = await setUpPlan(user);
  const spend = await tx(user, { title: 'Groceries', amount: 400, category: 'Food' });
  const targets = [lines['Rent / Accommodation'].id, lines['Other Bills'].id, lines['Mess / Food'].id];
  const results = await Promise.all(targets.flatMap(id => [id, id]).map(id => p.put(`/transactions/${spend.id}/assignment`, { allocationId: id })));
  assert.deepEqual([...new Set(results.map(r => r.status))], [200]);
  assert.equal(await prisma.allocationAssignment.count({ where: { expenseId: spend.id } }), 1);
  const month = await overview(p);
  assert.equal(month.plan.allocations.reduce((s, a) => s + (a.actualAmount || 0), 0), 400);
});

test('only the user\'s own spending can be pinned, to an expense line in the same month', async () => {
  const user = await createUser();
  const other = await createUser();
  const { p, lines } = await setUpPlan(user);
  const later = await setUpPlan(user, next);
  const spend = await tx(user, { title: 'Groceries', amount: 400, category: 'Food' });
  const salary = await tx(user, { title: 'Salary', amount: 15000, type: 'income', category: 'Salary' });
  const atm = await tx(user, { title: 'ATM', amount: 1000, type: 'transfer', fromAccountType: 'Bank', toAccountType: 'Cash', category: 'Transfer' });
  const gold = await tx(user, { title: 'Gold', amount: 1000, category: 'Investment' });
  const theirs = await tx(other, { title: 'Theirs', amount: 50, category: 'Food' });
  const theirPlan = await setUpPlan(other);

  const cases = [
    [salary.id, lines['Mess / Food'].id, 400],
    [atm.id, lines['Mess / Food'].id, 400],
    [gold.id, lines['Mess / Food'].id, 400],
    [spend.id, lines['Emergency Fund'].id, 400],
    [spend.id, later.lines['Mess / Food'].id, 400],
    [theirs.id, lines['Mess / Food'].id, 404],
    [spend.id, theirPlan.lines['Mess / Food'].id, 404],
    [spend.id, '00000000-0000-4000-8000-000000000000', 404],
  ];
  for (const [expenseId, allocationId, status] of cases) {
    const res = await p.put(`/transactions/${expenseId}/assignment`, { allocationId });
    assert.equal(res.status, status, `${expenseId} -> ${allocationId}: ${JSON.stringify(res.body)}`);
  }
  assert.equal((await p.put('/transactions/not-a-uuid/assignment', { allocationId: lines['Mess / Food'].id })).status, 400);
  assert.equal((await p.put(`/transactions/${spend.id}/assignment`, { allocationId: 'nope' })).status, 400);
  assert.equal((await p.del(`/transactions/${theirs.id}/assignment`)).status, 404);
  // The other user can't pin the victim's transaction either, even to their own line.
  assert.equal((await planner(other).put(`/transactions/${spend.id}/assignment`, { allocationId: theirPlan.lines['Mess / Food'].id })).status, 404);
  assert.equal(await prisma.allocationAssignment.count(), 0);
});

test('deleting a pinned line, or moving the transaction to another month, falls back to automatic matching', async () => {
  const user = await createUser();
  const { p, lines } = await setUpPlan(user);
  await setUpPlan(user, next);
  const spend = await tx(user, { title: 'Groceries', amount: 400, category: 'Food' });
  const bill = await tx(user, { title: 'Water', amount: 200, category: 'Bills' });
  await p.put(`/transactions/${spend.id}/assignment`, { allocationId: lines['Rent / Accommodation'].id });
  await p.put(`/transactions/${bill.id}/assignment`, { allocationId: lines['Mess / Food'].id });

  let month = (await p.del(`/budgets/allocations/${lines['Rent / Accommodation'].id}`)).body;
  assert.equal(item(month, spend.id).matchedBy, 'CATEGORY');
  assert.equal(line(month, 'Mess / Food').actualAmount, 600);

  await request(app).put(`/api/expenses/${bill.id}`).set(auth(user)).send({ expenseDate: iso(next, 3) });
  month = await overview(p);
  assert.equal(item(month, bill.id), undefined);
  assert.equal(line(month, 'Mess / Food').actualAmount, 400);
  const nextMonth = await overview(p, next);
  assert.equal(item(nextMonth, bill.id).matchedBy, 'CATEGORY');
  assert.equal(line(nextMonth, 'Other Bills').actualAmount, 200);
});

test('EMI payments are listed against the EMI line but cannot be reassigned', async () => {
  const user = await createUser();
  const { p, planId } = await setUpPlan(user);
  await p.post(`/budgets/${planId}/allocations`, { group: 'FIXED', name: 'EMI / Loan', plannedAmount: 2000, matchCategories: ['EMI'] });
  const emi = (await request(app).post('/api/emis').set(auth(user)).send({ title: 'Phone', type: 'FIXED', totalAmount: 24000, emiAmount: 2000, totalInstallments: 12, startDate: iso(shift(now, -2)) })).body.emi;
  await request(app).patch(`/api/emis/${emi.id}/pay`).set(auth(user)).send({ paidAt: iso(now, 10) });

  const month = await overview(p);
  const payment = month.spending.find(s => s.source === 'EMI');
  assert.equal(payment.title, 'Phone');
  assert.equal(payment.amount, 2000);
  assert.equal(payment.reassignable, false);
  assert.equal(payment.allocationId, line(month, 'EMI / Loan').id);
  assert.equal(line(month, 'EMI / Loan').actualAmount, 2000);
  assert.equal((await p.put(`/transactions/${payment.id.replace('emi:', '')}/assignment`, { allocationId: line(month, 'Mess / Food').id })).status, 404);
});

test('spending list works for a month without a plan: everything is unplanned', async () => {
  const user = await createUser();
  const past = shift(now, -2);
  await tx(user, { title: 'Mess', amount: 2500, category: 'Food', expenseDate: iso(past) });
  const res = await planner(user).get(`/budgets/spending?${q(past)}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.planId, null);
  assert.deepEqual(res.body.spending.map(s => [s.title, s.matchedBy, s.allocationId]), [['Mess', 'UNPLANNED', null]]);
});
