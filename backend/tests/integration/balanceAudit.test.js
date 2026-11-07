// Full account-balance audit. One user goes through every feature of the app in order. After each
// step the five account rows and the Total are compared with an expected ledger kept by hand in
// this file, so the expected figures never come from the code under test. Total is also
// recomputed straight from the database (income − expense; transfers net to zero).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, prisma, resetDb, createUser, auth } = require('../helpers/setup');
const { currentPeriod } = require('../../services/plannerService');
const { processRecurring } = require('../../services/cronJob');

const now = currentPeriod();
const shift = ({ year, month }, by) => {
  const i = year * 12 + (month - 1) + by;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
};
const prev = shift(now, -1);
const iso = ({ year, month }, day = 5) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const q = ({ year, month }) => `year=${year}&month=${month}`;

const ROW_OF = { Cash: 'cashBalance', UPI: 'upiBalance', 'Credit Card': 'creditCardBalance', 'Debit Card': 'debitCardBalance', Other: 'netBankingBalance' };
const paise = (n) => Math.round(n * 100);

let user;
let a;
const expected = { Cash: 0, UPI: 0, 'Credit Card': 0, 'Debit Card': 0, Other: 0 };
const move = (row, rupees) => { expected[row] += paise(rupees); };
const log = [];

const call = (method, url, body) => {
  const r = request(app)[method](url).set(auth(user));
  return body === undefined ? r : r.send(body);
};
const ok = async (promise, status = [200, 201]) => {
  const res = await promise;
  assert.ok([].concat(status).includes(res.status), `${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};
const addTx = (body) => ok(call('post', '/api/expenses', { category: 'Other', expenseDate: iso(now), ...body })).then(b => b.expense);

// Compares every row and the Total with the hand-kept ledger, then recomputes Total from raw rows.
const audit = async (step) => {
  const { balances } = await ok(call('get', '/api/expenses/balances'));
  const actualRows = Object.fromEntries(Object.entries(ROW_OF).map(([name, key]) => [name, paise(balances[key])]));
  assert.deepEqual(actualRows, { ...expected }, `${step}: account rows`);
  const total = Object.values(expected).reduce((s, v) => s + v, 0);
  assert.equal(paise(balances.totalBalance), total, `${step}: Total equals the sum of the rows`);
  const rows = await prisma.expense.findMany({ where: { userId: user.id }, select: { type: true, amount: true } });
  const fromDb = rows.reduce((s, r) => s + (r.type === 'income' ? paise(r.amount) : r.type === 'expense' ? -paise(r.amount) : 0), 0);
  assert.equal(fromDb, total, `${step}: Total recomputed from every transaction`);
  log.push({ step, total: total / 100, transactions: rows.length });
};

before(async () => {
  await resetDb();
  user = await createUser();
  a = (url) => `/api/planner${url}`;
});
after(async () => {
  console.log('\nBalance audit trail');
  console.table(log);
  await prisma.$disconnect();
});

test('1. opening balances in every account', async () => {
  await audit('empty account');
  await addTx({ title: 'Opening UPI', amount: 40000, type: 'income', category: 'Salary', accountType: 'UPI', paymentMethod: 'UPI', expenseDate: iso(prev, 1) });
  move('UPI', 40000);
  await addTx({ title: 'Opening cash', amount: 5000, type: 'income', accountType: 'Cash', paymentMethod: 'Cash', expenseDate: iso(prev, 1) });
  move('Cash', 5000);
  await addTx({ title: 'Opening bank', amount: 10000, type: 'income', accountType: 'Net Banking', paymentMethod: 'Net Banking', expenseDate: iso(prev, 1) });
  move('Other', 10000);
  await addTx({ title: 'Opening debit', amount: 2000, type: 'income', accountType: 'Debit Card', paymentMethod: 'Debit Card', expenseDate: iso(prev, 1) });
  move('Debit Card', 2000);
  await audit('opening balances');
});

test('2. History expenses in each account, with paise that must not drift', async () => {
  await addTx({ title: 'Shoes', amount: 1200, type: 'expense', category: 'Shopping', accountType: 'Credit Card', paymentMethod: 'Credit Card' });
  move('Credit Card', -1200);
  await addTx({ title: 'Lunch', amount: 300.1, type: 'expense', category: 'Food', accountType: 'UPI', paymentMethod: 'UPI' });
  move('UPI', -300.1);
  await addTx({ title: 'Snack', amount: 0.2, type: 'expense', category: 'Food', accountType: 'UPI', paymentMethod: 'UPI' });
  move('UPI', -0.2);
  await addTx({ title: 'Bus', amount: 200, type: 'expense', category: 'Travel', accountType: 'Cash', paymentMethod: 'Cash' });
  move('Cash', -200);
  await addTx({ title: 'Gift', amount: 100, type: 'expense', category: 'Other', accountType: 'UPI', paymentMethod: 'Other' });
  move('Other', -100);
  await audit('expenses in every account');
});

test('3. a transfer moves money between rows and leaves Total unchanged', async () => {
  await addTx({ title: 'ATM', amount: 1000, type: 'transfer', fromAccountType: 'Bank', toAccountType: 'Cash' });
  move('UPI', -1000);
  move('Cash', 1000);
  await audit('transfer UPI → Cash');
});

test('4. EMIs: creating, paying, deleting a payment and flexible loans never change balances', async () => {
  const fixed = (await ok(call('post', '/api/emis', { title: 'Phone EMI', type: 'FIXED', totalAmount: 24000, emiAmount: 2000, totalInstallments: 12, startDate: iso(prev, 1) }))).emi;
  await ok(call('patch', `/api/emis/${fixed.id}/pay`, { paidAt: iso(now, 3) }));
  const second = (await ok(call('patch', `/api/emis/${fixed.id}/pay`, { paidAt: iso(now, 4) }))).emi;
  assert.ok(second);
  const payments = await prisma.eMIPayment.findMany({ where: { emiId: fixed.id }, orderBy: { paidAt: 'asc' } });
  await ok(call('delete', `/api/emis/payments/${payments[1].id}`));
  const flexible = (await ok(call('post', '/api/emis', { title: 'Bike loan', type: 'FLEXIBLE', totalAmount: 50000, interestRate: 10, startDate: iso(prev, 1) }))).emi;
  await ok(call('patch', `/api/emis/${flexible.id}/pay`, { amount: 3000, paidAt: iso(now, 2) }));
  await ok(call('put', `/api/emis/${fixed.id}`, { title: 'Phone EMI', type: 'FIXED', totalAmount: 24000, emiAmount: 2000, totalInstallments: 12, startDate: iso(prev, 1), note: 'edited' }));
  await audit('EMI tracker activity');
});

test('5. recurring: the template counts once, the scheduler adds each due copy exactly once', async () => {
  const start = await prisma.expense.count({ where: { userId: user.id } });
  const template = await addTx({ title: 'Netflix', amount: 649, type: 'expense', category: 'Entertainment', accountType: 'UPI', paymentMethod: 'UPI', recurring: true, recurringType: 'monthly', expenseDate: iso(shift(now, -2), 1) });
  move('UPI', -649);
  await audit('recurring template added');

  const first = await processRecurring();
  const copies = await prisma.expense.count({ where: { userId: user.id, isAutoCreated: true } });
  assert.equal(copies, first.created);
  assert.ok(copies >= 1, 'at least one month was due');
  move('UPI', -649 * copies);
  await audit(`scheduler created ${copies} cop${copies === 1 ? 'y' : 'ies'}`);

  const again = await processRecurring();
  assert.equal(again.created, 0, 'running the scheduler twice adds nothing');
  await audit('scheduler re-run');

  // Editing the template changes only the template, and never re-creates past copies.
  await ok(call('put', `/api/expenses/${template.id}`, { amount: 699 }));
  move('UPI', -50);
  assert.equal((await processRecurring()).created, 0);
  await audit('recurring template edited');

  const child = await prisma.expense.findFirst({ where: { userId: user.id, isAutoCreated: true } });
  await ok(call('delete', `/api/expenses/${child.id}`));
  move('UPI', 649);
  await audit('one recurring copy deleted');

  await ok(call('put', `/api/expenses/${template.id}`, { recurring: false }));
  assert.equal((await processRecurring()).created, 0);
  await audit('recurring stopped');
  assert.equal(await prisma.expense.count({ where: { userId: user.id } }), start + 1 + copies - 1);
});

test('6. Lend/Borrow, Net Worth items and category budgets never change balances', async () => {
  const contact = await ok(call('post', '/api/ledger/contacts', { name: 'Ravi' }));
  const contactId = contact.contact?.id || contact.id;
  for (const [type, amount] of [['LENT', 1000], ['BORROWED', 500], ['REPAYMENT_RECEIVED', 400], ['REPAYMENT_MADE', 200]]) {
    await ok(call('post', `/api/ledger/contacts/${contactId}/entries`, { type, amount, date: iso(now, 2) }));
  }
  await ok(call('post', '/api/networth/assets', { name: 'Gold coin', type: 'Gold', value: 8000 }));
  await ok(call('post', '/api/networth/liabilities', { name: 'Credit card bill', type: 'Credit Card', value: 1200 }));
  await ok(call('post', '/api/budgets', { category: 'Food', monthlyLimit: 4000 }));
  await audit('Lend/Borrow, Net Worth, budgets');
});

test('7. Salary Planner: planning, linking and "already in balance" change nothing; recording changes exactly one row', async () => {
  await ok(call('post', a('/income-sources'), { name: 'Salary', kind: 'SALARY', expectedAmount: 15000 }));
  const month = await ok(call('post', a('/budgets'), { ...now, defaults: true }));
  const salary = month.salaries[0];
  const lines = Object.fromEntries(month.plan.allocations.map(l => [l.name, l]));
  await ok(call('put', a(`/budgets/allocations/${lines.Rent.id}`), { plannedAmount: 3000 }));
  await ok(call('put', a(`/budgets/${month.plan.id}`), { savingsPercent: 30 }));
  await ok(call('post', a(`/budgets/${month.plan.id}/default-lines`)));
  await audit('planner set up and edited');

  // The salary is already in History with a slightly different amount: linking it adds nothing.
  const inHistory = await addTx({ title: 'Salary credit', amount: 14850, type: 'income', category: 'Salary', accountType: 'UPI', paymentMethod: 'UPI', expenseDate: iso(now, 1) });
  move('UPI', 14850);
  await audit('salary entered in History');
  const refused = await call('post', a(`/salaries/${salary.id}/receive`), { mode: 'create', receivedAmount: 15000, receivedAt: iso(now, 1), paymentMethod: 'UPI' });
  assert.equal(refused.body.code, 'POSSIBLE_DUPLICATE');
  await audit('duplicate Record new refused');
  await ok(call('post', a(`/salaries/${salary.id}/receive`), { mode: 'link', expenseId: inHistory.id }));
  await audit('salary linked');

  // A one-off allowance already reflected in the balance: no transaction.
  const allowance = (await ok(call('post', a('/salaries'), { ...now, label: 'Allowance', kind: 'ALLOWANCE', expectedAmount: 1500 }))).salary;
  await ok(call('post', a(`/salaries/${allowance.id}/receive`), { mode: 'alreadyInBalance', receivedAmount: 1500, receivedAt: iso(now, 2) }));
  await audit('allowance marked already in balance');

  // A bonus recorded new into Cash, tapped three times at once.
  const bonus = (await ok(call('post', a('/salaries'), { ...now, label: 'Bonus', kind: 'BONUS', expectedAmount: 2500.5 }))).salary;
  const taps = await Promise.all([1, 2, 3].map(() => call('post', a(`/salaries/${bonus.id}/receive`), { mode: 'create', receivedAmount: 2500.5, receivedAt: iso(now, 3), paymentMethod: 'Cash' })));
  assert.deepEqual(taps.map(t => t.status).sort(), [200, 409, 409]);
  move('Cash', 2500.5);
  await audit('bonus recorded once into Cash');

  // Recording a planned expense, also tapped three times.
  const record = () => call('post', a(`/budgets/allocations/${lines['Mess / Food'].id}/record`), { amount: 2500, date: iso(now, 4), paymentMethod: 'Debit Card' });
  await Promise.all([record(), record(), record()]);
  move('Debit Card', -2500);
  await audit('mess recorded once from Debit Card');

  // EMI paid in the tracker and also added in History, then linked: History counts it once, the link changes nothing.
  const emi = await prisma.eMI.findFirst({ where: { userId: user.id, title: 'Phone EMI' } });
  await ok(call('patch', `/api/emis/${emi.id}/pay`, { paidAt: iso(now, 6) }));
  const emiInHistory = await addTx({ title: 'Phone EMI', amount: 2000, type: 'expense', category: 'Bills', accountType: 'UPI', paymentMethod: 'UPI', expenseDate: iso(now, 6) });
  move('UPI', -2000);
  const payment = (await ok(call('get', a(`/overview?${q(now)}`)))).emi.payments.find(p => p.paidAt.startsWith(iso(now, 6)));
  await ok(call('put', a(`/emi-payments/${payment.id}/link`), { expenseId: emiInHistory.id }));
  await audit('EMI paid, added in History and linked');

  // Undo: without deleting keeps the money; with delete removes exactly the bonus.
  await ok(call('post', a(`/salaries/${allowance.id}/undo`), { deleteTransaction: true }));
  await audit('undo "already in balance" (nothing to delete)');
  await ok(call('post', a(`/salaries/${salary.id}/undo`), {}));
  await audit('undo linked salary, transaction kept');
  await ok(call('post', a(`/salaries/${bonus.id}/undo`), { deleteTransaction: true }));
  move('Cash', -2500.5);
  await audit('undo bonus with delete');

  // Last month's salary paid this month.
  await ok(call('post', a('/salaries'), { ...prev, label: 'Last month salary', kind: 'SALARY', expectedAmount: 15000 }));
  const late = (await ok(call('get', a(`/overview?${q(prev)}`)))).salaries.find(s => s.label === 'Last month salary');
  await ok(call('post', a(`/salaries/${late.id}/receive`), { mode: 'create', receivedAmount: 15000, receivedAt: iso(now, 5), paymentMethod: 'Net Banking', confirmDuplicate: true }));
  move('Other', 15000);
  await audit('last month salary received this month into Net Banking');
});

test('8. planner reset (this month, then everything) never changes a balance', async () => {
  await ok(call('post', a('/reset'), { scope: 'month', ...now }));
  await audit('planner month reset');
  await ok(call('post', a('/reset'), { scope: 'all', confirm: 'RESET' }));
  await audit('whole planner reset');
  assert.equal(await prisma.budgetPlan.count({ where: { userId: user.id } }), 0);
});

test('9. History edits and deletes move exactly the amounts changed', async () => {
  const lunch = await prisma.expense.findFirst({ where: { userId: user.id, title: 'Lunch' } });
  await ok(call('put', `/api/expenses/${lunch.id}`, { amount: 350.1 }));
  move('UPI', -50);
  await audit('expense amount edited');
  await ok(call('put', `/api/expenses/${lunch.id}`, { accountType: 'Cash', paymentMethod: 'Cash' }));
  move('UPI', 350.1);
  move('Cash', -350.1);
  await audit('expense moved to Cash');
  await ok(call('put', `/api/expenses/${lunch.id}`, { type: 'income' }));
  move('Cash', 700.2);
  await audit('expense changed to income');
  await ok(call('delete', `/api/expenses/${lunch.id}`));
  move('Cash', -350.1);
  await audit('transaction deleted');
});

test('10. another user\'s activity never reaches this account', async () => {
  const before = await ok(call('get', '/api/expenses/balances'));
  const other = await createUser();
  await request(app).post('/api/expenses').set(auth(other)).send({ title: 'Theirs', amount: 99999, type: 'income', category: 'Salary', accountType: 'UPI', paymentMethod: 'UPI', expenseDate: iso(now) });
  await request(app).post('/api/planner/reset').set(auth(other)).send({ scope: 'all', confirm: 'RESET' });
  assert.deepEqual(await ok(call('get', '/api/expenses/balances')), before);
  await audit('after another user\'s activity');
});
