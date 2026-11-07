// Account balance safety matrix for the simplified Salary Planner. Every scenario snapshots the
// six Account Summary figures plus every History, EMI, EMI payment, Lend/Borrow and Net Worth row,
// and asserts that only the two explicit recording actions change them, by exactly one transaction.
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
const before = shift(now, -2);
const iso = ({ year, month }, day = 5) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const q = ({ year, month }) => `year=${year}&month=${month}`;

const ROWS = ['cashBalance', 'upiBalance', 'creditCardBalance', 'debitCardBalance', 'netBankingBalance', 'totalBalance'];

const api = (user) => ({
  get: (url) => request(app).get(url).set(auth(user)),
  post: (url, body = {}) => request(app).post(url).set(auth(user)).send(body),
  put: (url, body = {}) => request(app).put(url).set(auth(user)).send(body),
  patch: (url, body = {}) => request(app).patch(url).set(auth(user)).send(body),
  del: (url) => request(app).delete(url).set(auth(user)),
});
const planner = (user) => {
  const a = api(user);
  return {
    get: (url) => a.get(`/api/planner${url}`),
    post: (url, body) => a.post(`/api/planner${url}`, body),
    put: (url, body) => a.put(`/api/planner${url}`, body),
    patch: (url, body) => a.patch(`/api/planner${url}`, body),
    del: (url) => a.del(`/api/planner${url}`),
  };
};

const addTx = async (user, body) => {
  const res = await api(user).post('/api/expenses', { type: 'expense', category: 'Other', accountType: 'UPI', paymentMethod: 'UPI', expenseDate: iso(now), ...body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.expense;
};

const balances = async (user) => {
  const res = await api(user).get('/api/expenses/balances');
  assert.equal(res.status, 200);
  return Object.fromEntries(ROWS.map(r => [r, res.body.balances[r]]));
};

const strip = (rows, drop = ['updatedAt']) => rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k))));

// Everything outside the planner that must never move unless the user records money.
const snapshot = async (user, { ignoreEmiLink = false } = {}) => {
  const where = { userId: user.id };
  const [bal, history, emis, payments, contacts, entries, assets, liabilities, netWorth] = await Promise.all([
    balances(user),
    prisma.expense.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.eMI.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.eMIPayment.findMany({ where: { emi: where }, orderBy: { id: 'asc' } }),
    prisma.ledgerContact.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.ledgerEntry.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.asset.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.liability.findMany({ where, orderBy: { id: 'asc' } }),
    api(user).get('/api/networth/summary').then(r => r.body),
  ]);
  return JSON.parse(JSON.stringify({
    balances: bal,
    history,
    emis,
    payments: strip(payments, ignoreEmiLink ? ['updatedAt', 'expenseId'] : ['updatedAt']),
    contacts,
    entries,
    assets,
    liabilities,
    netWorth,
  }));
};

const diffBalances = (a, b) => Object.fromEntries(ROWS.map(r => [r, Math.round((b[r] - a[r]) * 100) / 100]));
const onlyChange = (row, amount) => Object.fromEntries(ROWS.map(r => [r, r === row || r === 'totalBalance' ? amount : 0]));
const NO_CHANGE = onlyChange('none', 0);

/**
 * A user who already has money and history outside the planner: opening balances in several
 * accounts, an EMI with a tracker payment, a Lend/Borrow entry and a Net Worth asset.
 */
const seedUser = async () => {
  const user = await createUser();
  const a = api(user);
  await addTx(user, { title: 'Opening UPI', amount: 40000, type: 'income', category: 'Salary', expenseDate: iso(before, 1) });
  await addTx(user, { title: 'Opening cash', amount: 3000, type: 'income', category: 'Other', accountType: 'Cash', paymentMethod: 'Cash', expenseDate: iso(before, 1) });
  await addTx(user, { title: 'Card swipe', amount: 1200, category: 'Shopping', accountType: 'Credit Card', paymentMethod: 'Credit Card', expenseDate: iso(before, 2) });
  const emi = (await a.post('/api/emis', { title: 'Phone EMI', type: 'FIXED', totalAmount: 24000, emiAmount: 2000, totalInstallments: 12, startDate: iso(before, 1) })).body.emi;
  assert.ok(emi?.id, 'EMI created');
  const contact = (await a.post('/api/ledger/contacts', { name: 'Ravi' })).body;
  const contactId = contact.contact?.id || contact.id;
  assert.equal((await a.post(`/api/ledger/contacts/${contactId}/entries`, { type: 'LENT', amount: 1000, date: iso(before, 3) })).status, 201);
  assert.equal((await a.post('/api/networth/assets', { name: 'Gold coin', type: 'Gold', value: 8000 })).status, 201);
  return { user, emi, p: planner(user) };
};

