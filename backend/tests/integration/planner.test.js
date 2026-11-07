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

const api = (user) => ({
  get: (url) => request(app).get(`/api/planner${url}`).set(auth(user)),
  post: (url, body = {}) => request(app).post(`/api/planner${url}`).set(auth(user)).send(body),
  put: (url, body = {}) => request(app).put(`/api/planner${url}`).set(auth(user)).send(body),
  patch: (url, body = {}) => request(app).patch(`/api/planner${url}`).set(auth(user)).send(body),
  del: (url) => request(app).delete(`/api/planner${url}`).set(auth(user)),
});
const tx = (user, body) => request(app).post('/api/expenses').set(auth(user)).send({ category: 'Other', expenseDate: iso(now), accountType: 'UPI', paymentMethod: 'UPI', ...body });
const q = ({ year, month }) => `year=${year}&month=${month}`;
const incomeCount = (user) => prisma.expense.count({ where: { userId: user.id, type: 'income' } });

// Income is recorded in History (Add Transaction) and then linked; the planner never creates it.
const receiveViaHistory = async (user, p, salary, amount = 15000, day = iso(now, 1), method = 'UPI') => {
  const income = (await tx(user, { title: 'Salary credit', amount, type: 'income', category: 'Salary', accountType: method, paymentMethod: method, expenseDate: day })).body.expense;
  const res = await p.post(`/salaries/${salary.id}/receive`, { mode: 'link', expenseId: income.id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { income, res };
};

const setUpSalary = async (user, amount = 15000) => {
  const p = api(user);
  const source = (await p.post('/income-sources', { name: 'Salary', kind: 'SALARY', expectedAmount: amount, payDay: 1 })).body.incomeSource;
  const month = (await p.post('/budgets', now)).body;
  return { p, source, salary: month.salaries.find(s => s.incomeSourceId === source.id) };
};

test('income sources: create, list, update, pause and delete, with pending records kept in step', async () => {
  const user = await createUser();
  const p = api(user);
  const created = await p.post('/income-sources', { name: 'Salary', kind: 'SALARY', expectedAmount: '15000.50', payDay: 31 });
  assert.equal(created.status, 201);
  assert.equal(created.body.incomeSource.expectedAmount, 15000.5);
  const ta = (await p.post('/income-sources', { name: 'Travel Allowance', kind: 'ALLOWANCE', expectedAmount: 1000 })).body.incomeSource;
  await p.post('/income-sources', { name: 'Sales incentive', kind: 'INCENTIVE', expectedAmount: 500 });

  await p.post('/salaries/initialize', now);
  const updated = await p.put(`/income-sources/${ta.id}`, { expectedAmount: 1200, name: 'TA' });
  assert.equal(updated.status, 200);
  let month = (await p.get(`/salaries?${q(now)}`)).body;
  assert.equal(month.salaries.find(s => s.incomeSourceId === ta.id).expectedAmount, 1200);
  assert.equal(month.salaries.find(s => s.incomeSourceId === ta.id).label, 'TA');
  assert.equal(month.income.expected, 16700.5);
  assert.equal(month.income.expectedSalary, 15000.5);
  assert.equal(month.income.expectedAdditional, 1700);

  const paused = await p.patch(`/income-sources/${ta.id}/active`, { active: false });
  assert.equal(paused.body.incomeSource.active, false);
  month = (await p.get(`/salaries?${q(now)}`)).body;
  assert.equal(month.salaries.length, 2);
  assert.equal(month.income.expected, 15500.5);

  const list = (await p.get('/income-sources')).body.incomeSources;
  assert.deepEqual(list.map(s => [s.name, s.active]), [['Salary', true], ['Sales incentive', true], ['TA', false]]);

  assert.equal((await p.del(`/income-sources/${ta.id}`)).status, 200);
  assert.equal((await p.del(`/income-sources/${ta.id}`)).status, 404);
});

test('deleting a source keeps its received history but drops pending months', async () => {
  const user = await createUser();
  const { p, source, salary } = await setUpSalary(user);
  await receiveViaHistory(user, p, salary);
  await p.post('/salaries/initialize', next);
  assert.equal(await prisma.monthlySalary.count({ where: { userId: user.id } }), 2);

  await p.del(`/income-sources/${source.id}`);
  const remaining = await prisma.monthlySalary.findMany({ where: { userId: user.id } });
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].incomeSourceId, null);
  assert.equal(remaining[0].label, 'Salary');
  assert.equal(await incomeCount(user), 1);
});

