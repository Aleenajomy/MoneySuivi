// Regression tests for the five findings of the Phase 4 security and correctness review.
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
const editTx = (user, id, body) => request(app).put(`/api/expenses/${id}`).set(auth(user)).send(body);

const lineTotalsPlusUnplanned = (month) =>
  month.plan.allocations.reduce((s, a) => s + Math.round((a.actualAmount || 0) * 100), 0)
  + month.summary.unplanned.reduce((s, u) => s + Math.round(u.amount * 100), 0);

const setUpSalary = async (user) => {
  const p = planner(user);
  await p.post('/income-sources', { name: 'Salary', kind: 'SALARY', expectedAmount: 15000 });
  const month = (await p.post('/budgets', now)).body;
  return { p, planId: month.plan.id, salary: month.salaries[0] };
};

// ---------------------------------------------------------------- finding 1

test('finding 1: moving a pinned line to Savings drops its pins and the spending stays counted', async () => {
  const user = await createUser();
  const { p, planId } = await setUpSalary(user);
  const rentId = (await p.post(`/budgets/${planId}/allocations`, { group: 'FIXED', name: 'Rent', plannedAmount: 3500 })).body.allocationId;
  await p.post(`/budgets/${planId}/allocations`, { group: 'FIXED', name: 'Other Bills', plannedAmount: 1000, matchCategories: ['Bills'] });
  const flat = await tx(user, { title: 'Flat', amount: 3500, category: 'Bills' });
  const gift = await tx(user, { title: 'Gift', amount: 300, category: 'Shopping' });
  await p.put(`/transactions/${flat.id}/assignment`, { allocationId: rentId });
  await p.put(`/transactions/${gift.id}/assignment`, { allocationId: rentId });

  const month = (await p.put(`/budgets/allocations/${rentId}`, { group: 'SAVINGS' })).body;
  assert.equal(await prisma.allocationAssignment.count(), 0);
  const rent = month.plan.allocations.find(a => a.id === rentId);
  assert.equal(rent.transactionCount, 0);
  assert.equal(rent.actualAmount, null);
  const byId = Object.fromEntries(month.spending.map(s => [s.id, s]));
  assert.equal(byId[flat.id].matchedBy, 'CATEGORY');
  assert.equal(byId[gift.id].matchedBy, 'UNPLANNED');
  assert.equal(lineTotalsPlusUnplanned(month), Math.round(month.summary.actual.expenses * 100));
});

test('finding 1: the bulk edit drops pins too, and a stray pin row on a savings line is ignored', async () => {
  const user = await createUser();
  const { p, planId } = await setUpSalary(user);
  const rentId = (await p.post(`/budgets/${planId}/allocations`, { group: 'FIXED', name: 'Rent', plannedAmount: 3500 })).body.allocationId;
  const flat = await tx(user, { title: 'Flat', amount: 3500, category: 'Bills' });
  await p.put(`/transactions/${flat.id}/assignment`, { allocationId: rentId });

  let month = (await p.put(`/budgets/${planId}`, { allocations: [{ id: rentId, group: 'INVESTMENT' }] })).body;
  assert.equal(await prisma.allocationAssignment.count(), 0);
  assert.equal(month.spending[0].matchedBy, 'UNPLANNED');

  // A row written behind the API's back still can't hide spending in a savings/investment line.
  await prisma.allocationAssignment.create({ data: { expenseId: flat.id, allocationId: rentId } });
  month = (await p.get(`/overview?${q(now)}`)).body;
  assert.equal(month.spending[0].matchedBy, 'UNPLANNED');
  assert.equal(lineTotalsPlusUnplanned(month), 350000);
});

test('finding 1: pinning and changing the line\'s group concurrently never leaves a pin on a savings line', async () => {
  const user = await createUser();
  const { p, planId } = await setUpSalary(user);
  const rentId = (await p.post(`/budgets/${planId}/allocations`, { group: 'FIXED', name: 'Rent', plannedAmount: 3500 })).body.allocationId;
  const spends = await Promise.all(Array.from({ length: 6 }, (_, i) => tx(user, { title: `Item ${i}`, amount: 100, category: 'Bills' })));
  const results = await Promise.all([
    ...spends.map(s => p.put(`/transactions/${s.id}/assignment`, { allocationId: rentId })),
    p.put(`/budgets/allocations/${rentId}`, { group: 'SAVINGS' }),
  ]);
  for (const r of results) assert.ok([200, 400].includes(r.status), `${r.status} ${JSON.stringify(r.body)}`);
  assert.equal(await prisma.allocationAssignment.count({ where: { allocationId: rentId } }), 0);
  const month = (await p.get(`/overview?${q(now)}`)).body;
  assert.equal(lineTotalsPlusUnplanned(month), 60000);
});

// ---------------------------------------------------------------- finding 2