const setUpMonth = async (p, period = now, expectedAmount = 15000) => {
  await p.post('/income-sources', { name: 'Salary', kind: 'SALARY', expectedAmount });
  const month = (await p.post('/budgets', { ...period, defaults: true })).body;
  if (!month.salaries.length) {
    // Past months are never back-filled automatically; add the earning month's record explicitly.
    await p.post('/salaries', { ...period, label: 'Salary', kind: 'SALARY', expectedAmount });
  }
  const view = (await p.get(`/overview?${q(period)}`)).body;
  return { planId: view.plan.id, salary: view.salaries[0], view };
};

// ---------------------------------------------------------------- B: planning never moves money

test('B: every planning action leaves balances, History, EMI, Lend/Borrow and Net Worth untouched', async () => {
  const { user, p } = await seedUser();
  const start = await snapshot(user);

  const { planId, salary, view } = await setUpMonth(p);
  const rent = view.plan.allocations.find(l => l.name === 'Rent');
  await p.put(`/budgets/allocations/${rent.id}`, { plannedAmount: 2600 });
  const added = (await p.post(`/budgets/${planId}/allocations`, { group: 'VARIABLE', name: 'Gym', plannedAmount: 800 })).body.allocationId;
  await p.put(`/budgets/${planId}`, { savingsPercent: 35, note: 'Tight month' });
  await p.post(`/budgets/${planId}/default-lines`);
  await p.put(`/salaries/${salary.id}`, { expectedAmount: 15500 });
  const oneOff = (await p.post('/salaries', { ...now, label: 'Allowance', kind: 'ALLOWANCE', expectedAmount: 1200 })).body.salary;
  await p.get(`/salaries/${salary.id}/candidates`);
  await p.get(`/overview?${q(now)}`);
  await p.get(`/budgets/spending?${q(now)}`);
  await p.get(`/bills?${q(now)}`);
  await p.get('/salaries/history');
  await p.del(`/budgets/allocations/${added}`);
  await p.del(`/salaries/${oneOff.id}`);
  const sourceId = (await p.get('/income-sources')).body.incomeSources[0].id;
  await p.patch(`/income-sources/${sourceId}/active`, { active: false });
  await p.patch(`/income-sources/${sourceId}/active`, { active: true });
  await p.del(`/income-sources/${sourceId}`);

  assert.deepEqual(await snapshot(user), start);
});

// ---------------------------------------------------------------- A: salary already in History

test('A: a salary already in History is linked; nothing is added and income is counted once', async () => {
  const { user, p } = await seedUser();
  const { salary } = await setUpMonth(p);
  const income = await addTx(user, { title: 'Salary credit', amount: 15000, type: 'income', category: 'Salary', expenseDate: iso(now, 1) });
  const start = await snapshot(user);

  const candidates = (await p.get(`/salaries/${salary.id}/candidates`)).body.candidates;
  assert.equal(candidates[0].id, income.id);
  const res = await p.post(`/salaries/${salary.id}/receive`, { mode: 'link', expenseId: income.id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.salary.receivedVia, 'TRANSACTION');

  assert.deepEqual(await snapshot(user), start);
  const month = (await p.get(`/overview?${q(now)}`)).body;
  assert.equal(month.position.receivedIncome, 15000);
});

test('A2: a salary in History with a different amount is offered first and Record new is refused until confirmed', async () => {
  const { user, p } = await seedUser();
  const { salary } = await setUpMonth(p);
  await addTx(user, { title: 'Bonus', amount: 900, type: 'income', category: 'Other', expenseDate: iso(now, 2) });
  const income = await addTx(user, { title: 'Salary credit', amount: 14850, type: 'income', category: 'Salary', expenseDate: iso(now, 1) });
  const start = await snapshot(user);

  const candidates = (await p.get(`/salaries/${salary.id}/candidates`)).body.candidates;
  assert.equal(candidates[0].id, income.id, 'closest amount first');
  assert.equal(candidates[0].matchesExpected, false);

  const blocked = await p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 15000, receivedAt: iso(now, 1), paymentMethod: 'UPI' });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, 'POSSIBLE_DUPLICATE');
  assert.deepEqual(blocked.body.candidates.map(c => c.id), [income.id]);
  assert.deepEqual(await snapshot(user), start);

  assert.equal((await p.post(`/salaries/${salary.id}/receive`, { mode: 'link', expenseId: income.id })).status, 200);
  assert.deepEqual(await snapshot(user), start);
});