test('expected salary is never assumed received', async () => {
  const user = await createUser();
  const { p, salary } = await setUpSalary(user);
  assert.equal(salary.status, 'PENDING');
  const overview = (await p.get(`/overview?${q(now)}`)).body;
  assert.equal(overview.summary.income.expected, 15000);
  assert.equal(overview.summary.income.received, 0);
  assert.equal(overview.summary.actual.income, 0);
  assert.equal(await incomeCount(user), 0);
});

test('the planner never creates income: "create" is refused and nothing is added', async () => {
  const user = await createUser();
  const { p, salary } = await setUpSalary(user);
  const before = (await request(app).get('/api/expenses/balances').set(auth(user))).body.balances;
  const attempts = await Promise.all([
    p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: '14999.99', receivedAt: iso(now, 1), paymentMethod: 'Net Banking' }),
    p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 15000, receivedAt: iso(now, 1), paymentMethod: 'UPI', confirmDuplicate: true }),
    p.post(`/salaries/${salary.id}/receive`, { receivedAmount: 15000, receivedAt: iso(now, 1), paymentMethod: 'UPI' }),
  ]);
  for (const res of attempts) assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.equal(await incomeCount(user), 0);
  assert.deepEqual((await request(app).get('/api/expenses/balances').set(auth(user))).body.balances, before);
  assert.equal((await prisma.monthlySalary.findUnique({ where: { id: salary.id } })).receivedAt, null);
});

test('concurrent "received" taps link once; the rest get 409 and nothing is created', async () => {
  const user = await createUser();
  const { p, salary } = await setUpSalary(user);
  const income = (await tx(user, { title: 'Salary credit', amount: 15000, type: 'income', category: 'Salary', expenseDate: iso(now, 1) })).body.expense;
  const results = await Promise.all(Array.from({ length: 5 }, () => p.post(`/salaries/${salary.id}/receive`, { mode: 'link', expenseId: income.id })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409, 409, 409, 409]);
  assert.equal(await incomeCount(user), 1);
});

test('linking an income already recorded in History does not create another one', async () => {
  const user = await createUser();
  const { p, salary } = await setUpSalary(user);
  const existing = (await tx(user, { title: 'Salary credit', amount: 15000, type: 'income', category: 'Salary', accountType: 'Bank', paymentMethod: 'Net Banking', expenseDate: iso(now, 1) })).body.expense;
  await tx(user, { title: 'Gold sold', amount: 900, type: 'income', category: 'Investment' });

  const candidates = (await p.get(`/salaries/${salary.id}/candidates`)).body.candidates;
  assert.deepEqual(candidates.map(c => [c.id, c.matchesExpected]), [[existing.id, true]]);

  const linked = await p.post(`/salaries/${salary.id}/receive`, { mode: 'link', expenseId: existing.id });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.salary.status, 'RECEIVED');
  assert.equal(linked.body.salary.transaction.id, existing.id);
  assert.equal(await incomeCount(user), 2);
  assert.equal((await p.get(`/salaries/${salary.id}/candidates`)).body.candidates.length, 0);

  // The summary counts the salary once, not once for the record and again for the transaction.
  const overview = (await p.get(`/overview?${q(now)}`)).body.summary;
  assert.equal(overview.income.received, 15000);
  assert.equal(overview.actual.income, 15000);

  const bonus = (await p.post('/salaries', { ...now, label: 'Bonus', kind: 'BONUS', expectedAmount: 1000 })).body.salary;
  const reuse = await p.post(`/salaries/${bonus.id}/receive`, { mode: 'link', expenseId: existing.id });
  assert.equal(reuse.status, 409);
  assert.equal(reuse.body.code, 'TRANSACTION_ALREADY_LINKED');
});