test('finding 2: an income from another month cannot be linked, and is not offered', async () => {
  const user = await createUser();
  const { p, salary } = await setUpSalary(user);
  const old = await tx(user, { title: 'Salary credit', amount: 15000, type: 'income', category: 'Salary', expenseDate: iso(prev, 28) });
  const lastDay = await tx(user, { title: 'Early salary', amount: 15000, type: 'income', category: 'Salary', expenseDate: iso(prev, new Date(Date.UTC(prev.year, prev.month, 0)).getUTCDate()) });
  const later = await tx(user, { title: 'Next salary', amount: 15000, type: 'income', category: 'Salary', expenseDate: iso(next, 1) });

  for (const t of [old, lastDay, later]) {
    const res = await p.post(`/salaries/${salary.id}/receive`, { mode: 'link', expenseId: t.id });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'WRONG_MONTH');
  }
  assert.deepEqual((await p.get(`/salaries/${salary.id}/candidates`)).body.candidates, []);

  const ok = await tx(user, { title: 'Salary credit', amount: 15000, type: 'income', category: 'Salary', expenseDate: iso(now, 1) });
  assert.deepEqual((await p.get(`/salaries/${salary.id}/candidates`)).body.candidates.map(c => c.id), [ok.id]);
  assert.equal((await p.post(`/salaries/${salary.id}/receive`, { mode: 'link', expenseId: ok.id })).status, 200);
});

test('finding 2: a new income must be received within the record\'s month; the calendar day is what counts', async () => {
  const user = await createUser();
  const { p, salary } = await setUpSalary(user);
  for (const receivedAt of [iso(prev, 28), iso(next, 1), '1999-01-01']) {
    const res = await p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 15000, receivedAt });
    assert.equal(res.status, 400, receivedAt);
  }
  assert.equal(await prisma.expense.count({ where: { userId: user.id } }), 0);

  // An offset that would be the previous day in UTC still means the 1st of this month.
  const res = await p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 15000, receivedAt: `${iso(now, 1)}T00:30:00+05:30` });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const created = await prisma.expense.findFirst({ where: { userId: user.id } });
  assert.equal(created.expenseDate.toISOString(), `${iso(now, 1)}T00:00:00.000Z`);
});

// ---------------------------------------------------------------- finding 3

const linkedSalary = async (user) => {
  const s = await setUpSalary(user);
  const income = await tx(user, { title: 'Salary credit', amount: 15000, type: 'income', category: 'Salary', accountType: 'Bank', paymentMethod: 'Net Banking', expenseDate: iso(now, 1) });
  const res = await s.p.post(`/salaries/${s.salary.id}/receive`, { mode: 'link', expenseId: income.id });
  assert.equal(res.body.salary.status, 'RECEIVED');
  return { ...s, income };
};
const salaryRow = (id) => prisma.monthlySalary.findUnique({ where: { id } });

for (const [label, change] of [
  ['into an expense', { type: 'expense' }],
  ['into an investment', { category: 'Investment' }],
  ['into another month', { expenseDate: iso(next, 2) }],
]) {
  test(`finding 3: editing a linked income ${label} puts the salary back to pending, counted once`, async () => {
    const user = await createUser();
    const { p, salary, income } = await linkedSalary(user);
    assert.equal((await editTx(user, income.id, change)).status, 200);

    const row = await salaryRow(salary.id);
    assert.equal(row.receivedAt, null);
    assert.equal(row.expenseId, null);
    const month = (await p.get(`/overview?${q(now)}`)).body;
    assert.equal(month.salaries[0].status, 'PENDING');
    assert.equal(month.summary.income.received, 0);
    assert.equal(month.summary.actual.income, 0);
    // The transaction itself is kept exactly as the user edited it.
    assert.ok(await prisma.expense.findUnique({ where: { id: income.id } }));
  });
}

test('finding 3: other edits to a linked income keep it received and show the new amount', async () => {
  const user = await createUser();
  const { p, salary, income } = await linkedSalary(user);
  await editTx(user, income.id, { amount: 15250.5, title: 'Salary + arrears', expenseDate: iso(now, 3) });
  const month = (await p.get(`/overview?${q(now)}`)).body;
  assert.equal(month.salaries[0].status, 'RECEIVED');
  assert.equal(month.salaries[0].receivedAmount, 15250.5);
  assert.equal(month.summary.income.received, 15250.5);
  assert.equal(month.summary.actual.income, 15250.5);
  assert.equal((await salaryRow(salary.id)).expenseId, income.id);
});