test('A3: October salary paid on 5 November stays October income; the balance moved on 5 November', async () => {
  const { user, p } = await seedUser();
  const { salary } = await setUpMonth(p, prev);
  assert.equal(salary.month, prev.month);
  const paidLate = await addTx(user, { title: 'Salary credit', amount: 15000, type: 'income', category: 'Salary', expenseDate: iso(now, 5) });
  const start = await snapshot(user);

  const candidates = (await p.get(`/salaries/${salary.id}/candidates`)).body.candidates;
  assert.deepEqual(candidates.map(c => c.id), [paidLate.id]);
  const res = await p.post(`/salaries/${salary.id}/receive`, { mode: 'link', expenseId: paidLate.id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.salary.receivedAt.slice(0, 10), iso(now, 5));

  assert.deepEqual(await snapshot(user), start);
  const earning = (await p.get(`/overview?${q(prev)}`)).body.position;
  const paidMonth = (await p.get(`/overview?${q(now)}`)).body.position;
  assert.equal(earning.receivedIncome, 15000);
  assert.equal(paidMonth.receivedIncome, 0, 'not counted again in the month it arrived');
});

test('A3b: Record new for last month\'s salary dates the transaction on the real received day', async () => {
  const { user, p } = await seedUser();
  const { salary } = await setUpMonth(p, prev);
  const start = await snapshot(user);
  const res = await p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 15000, receivedAt: iso(now, 5), paymentMethod: 'UPI' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const created = await prisma.expense.findUnique({ where: { id: res.body.salary.expenseId } });
  assert.equal(created.expenseDate.toISOString().slice(0, 10), iso(now, 5));
  assert.deepEqual(diffBalances(start.balances, await balances(user)), onlyChange('upiBalance', 15000));
  assert.equal((await p.get(`/overview?${q(prev)}`)).body.position.receivedIncome, 15000);
  assert.equal((await p.get(`/overview?${q(now)}`)).body.position.receivedIncome, 0);
});

// ---------------------------------------------------------------- C: Record new

test('C: Record new tapped five times at once adds exactly one income to the chosen account', async () => {
  const { user, p } = await seedUser();
  const { salary } = await setUpMonth(p);
  const start = await snapshot(user);
  const results = await Promise.all(Array.from({ length: 5 }, () =>
    p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 15000, receivedAt: iso(now, 1), paymentMethod: 'UPI' })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409, 409, 409, 409]);
  assert.equal(await prisma.expense.count({ where: { userId: user.id } }), start.history.length + 1);
  assert.deepEqual(diffBalances(start.balances, await balances(user)), onlyChange('upiBalance', 15000));
});

test('C2: Record new without a chosen account is refused and changes nothing', async () => {
  const { user, p } = await seedUser();
  const { salary } = await setUpMonth(p);
  const start = await snapshot(user);
  const res = await p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 15000, receivedAt: iso(now, 1) });
  assert.equal(res.status, 400);
  assert.deepEqual(await snapshot(user), start);
  const noMode = await p.post(`/salaries/${salary.id}/receive`, { receivedAmount: 15000, receivedAt: iso(now, 1), paymentMethod: 'UPI' });
  assert.equal(noMode.status, 400, 'there is no default mode');
  assert.deepEqual(await snapshot(user), start);
});