test('only the user\'s own income transactions can be linked', async () => {
  const user = await createUser();
  const other = await createUser();
  const { p, salary } = await setUpSalary(user);
  const theirs = (await tx(other, { title: 'Their salary', amount: 15000, type: 'income', category: 'Salary' })).body.expense;
  const spend = (await tx(user, { title: 'Rent', amount: 3500, type: 'expense', category: 'Bills' })).body.expense;
  const gold = (await tx(user, { title: 'Gold sold', amount: 900, type: 'income', category: 'Investment' })).body.expense;

  assert.equal((await p.post(`/salaries/${salary.id}/receive`, { mode: 'link', expenseId: theirs.id })).status, 404);
  assert.equal((await p.post(`/salaries/${salary.id}/receive`, { mode: 'link', expenseId: spend.id })).status, 400);
  assert.equal((await p.post(`/salaries/${salary.id}/receive`, { mode: 'link', expenseId: gold.id })).status, 400);
  assert.equal((await prisma.monthlySalary.findUnique({ where: { id: salary.id } })).receivedAt, null);
});

test('undo only changes the planner record; the transaction is never deleted from here', async () => {
  const user = await createUser();
  const { p, salary } = await setUpSalary(user);
  await receiveViaHistory(user, p, salary);
  const undone = await p.post(`/salaries/${salary.id}/undo`, {});
  assert.equal(undone.body.salary.status, 'PENDING');
  assert.equal(await incomeCount(user), 1);
  assert.equal((await p.post(`/salaries/${salary.id}/undo`, {})).status, 400);

  // The kept transaction can now be linked back instead of recording a second one.
  const [kept] = (await p.get(`/salaries/${salary.id}/candidates`)).body.candidates;
  await p.post(`/salaries/${salary.id}/receive`, { mode: 'link', expenseId: kept.id });
  const refused = await p.post(`/salaries/${salary.id}/undo`, { deleteTransaction: true });
  assert.equal(refused.status, 400);
  assert.equal(await incomeCount(user), 1);
  assert.equal((await p.post(`/salaries/${salary.id}/undo`, { deleteTransaction: false })).status, 200);
  assert.equal(await incomeCount(user), 1);
  assert.equal((await p.del(`/salaries/${salary.id}`)).status, 200);
});

test('received records cannot be deleted until undone', async () => {
  const user = await createUser();
  const { p, salary } = await setUpSalary(user);
  await receiveViaHistory(user, p, salary);
  assert.equal((await p.del(`/salaries/${salary.id}`)).status, 409);
});

test('salary history totals each month', async () => {
  const user = await createUser();
  const { p, salary } = await setUpSalary(user);
  await receiveViaHistory(user, p, salary);
  await p.post('/salaries', { ...now, label: 'Bonus', kind: 'BONUS', expectedAmount: '2500.25' });
  await p.post('/salaries/initialize', next);
  const history = (await p.get(`/salaries/history?months=3&${q(next)}`)).body.history;
  assert.deepEqual(history.map(h => [h.year, h.month, h.expectedAmount, h.receivedAmount, h.records.length]), [
    [next.year, next.month, 15000, 0, 1],
    [now.year, now.month, 17500.25, 15000, 2],
  ]);
});