test('finding 3: deleting a linked income in History resets the salary and its totals', async () => {
  const user = await createUser();
  const { p, salary, income } = await linkedSalary(user);
  assert.equal((await request(app).delete(`/api/expenses/${income.id}`).set(auth(user))).status, 200);
  const row = await salaryRow(salary.id);
  assert.deepEqual([row.receivedAt, row.expenseId, row.receivedAmount.toFixed(2)], [null, null, '0.00']);
  const month = (await p.get(`/overview?${q(now)}`)).body;
  assert.equal(month.salaries[0].status, 'PENDING');
  assert.equal(month.summary.income.received, 0);
  // It can be received again straight away.
  assert.equal((await p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 15000, receivedAt: iso(now, 2) })).status, 200);
});

test('finding 3: a stale "received" row is shown as pending and can be re-received, deleted or undone safely', async () => {
  const user = await createUser();
  const { p, salary, income } = await linkedSalary(user);
  // Simulate a row left behind by an edit made before this fix: the link no longer qualifies.
  await prisma.expense.update({ where: { id: income.id }, data: { type: 'expense' } });

  const month = (await p.get(`/salaries?${q(now)}`)).body;
  assert.equal(month.salaries[0].status, 'PENDING');
  assert.equal(month.salaries[0].expenseId, null);
  assert.equal(month.income.received, 0);

  // Undo with deleteTransaction must not delete a transaction that no longer backs the record.
  assert.equal((await p.post(`/salaries/${salary.id}/undo`, { deleteTransaction: true })).status, 200);
  assert.ok(await prisma.expense.findUnique({ where: { id: income.id } }));

  await prisma.monthlySalary.update({ where: { id: salary.id }, data: { receivedAt: new Date(), expenseId: income.id, receivedAmount: '15000' } });
  const again = await p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 15000, receivedAt: iso(now, 1) });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(again.body.salary.status, 'RECEIVED');
  assert.notEqual(again.body.salary.expenseId, income.id);
});

// ---------------------------------------------------------------- finding 4

test('finding 4: a month far past the old safe-integer limit still loads, with exact totals', async () => {
  const user = await createUser();
  const { p, planId } = await setUpSalary(user);
  await prisma.budgetAllocation.createMany({
    data: Array.from({ length: 91 }, (_, i) => ({ planId, group: 'FIXED', name: `Line ${i}`, plannedAmount: '999999999999.99' })),
  });
  await prisma.monthlySalary.createMany({
    data: Array.from({ length: 91 }, (_, i) => ({ userId: user.id, label: `Bonus ${i}`, kind: 'BONUS', year: now.year, month: now.month, expectedAmount: '999999999999.99' })),
  });

  const res = await p.get(`/overview?${q(now)}`);
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  const { summary } = res.body;
  assert.equal(summary.plan.totalAllocated, '90999999999999.09');
  assert.equal(summary.plan.plannedExpenses, '90999999999999.09');
  assert.equal(summary.income.expected, '91000000014999.09');
  assert.equal(summary.unallocated, 15000);
  assert.equal(summary.allocatedPercent, 100);
  // Individual amounts stay plain numbers, exactly.
  assert.equal(res.body.plan.allocations[0].plannedAmount, 999999999999.99);
  assert.equal(String(res.body.plan.allocations[0].plannedAmount), '999999999999.99');
});

test('finding 4: amounts at the maximum round-trip exactly through the API', async () => {
  const user = await createUser();
  const p = planner(user);
  const src = (await p.post('/income-sources', { name: 'Max', expectedAmount: '999999999999.99' })).body.incomeSource;
  assert.equal(String(src.expectedAmount), '999999999999.99');
  assert.equal((await prisma.incomeSource.findUnique({ where: { id: src.id } })).expectedAmount.toFixed(2), '999999999999.99');
  assert.equal((await p.post('/income-sources', { name: 'Over', expectedAmount: '1000000000000' })).status, 400);
  const paisa = (await p.post('/income-sources', { name: 'Paisa', expectedAmount: '0.01' })).body.incomeSource;
  assert.equal(paisa.expectedAmount, 0.01);
});

// ---------------------------------------------------------------- finding 5