test('C3: Undo keeps the money unless the user explicitly deletes the transaction', async () => {
  const { user, p } = await seedUser();
  const { salary } = await setUpMonth(p);
  const start = await snapshot(user);
  await p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 15000, receivedAt: iso(now, 1), paymentMethod: 'Cash' });
  const recorded = await snapshot(user);
  assert.deepEqual(diffBalances(start.balances, recorded.balances), onlyChange('cashBalance', 15000));

  await p.post(`/salaries/${salary.id}/undo`, {});
  assert.deepEqual(await snapshot(user), recorded);

  await p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 15000, receivedAt: iso(now, 1), paymentMethod: 'Cash', confirmDuplicate: true });
  const twice = await snapshot(user);
  assert.deepEqual(diffBalances(recorded.balances, twice.balances), onlyChange('cashBalance', 15000), 'a confirmed second income is the user\'s explicit choice');
  await p.post(`/salaries/${salary.id}/undo`, { deleteTransaction: true });
  assert.deepEqual(diffBalances(twice.balances, await balances(user)), onlyChange('cashBalance', -15000));
});

// ---------------------------------------------------------------- D: Already in my balance

test('D: Already in my balance counts as received income with no transaction', async () => {
  const { user, p } = await seedUser();
  const { salary } = await setUpMonth(p);
  const start = await snapshot(user);

  const results = await Promise.all(Array.from({ length: 3 }, () =>
    p.post(`/salaries/${salary.id}/receive`, { mode: 'alreadyInBalance', receivedAmount: 15000, receivedAt: iso(now, 1) })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409, 409]);
  const received = results.find(r => r.status === 200).body.salary;
  assert.equal(received.status, 'RECEIVED');
  assert.equal(received.receivedVia, 'ALREADY_IN_BALANCE');
  assert.equal(received.expenseId, null);
  assert.deepEqual(await snapshot(user), start);

  const month = (await p.get(`/overview?${q(now)}`)).body;
  assert.equal(month.position.expectedIncome, 15000);
  assert.equal(month.position.receivedIncome, 15000);

  await p.post(`/salaries/${salary.id}/undo`, { deleteTransaction: true });
  assert.deepEqual(await snapshot(user), start, 'undo has no transaction to delete');
  assert.equal((await p.get(`/overview?${q(now)}`)).body.salaries[0].status, 'PENDING');
});

// ---------------------------------------------------------------- E: EMI counted once

test('E: an EMI paid in the tracker and also added in History counts once only after the user links them', async () => {
  const { user, emi, p } = await seedUser();
  await setUpMonth(p);
  assert.equal((await api(user).patch(`/api/emis/${emi.id}/pay`, { paidAt: iso(now, 3) })).status, 200);
  const historyEmi = await addTx(user, { title: 'Phone EMI', amount: 2000, category: 'Bills', expenseDate: iso(now, 3) });
  const unrelated = await addTx(user, { title: 'Headphones', amount: 2000, category: 'Shopping', expenseDate: iso(now, 15) });
  const start = await snapshot(user, { ignoreEmiLink: true });

  let month = (await p.get(`/overview?${q(now)}`)).body;
  const payment = month.emi.payments[0];
  assert.equal(month.position.actualExpenses, 6000, 'nothing is excluded before the user links');
  assert.deepEqual(payment.possibleDuplicates.map(d => d.id), [historyEmi.id], 'a hint only; the unrelated expense is not suggested');

  const candidates = (await p.get(`/emi-payments/${payment.id}/candidates`)).body.candidates;
  assert.equal(candidates[0].id, historyEmi.id);

  month = (await p.put(`/emi-payments/${payment.id}/link`, { expenseId: historyEmi.id })).body;
  assert.equal(month.position.actualExpenses, 4000);
  assert.equal(month.emi.payments[0].linkedTransaction.id, historyEmi.id);
  assert.ok(month.spending.some(s => s.id === unrelated.id), 'the unrelated expense still counts');
  assert.deepEqual(await snapshot(user, { ignoreEmiLink: true }), start, 'linking changes no money, EMI or History row');

  month = (await p.del(`/emi-payments/${payment.id}/link`)).body;
  assert.equal(month.position.actualExpenses, 6000);
  assert.deepEqual(await snapshot(user, { ignoreEmiLink: true }), start);
});