test('salary initialization is idempotent, even when requests race', async () => {
  const user = await createUser();
  const p = api(user);
  await p.post('/income-sources', { name: 'Salary', kind: 'SALARY', expectedAmount: 15000 });
  await p.post('/income-sources', { name: 'TA', kind: 'ALLOWANCE', expectedAmount: 1000 });
  await Promise.all(Array.from({ length: 5 }, () => p.post('/salaries/initialize', now)));
  await Promise.all(Array.from({ length: 5 }, () => p.post('/budgets', now)));
  assert.equal(await prisma.monthlySalary.count({ where: { userId: user.id } }), 2);
  assert.equal(await prisma.budgetPlan.count({ where: { userId: user.id } }), 1);
});

const addAllocations = async (p, planId, list) => {
  for (const a of list) {
    const res = await p.post(`/budgets/${planId}/allocations`, a);
    assert.equal(res.status, 201, JSON.stringify(res.body));
  }
};

test('the example plan allocates ₹15,000 across four groups and reports what is left', async () => {
  const user = await createUser();
  const { p } = await setUpSalary(user);
  const planId = (await p.get(`/budgets?${q(now)}`)).body.plan.id;
  await addAllocations(p, planId, [
    { group: 'FIXED', name: 'Rent', plannedAmount: 3500, matchCategories: ['Bills'] },
    { group: 'FIXED', name: 'Mess', plannedAmount: 2500, matchCategories: ['Food'] },
    { group: 'VARIABLE', name: 'Travel', plannedAmount: 1000, matchCategories: ['Travel'] },
    { group: 'SAVINGS', name: 'Emergency Fund', plannedAmount: 2000 },
    { group: 'INVESTMENT', name: 'Gold', plannedAmount: '1000.50' },
  ]);
  const { summary, plan } = (await p.get(`/budgets?${q(now)}`)).body;
  assert.equal(summary.plan.plannedExpenses, 7000);
  assert.equal(summary.plan.plannedSavings, 2000);
  assert.equal(summary.plan.plannedInvestments, 1000.5);
  assert.equal(summary.plan.totalAllocated, 10000.5);
  assert.equal(summary.unallocated, 4999.5);
  assert.equal(summary.overAllocated, false);
  assert.equal(summary.allocatedPercent, 67);
  assert.deepEqual(plan.allocations.map(a => a.name), ['Rent', 'Mess', 'Travel', 'Emergency Fund', 'Gold']);

  const duplicate = await p.post(`/budgets/${planId}/allocations`, { group: 'VARIABLE', name: 'Rent', plannedAmount: 1 });
  assert.equal(duplicate.status, 409);
});