test('finding 5: empty, whitespace-only and null names are rejected on create and update; names are trimmed', async () => {
  const user = await createUser();
  const { p, planId, salary } = await setUpSalary(user);
  const source = (await p.get('/income-sources')).body.incomeSources[0];
  const lineId = (await p.post(`/budgets/${planId}/allocations`, { group: 'FIXED', name: 'Rent', plannedAmount: 1 })).body.allocationId;

  const bad = [
    p.post('/income-sources', { name: '', expectedAmount: 1 }),
    p.post('/income-sources', { name: '   ', expectedAmount: 1 }),
    p.post('/income-sources', { name: null, expectedAmount: 1 }),
    p.put(`/income-sources/${source.id}`, { name: '' }),
    p.put(`/income-sources/${source.id}`, { name: ' \t ' }),
    p.put(`/income-sources/${source.id}`, { name: null }),
    p.put(`/income-sources/${source.id}`, { kind: null }),
    p.put(`/income-sources/${source.id}`, { expectedAmount: null }),
    p.post('/salaries', { ...now, label: '  ', expectedAmount: 1 }),
    p.put(`/salaries/${salary.id}`, { label: '' }),
    p.put(`/salaries/${salary.id}`, { label: null }),
    p.put(`/salaries/${salary.id}`, { expectedAmount: null }),
    p.post(`/budgets/${planId}/allocations`, { group: 'FIXED', name: '   ', plannedAmount: 1 }),
    p.put(`/budgets/allocations/${lineId}`, { name: '' }),
    p.put(`/budgets/allocations/${lineId}`, { plannedAmount: null }),
    p.put(`/budgets/${planId}`, { allocations: [{ id: lineId, name: ' ' }] }),
  ];
  for (const res of await Promise.all(bad)) {
    assert.equal(res.status, 400, `${res.req.method} ${res.req.path} ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, false);
    assert.ok(res.body.message);
  }
  const after = await prisma.incomeSource.findUnique({ where: { id: source.id } });
  assert.equal(after.name, 'Salary');
  assert.equal(after.expectedAmount.toFixed(2), '15000.00');
  assert.equal((await salaryRow(salary.id)).label, 'Salary');

  const trimmed = (await p.post('/income-sources', { name: '  Travel Allowance  ', kind: 'ALLOWANCE', expectedAmount: 1000 })).body.incomeSource;
  assert.equal(trimmed.name, 'Travel Allowance');
  const renamed = (await p.put(`/income-sources/${source.id}`, { name: '  Acme salary ' })).body.incomeSource;
  assert.equal(renamed.name, 'Acme salary');
  assert.equal((await salaryRow(salary.id)).label, 'Acme salary');
});

// ---------------------------------------------------------------- follow-ups from the fix review

test('impossible or partial dates are rejected instead of rolling into the next month', async () => {
  const user = await createUser();
  const { p, salary } = await setUpSalary(user);
  for (const receivedAt of [`${now.year}-02-30`, `${iso(now).slice(0, 7)}`, `${iso(now).slice(0, 7)}-32`, 'yesterday']) {
    const res = await p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 100, receivedAt });
    assert.equal(res.status, 400, receivedAt);
  }
  assert.equal(await prisma.expense.count({ where: { userId: user.id } }), 0);
});

// Whatever order the two requests land in, the record and the transaction must agree in the DB,
// not only on screen: either linked to a transaction that exists and qualifies, or fully pending.
const assertConsistent = async (salaryId) => {
  const row = await prisma.monthlySalary.findUnique({ where: { id: salaryId }, include: { expense: true } });
  if (row.receivedAt || row.expenseId) {
    assert.ok(row.expense, 'received record must point at an existing transaction');
    assert.equal(row.expense.type, 'income');
  } else {
    assert.equal(row.receivedAmount.toFixed(2), '0.00');
  }
};

test('linking racing a History delete leaves the record and transaction consistent', async () => {
  const user = await createUser();
  const { p, salary } = await setUpSalary(user);
  for (let i = 0; i < 6; i += 1) {
    const income = await tx(user, { title: `Credit ${i}`, amount: 15000, type: 'income', category: 'Salary', expenseDate: iso(now, 1) });
    const [link, del] = await Promise.all([
      p.post(`/salaries/${salary.id}/receive`, { mode: 'link', expenseId: income.id }),
      request(app).delete(`/api/expenses/${income.id}`).set(auth(user)),
    ]);
    assert.ok([200, 404].includes(link.status), `link ${link.status} ${JSON.stringify(link.body)}`);
    assert.equal(del.status, 200);
    await assertConsistent(salary.id);
    const row = await prisma.monthlySalary.findUnique({ where: { id: salary.id } });
    assert.equal(row.receivedAt, null);
  }
});

test('linking racing a History edit into an expense leaves the record and transaction consistent', async () => {
  const user = await createUser();
  const { p, salary } = await setUpSalary(user);
  for (let i = 0; i < 6; i += 1) {
    await p.post(`/salaries/${salary.id}/undo`, {});
    const income = await tx(user, { title: `Credit ${i}`, amount: 15000, type: 'income', category: 'Salary', expenseDate: iso(now, 1) });
    const [link, edit] = await Promise.all([
      p.post(`/salaries/${salary.id}/receive`, { mode: 'link', expenseId: income.id }),
      editTx(user, income.id, { type: 'expense' }),
    ]);
    assert.ok([200, 400].includes(link.status), `link ${link.status} ${JSON.stringify(link.body)}`);
    assert.equal(edit.status, 200);
    await assertConsistent(salary.id);
    assert.equal((await prisma.monthlySalary.findUnique({ where: { id: salary.id } })).receivedAt, null);
  }
});