test('E2: an EMI link is refused for a different amount, income, or a transaction already linked', async () => {
  const { user, emi, p } = await seedUser();
  await setUpMonth(p);
  await api(user).patch(`/api/emis/${emi.id}/pay`, { paidAt: iso(now, 3) });
  await api(user).patch(`/api/emis/${emi.id}/pay`, { paidAt: iso(now, 4) });
  const [second, first] = (await p.get(`/overview?${q(now)}`)).body.emi.payments;
  const wrongAmount = await addTx(user, { title: 'Phone EMI', amount: 2100, expenseDate: iso(now, 3) });
  const income = await addTx(user, { title: 'Refund', amount: 2000, type: 'income', expenseDate: iso(now, 3) });
  const farAway = await addTx(user, { title: 'Phone EMI', amount: 2000, expenseDate: iso(before, 1) });
  const right = await addTx(user, { title: 'Phone EMI', amount: 2000, expenseDate: iso(now, 3) });
  const start = await snapshot(user);

  for (const [expenseId, code] of [[wrongAmount.id, 'AMOUNT_MISMATCH'], [income.id, 'NOT_SPENDING'], [farAway.id, 'TOO_FAR_APART']]) {
    const res = await p.put(`/emi-payments/${first.id}/link`, { expenseId });
    assert.equal(res.status, 400, code);
    assert.equal(res.body.code, code);
  }
  assert.equal((await p.put(`/emi-payments/${first.id}/link`, { expenseId: right.id })).status, 200);
  const taken = await p.put(`/emi-payments/${second.id}/link`, { expenseId: right.id });
  assert.equal(taken.status, 409);
  assert.deepEqual(diffBalances(start.balances, await balances(user)), NO_CHANGE);
});

test('E3: editing a linked expense so it is no longer that payment removes the link, so it counts again', async () => {
  const { user, emi, p } = await seedUser();
  await setUpMonth(p);
  await api(user).patch(`/api/emis/${emi.id}/pay`, { paidAt: iso(now, 3) });
  const historyEmi = await addTx(user, { title: 'Phone EMI', amount: 2000, expenseDate: iso(now, 3) });
  const payment = (await p.get(`/overview?${q(now)}`)).body.emi.payments[0];
  await p.put(`/emi-payments/${payment.id}/link`, { expenseId: historyEmi.id });
  assert.equal((await api(user).put(`/api/expenses/${historyEmi.id}`, { amount: 2500 })).status, 200);
  assert.equal((await prisma.eMIPayment.findUnique({ where: { id: payment.id } })).expenseId, null);
  const month = (await p.get(`/overview?${q(now)}`)).body;
  assert.equal(month.position.actualExpenses, 4500);

  // Deleting a linked expense leaves the EMI payment itself in place.
  const again = await addTx(user, { title: 'Phone EMI', amount: 2000, expenseDate: iso(now, 3) });
  await p.put(`/emi-payments/${payment.id}/link`, { expenseId: again.id });
  await api(user).del(`/api/expenses/${again.id}`);
  const kept = await prisma.eMIPayment.findUnique({ where: { id: payment.id } });
  assert.equal(kept.expenseId, null);
  assert.equal(kept.amount, 2000);
});

// ---------------------------------------------------------------- F: separate expenses, one record each