test('actuals: transfers, investments and savings stay out of spending; EMIs count once', async () => {
  const user = await createUser();
  const { p, salary } = await setUpSalary(user);
  const planId = (await p.get(`/budgets?${q(now)}`)).body.plan.id;
  await addAllocations(p, planId, [
    { group: 'FIXED', name: 'Rent', plannedAmount: 3500, matchCategories: ['Bills'] },
    { group: 'FIXED', name: 'Loan', plannedAmount: 2000, matchCategories: ['EMI'] },
    { group: 'VARIABLE', name: 'Food', plannedAmount: 1000, matchCategories: ['Food'] },
  ]);
  await receiveViaHistory(user, p, salary);
  await tx(user, { title: 'Rent', amount: 3500, type: 'expense', category: 'Bills' });
  await tx(user, { title: 'Lunch', amount: 1200.75, type: 'expense', category: 'Food' });
  await tx(user, { title: 'Movie', amount: 300, type: 'expense', category: 'Entertainment' });
  await tx(user, { title: 'ATM', amount: 2000, type: 'transfer', fromAccountType: 'Bank', toAccountType: 'Cash', category: 'Transfer' });
  await tx(user, { title: 'Gold', amount: 1000, type: 'expense', category: 'Investment' });
  await tx(user, { title: 'Last month', amount: 999, type: 'expense', category: 'Food', expenseDate: iso(shift(now, -1)) });
  const emi = (await request(app).post('/api/emis').set(auth(user)).send({ title: 'Phone', type: 'FIXED', totalAmount: 24000, emiAmount: 2000, totalInstallments: 12, startDate: iso(shift(now, -2)) })).body.emi;
  await request(app).patch(`/api/emis/${emi.id}/pay`).set(auth(user)).send({ paidAt: iso(now, 10) });
  const goal = await prisma.savingsGoal.create({ data: { userId: user.id, name: 'Emergency', targetAmount: '50000' } });
  await prisma.savingsContribution.create({ data: { goalId: goal.id, amount: '3000', date: new Date(`${iso(now, 2)}T00:00:00Z`) } });

  const { plan, summary } = (await p.get(`/overview?${q(now)}`)).body;
  const byName = Object.fromEntries(plan.allocations.map(a => [a.name, a]));
  assert.equal(byName.Rent.actualAmount, 3500);
  assert.equal(byName.Rent.remainingAmount, 0);
  assert.equal(byName.Rent.utilization, 100);
  assert.equal(byName.Loan.actualAmount, 2000);
  assert.equal(byName.Food.actualAmount, 1200.75);
  assert.equal(byName.Food.remainingAmount, -200.75);
  assert.equal(byName.Food.utilization, 120);
  assert.deepEqual(summary.unplanned, [{ category: 'Entertainment', amount: 300 }]);

  assert.equal(summary.actual.income, 15000);
  assert.equal(summary.actual.expenses, 7000.75);
  assert.equal(summary.actual.emi, 2000);
  assert.equal(summary.actual.investmentNet, 1000);
  assert.equal(summary.actual.savingsNet, 3000);
  // 15,000 - 7,000.75 - 3,000 - 1,000
  assert.equal(summary.actual.available, 3999.25);
});

test('a new month copies only recurring allocations; editing it leaves the old month alone', async () => {
  const user = await createUser();
  const { p } = await setUpSalary(user);
  const planId = (await p.get(`/budgets?${q(now)}`)).body.plan.id;
  await addAllocations(p, planId, [
    { group: 'FIXED', name: 'Rent', plannedAmount: 3500, matchCategories: ['Bills'] },
    { group: 'VARIABLE', name: 'Diwali shopping', plannedAmount: 4000, recurring: false },
    { group: 'SAVINGS', name: 'Emergency Fund', plannedAmount: 2000 },
  ]);

  const later = shift(now, 2);
  assert.equal((await p.get(`/budgets?${q(later)}`)).body.plan, null);
  const created = await p.post('/budgets', later);
  assert.equal(created.status, 201);
  assert.equal(created.body.initialized.copiedAllocations, 2);
  assert.deepEqual(created.body.plan.allocations.map(a => [a.name, a.plannedAmount, a.matchCategories]), [
    ['Rent', 3500, ['Bills']], ['Emergency Fund', 2000, []],
  ]);
  assert.equal(created.body.salaries.length, 1);
  assert.equal(created.body.salaries[0].status, 'PENDING');

  const rent = created.body.plan.allocations.find(a => a.name === 'Rent');
  await p.put(`/budgets/allocations/${rent.id}`, { plannedAmount: 4000 });
  const fund = created.body.plan.allocations.find(a => a.name === 'Emergency Fund');
  await p.del(`/budgets/allocations/${fund.id}`);

  const original = (await p.get(`/budgets?${q(now)}`)).body.plan.allocations;
  assert.deepEqual(original.map(a => [a.name, a.plannedAmount]), [['Rent', 3500], ['Diwali shopping', 4000], ['Emergency Fund', 2000]]);

  // Re-running set-up neither duplicates the plan nor re-copies the deleted line.
  const again = await p.post('/budgets', later);
  assert.equal(again.status, 200);
  assert.deepEqual(again.body.plan.allocations.map(a => [a.name, a.plannedAmount]), [['Rent', 4000]]);

  // Copying recurring on demand brings back missing lines without touching edited ones.
  const copied = await p.post(`/budgets/${again.body.plan.id}/copy-recurring`);
  assert.equal(copied.body.copied, 1);
  assert.deepEqual(copied.body.plan.allocations.map(a => [a.name, a.plannedAmount]), [['Rent', 4000], ['Emergency Fund', 2000]]);
  assert.equal((await p.post(`/budgets/${again.body.plan.id}/copy-recurring`)).body.copied, 0);
});