test('F: salary and mess on the same day stay two transactions; recording a line adds exactly one', async () => {
  const { user, p } = await seedUser();
  const { salary, view } = await setUpMonth(p);
  const mess = view.plan.allocations.find(l => l.name === 'Mess / Food');
  const start = await snapshot(user);

  await p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 15000, receivedAt: iso(now, 1), paymentMethod: 'UPI' });
  const record = () => p.post(`/budgets/allocations/${mess.id}/record`, { amount: 2500, date: iso(now, 1), paymentMethod: 'UPI' });
  const results = await Promise.all([record(), record(), record()]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 200, 201]);
  assert.equal(new Set(results.map(r => r.body.expenseId)).size, 1, 'repeats return the one transaction');

  assert.equal(await prisma.expense.count({ where: { userId: user.id } }), start.history.length + 2);
  assert.deepEqual(diffBalances(start.balances, await balances(user)), onlyChange('upiBalance', 12500));
  const month = (await p.get(`/overview?${q(now)}`)).body;
  assert.equal(month.plan.allocations.find(l => l.id === mess.id).actualAmount, 2500);
  assert.equal(month.position.actualExpenses, 2500);
});

test('F2: an EMI line cannot record spending, and recording needs an account and a date in the month', async () => {
  const { user, p } = await seedUser();
  const { view } = await setUpMonth(p);
  const emiLine = view.plan.allocations.find(l => l.name === 'EMI');
  const travel = view.plan.allocations.find(l => l.name === 'Travel');
  const start = await snapshot(user);
  assert.equal((await p.post(`/budgets/allocations/${emiLine.id}/record`, { amount: 2000, date: iso(now, 3), paymentMethod: 'UPI' })).body.code, 'EMI_LINE');
  assert.equal((await p.post(`/budgets/allocations/${travel.id}/record`, { amount: 200, date: iso(now, 3) })).status, 400);
  assert.equal((await p.post(`/budgets/allocations/${travel.id}/record`, { amount: 200, date: iso(prev, 3), paymentMethod: 'UPI' })).status, 400);
  assert.deepEqual(await snapshot(user), start);
});

// ---------------------------------------------------------------- G: savings suggestion is arithmetic

test('G: planned and actual positions and the savings suggestion are calculated, never recorded', async () => {
  const { user, emi, p } = await seedUser();
  const { planId, salary, view } = await setUpMonth(p);
  const lines = Object.fromEntries(view.plan.allocations.map(l => [l.name, l]));
  assert.deepEqual(Object.keys(lines), ['Rent', 'EMI', 'Mess / Food', 'Travel', 'Other Personal']);
  assert.equal(lines.Rent.plannedAmount, 2500);
  assert.equal(lines.EMI.plannedAmount, 2000, 'from the active EMI');
  await p.put(`/budgets/allocations/${lines['Mess / Food'].id}`, { plannedAmount: 3000 });
  await p.put(`/budgets/allocations/${lines.Travel.id}`, { plannedAmount: 500 });

  await p.post(`/salaries/${salary.id}/receive`, { mode: 'alreadyInBalance', receivedAmount: 14000, receivedAt: iso(now, 1) });
  await addTx(user, { title: 'Rent', amount: 2500, category: 'Bills', expenseDate: iso(now, 2) });
  await api(user).patch(`/api/emis/${emi.id}/pay`, { paidAt: iso(now, 3) });
  const start = await snapshot(user);

  let { position } = (await p.get(`/overview?${q(now)}`)).body;
  assert.deepEqual(position, {
    expectedIncome: 15000,
    receivedIncome: 14000,
    plannedExpenses: 8000,
    actualExpenses: 4500,
    investedNet: 0,
    plannedRemaining: 7000,
    actualRemaining: 9500,
    suggestedSavings: 1400,
    actualSavingsPotential: 1900,
    savingsPercent: 20,
  });

  position = (await p.put(`/budgets/${planId}`, { savingsPercent: 30 })).body.position;
  assert.equal(position.suggestedSavings, 2100);
  assert.equal(position.actualSavingsPotential, 2850);

  await p.put(`/budgets/allocations/${lines.Rent.id}`, { plannedAmount: 20000 });
  position = (await p.get(`/overview?${q(now)}`)).body.position;
  assert.equal(position.plannedRemaining, -10500);
  assert.equal(position.suggestedSavings, 0, 'never negative');

  assert.deepEqual(await snapshot(user), start);
  assert.equal((await p.put(`/budgets/${planId}`, { savingsPercent: 101 })).status, 400);
});

test('H: default lines are added only when asked, and never duplicate a line the user already has', async () => {
  const { user, p } = await seedUser();
  await p.post('/income-sources', { name: 'Salary', kind: 'SALARY', expectedAmount: 15000 });
  const plain = (await p.post('/budgets', now)).body;
  assert.equal(plain.plan.allocations.length, 0, 'existing API callers are unchanged');
  await p.post(`/budgets/${plain.plan.id}/allocations`, { group: 'FIXED', name: 'Rent / Accommodation', plannedAmount: 4000 });
  await p.post(`/budgets/${plain.plan.id}/allocations`, { group: 'FIXED', name: 'EMI / Loan', plannedAmount: 2000, matchCategories: ['EMI'] });
  const start = await snapshot(user);
  const res = await p.post(`/budgets/${plain.plan.id}/default-lines`);
  assert.equal(res.body.added, 3);
  assert.deepEqual(res.body.plan.allocations.map(l => l.name), ['Rent / Accommodation', 'EMI / Loan', 'Mess / Food', 'Travel', 'Other Personal']);
  assert.equal((await p.post(`/budgets/${plain.plan.id}/default-lines`)).body.added, 0);
  assert.deepEqual(await snapshot(user), start);
});

test('isolation: another user cannot link, record or read EMI candidates on someone else\'s data', async () => {
  const { user, emi, p } = await seedUser();
  const { view } = await setUpMonth(p);
  await api(user).patch(`/api/emis/${emi.id}/pay`, { paidAt: iso(now, 3) });
  const payment = (await p.get(`/overview?${q(now)}`)).body.emi.payments[0];
  const mine = await addTx(user, { title: 'Phone EMI', amount: 2000, expenseDate: iso(now, 3) });
  const other = await createUser();
  const o = planner(other);
  const theirs = await addTx(other, { title: 'Phone EMI', amount: 2000, expenseDate: iso(now, 3) });
  const start = await snapshot(user);

  assert.equal((await o.get(`/emi-payments/${payment.id}/candidates`)).status, 404);
  assert.equal((await o.put(`/emi-payments/${payment.id}/link`, { expenseId: theirs.id })).status, 404);
  assert.equal((await p.put(`/emi-payments/${payment.id}/link`, { expenseId: theirs.id })).status, 404);
  assert.equal((await o.post(`/budgets/allocations/${view.plan.allocations[0].id}/record`, { amount: 10, date: iso(now, 3), paymentMethod: 'UPI' })).status, 404);
  assert.equal((await o.del(`/emi-payments/${payment.id}/link`)).status, 404);
  assert.deepEqual(await snapshot(user), start);
  assert.ok(mine.id);
});

// ---------------------------------------------------------------- R: planner reset

const populatePlanner = async (user, emi, p) => {
  const { planId, salary, view } = await setUpMonth(p);
  await p.put(`/budgets/allocations/${view.plan.allocations[0].id}`, { plannedAmount: 4000 });
  await p.post(`/budgets/${planId}/allocations`, { group: 'VARIABLE', name: 'Gym', plannedAmount: 800 });
  await p.put(`/budgets/${planId}`, { savingsPercent: 35 });
  await p.post('/salaries', { ...now, label: 'Bonus', kind: 'BONUS', expectedAmount: 2000 });
  await p.post(`/salaries/${salary.id}/receive`, { mode: 'create', receivedAmount: 15000, receivedAt: iso(now, 1), paymentMethod: 'UPI' });
  const mess = view.plan.allocations.find(l => l.name === 'Mess / Food');
  await p.post(`/budgets/allocations/${mess.id}/record`, { amount: 2500, date: iso(now, 2), paymentMethod: 'Cash' });
  await api(user).patch(`/api/emis/${emi.id}/pay`, { paidAt: iso(now, 3) });
  const historyEmi = await addTx(user, { title: 'Phone EMI', amount: 2000, expenseDate: iso(now, 3) });
  const payment = (await p.get(`/overview?${q(now)}`)).body.emi.payments[0];
  await p.put(`/emi-payments/${payment.id}/link`, { expenseId: historyEmi.id });
  return { planId };
};