test('bulk allocation update is all-or-nothing', async () => {
  const user = await createUser();
  const { p } = await setUpSalary(user);
  const planId = (await p.get(`/budgets?${q(now)}`)).body.plan.id;
  await addAllocations(p, planId, [
    { group: 'FIXED', name: 'Rent', plannedAmount: 3500 },
    { group: 'VARIABLE', name: 'Travel', plannedAmount: 1000 },
  ]);
  const [rent, travel] = (await p.get(`/budgets?${q(now)}`)).body.plan.allocations;

  const ok = await p.put(`/budgets/${planId}`, { note: 'Tight month', allocations: [{ id: rent.id, plannedAmount: 3600 }, { id: travel.id, recurring: false }] });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.plan.note, 'Tight month');
  assert.deepEqual(ok.body.plan.allocations.map(a => [a.plannedAmount, a.recurring]), [[3600, true], [1000, false]]);

  const clash = await p.put(`/budgets/${planId}`, { allocations: [{ id: rent.id, plannedAmount: 1 }, { id: travel.id, name: 'Rent' }] });
  assert.equal(clash.status, 409);
  const stranger = await p.put(`/budgets/${planId}`, { allocations: [{ id: rent.id, plannedAmount: 1 }, { id: '00000000-0000-4000-8000-000000000000', plannedAmount: 1 }] });
  assert.equal(stranger.status, 404);
  assert.equal((await p.get(`/budgets?${q(now)}`)).body.plan.allocations[0].plannedAmount, 3600);
});

test('a user cannot see or change another user\'s planner data', async () => {
  const victim = await createUser();
  const attacker = await createUser();
  const { p, source, salary } = await setUpSalary(victim);
  const planId = (await p.get(`/budgets?${q(now)}`)).body.plan.id;
  await addAllocations(p, planId, [{ group: 'FIXED', name: 'Rent', plannedAmount: 3500 }]);
  const [allocation] = (await p.get(`/budgets?${q(now)}`)).body.plan.allocations;
  const a = api(attacker);

  const attempts = [
    a.put(`/income-sources/${source.id}`, { expectedAmount: 1 }),
    a.patch(`/income-sources/${source.id}/active`, { active: false }),
    a.del(`/income-sources/${source.id}`),
    a.put(`/salaries/${salary.id}`, { expectedAmount: 1 }),
    a.get(`/salaries/${salary.id}/candidates`),
    a.post(`/salaries/${salary.id}/receive`, { mode: 'alreadyInBalance', receivedAmount: 1, receivedAt: iso(now) }),
    a.post(`/salaries/${salary.id}/undo`, {}),
    a.del(`/salaries/${salary.id}`),
    a.put(`/budgets/${planId}`, { note: 'x' }),
    a.post(`/budgets/${planId}/allocations`, { group: 'FIXED', name: 'X', plannedAmount: 1 }),
    a.post(`/budgets/${planId}/copy-recurring`),
    a.put(`/budgets/allocations/${allocation.id}`, { plannedAmount: 1 }),
    a.del(`/budgets/allocations/${allocation.id}`),
  ];
  for (const res of await Promise.all(attempts)) assert.equal(res.status, 404, `${res.req.method} ${res.req.path}`);

  const theirView = (await a.get(`/overview?${q(now)}`)).body;
  assert.equal(theirView.plan, null);
  assert.deepEqual(theirView.salaries, []);
  assert.deepEqual((await a.get('/income-sources')).body.incomeSources, []);
  assert.deepEqual((await a.get('/salaries/history')).body.history, []);

  const untouched = await prisma.monthlySalary.findUnique({ where: { id: salary.id } });
  assert.equal(untouched.expectedAmount.toFixed(2), '15000.00');
  assert.equal(untouched.receivedAt, null);
  assert.equal(await prisma.budgetAllocation.count({ where: { planId } }), 1);
  assert.equal(await prisma.incomeSource.count({ where: { userId: victim.id, active: true } }), 1);
});