test('R1: resetting this month restores defaults and pending salary; money, History, EMI and Lend/Borrow are untouched', async () => {
  const { user, emi, p } = await seedUser();
  await populatePlanner(user, emi, p);
  const prevPlan = (await p.post('/budgets', { ...prev, defaults: true })).body.plan;
  await p.put(`/budgets/allocations/${prevPlan.allocations[0].id}`, { plannedAmount: 9999 });
  const start = await snapshot(user, { ignoreEmiLink: true });

  const res = await p.post('/reset', { scope: 'month', ...now });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(await snapshot(user, { ignoreEmiLink: true }), start, 'no transaction, balance, EMI, Lend/Borrow or Net Worth change');

  const month = res.body;
  assert.deepEqual(month.plan.allocations.map(l => [l.name, l.plannedAmount]), [['Rent', 2500], ['EMI', 2000], ['Mess / Food', 0], ['Travel', 0], ['Other Personal', 0]]);
  assert.equal(month.position.savingsPercent, 20);
  assert.deepEqual(month.salaries.map(s => [s.label, s.status]), [['Salary', 'PENDING']]);
  assert.equal(month.emi.payments[0].linkedTransaction, null);
  assert.equal(await prisma.allocationAssignment.count(), 0);
  // The recorded salary and mess expense are still real transactions, now counted as other income / spending.
  assert.equal(month.position.receivedIncome, 15000);
  assert.equal(month.position.actualExpenses, 6500);

  const other = (await p.get(`/overview?${q(prev)}`)).body;
  assert.equal(other.plan.allocations[0].plannedAmount, 9999, 'other months are untouched');
  assert.equal((await p.get('/income-sources')).body.incomeSources.length, 1, 'sources are kept');
});

test('R2: resetting the whole planner clears all planner data only, and needs the confirmation word', async () => {
  const { user, emi, p } = await seedUser();
  await populatePlanner(user, emi, p);
  await p.post('/budgets', { ...prev, defaults: true });
  const bystander = await seedUser();
  await setUpMonth(bystander.p);
  const start = await snapshot(user, { ignoreEmiLink: true });
  const theirs = await snapshot(bystander.user);
  const theirPlans = await prisma.budgetPlan.count({ where: { userId: bystander.user.id } });

  assert.equal((await p.post('/reset', { scope: 'all' })).status, 400);
  assert.equal((await p.post('/reset', { scope: 'all', confirm: 'reset please' })).status, 400);
  assert.equal(await prisma.budgetPlan.count({ where: { userId: user.id } }), 2, 'nothing cleared without confirmation');

  const res = await p.post('/reset', { scope: 'all', confirm: 'RESET' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.cleared, { plans: 2, salaries: 2, sources: 1, emiLinks: 1 });
  assert.deepEqual(await snapshot(user, { ignoreEmiLink: true }), start, 'no transaction, balance, EMI, Lend/Borrow or Net Worth change');
  for (const model of ['budgetPlan', 'monthlySalary', 'incomeSource']) {
    assert.equal(await prisma[model].count({ where: { userId: user.id } }), 0, model);
  }
  assert.equal(await prisma.eMIPayment.count({ where: { emi: { userId: user.id }, expenseId: { not: null } } }), 0);

  assert.deepEqual(await snapshot(bystander.user), theirs, 'another user is untouched');
  assert.equal(await prisma.budgetPlan.count({ where: { userId: bystander.user.id } }), theirPlans);

  const fresh = (await p.post('/budgets', { ...now, defaults: true })).body;
  assert.equal(fresh.plan.allocations[0].plannedAmount, 2500, 'starts again from the defaults');
});

test('R3: reset validates its input and never resets on a bad request', async () => {
  const { user, p } = await seedUser();
  await setUpMonth(p);
  const start = await snapshot(user);
  for (const bad of [{}, { scope: 'everything' }, { scope: 'month' }, { scope: 'month', year: now.year, month: 13 }]) {
    assert.equal((await p.post('/reset', bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await p.get(`/overview?${q(now)}`)).body.plan.allocations.length, 5);
  assert.deepEqual(await snapshot(user), start);
});