test('planner endpoints require authentication', async () => {
  for (const url of ['/overview?year=2026&month=11', '/income-sources', '/salaries?year=2026&month=11', '/budgets?year=2026&month=11']) {
    assert.equal((await request(app).get(`/api/planner${url}`)).status, 401);
  }
});

test('invalid amounts, dates, months and pay days are rejected', async () => {
  const user = await createUser();
  const { p, salary } = await setUpSalary(user);
  const planId = (await p.get(`/budgets?${q(now)}`)).body.plan.id;
  const bad = [
    p.post('/income-sources', { name: 'S', expectedAmount: -1 }),
    p.post('/income-sources', { name: 'S', expectedAmount: '10.001' }),
    p.post('/income-sources', { name: 'S', expectedAmount: 'abc' }),
    p.post('/income-sources', { name: 'S', expectedAmount: 1, payDay: 32 }),
    p.post('/income-sources', { name: 'S', expectedAmount: 1, payDay: 0 }),
    p.post('/income-sources', { name: 'S', expectedAmount: 1, kind: 'LOTTERY' }),
    p.post('/income-sources', { name: '', expectedAmount: 1 }),
    p.post('/income-sources', { name: 'x'.repeat(51), expectedAmount: 1 }),
    p.post('/income-sources', { name: 'S', expectedAmount: 1e13 }),
    p.get('/overview?year=1999&month=1'),
    p.get('/overview?year=2026&month=13'),
    p.get('/budgets?year=2026'),
    p.post('/budgets', { year: 2026, month: 0 }),
    p.post(`/salaries/${salary.id}/receive`, { mode: 'alreadyInBalance', receivedAmount: 0, receivedAt: iso(now) }),
    p.post(`/salaries/${salary.id}/receive`, { mode: 'alreadyInBalance', receivedAmount: 100, receivedAt: 'yesterday' }),
    p.post(`/salaries/${salary.id}/receive`, { mode: 'alreadyInBalance', receivedAmount: 100 }),
    p.post(`/salaries/${salary.id}/receive`, { mode: 'link' }),
    p.post(`/salaries/${salary.id}/receive`, { mode: 'magic' }),
    p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 100, receivedAt: iso(now), paymentMethod: 'UPI' }),
    p.post(`/budgets/${planId}/allocations`, { group: 'FIXED', name: 'Rent', plannedAmount: -5 }),
    p.post(`/budgets/${planId}/allocations`, { group: 'LUXURY', name: 'Rent', plannedAmount: 5 }),
    p.post(`/budgets/${planId}/allocations`, { group: 'FIXED', name: 'Rent', plannedAmount: 5, matchCategories: 'Bills' }),
    p.post(`/budgets/${planId}/allocations`, { group: 'FIXED', name: 'Rent', plannedAmount: 5, recurring: 'yes' }),
    p.put(`/budgets/${planId}`, { allocations: [{ id: 'not-a-uuid', plannedAmount: 5 }] }),
    p.get('/salaries/history?months=100'),
    p.put('/income-sources/not-a-uuid', { name: 'x' }),
  ];
  for (const res of await Promise.all(bad)) assert.equal(res.status, 400, `${res.req.method} ${res.req.path} ${JSON.stringify(res.body)}`);
  assert.equal(await incomeCount(user), 0);
});
