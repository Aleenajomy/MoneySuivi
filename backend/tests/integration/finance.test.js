const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, prisma, resetDb, createUser, auth, sentMail } = require('../helpers/setup');
const { processRecurring } = require('../../services/cronJob');

beforeEach(resetDb);
after(() => prisma.$disconnect());

const tx = (user, body) => request(app).post('/api/expenses').set(auth(user)).send({ category: 'Other', expenseDate: '2026-10-01', ...body });
const balances = async (user) => (await request(app).get('/api/expenses/balances').set(auth(user))).body.balances;

test('balances across Cash, Bank, UPI and Card, with a transfer, are exact', async () => {
  const user = await createUser();
  await tx(user, { title: 'Salary', amount: 50000, type: 'income', accountType: 'Bank', paymentMethod: 'Net Banking' });
  await tx(user, { title: 'ATM', amount: 5000, type: 'transfer', accountType: 'Bank', paymentMethod: 'Bank', fromAccountType: 'Bank', toAccountType: 'Cash' });
  await tx(user, { title: 'Tea', amount: 20.1, type: 'expense', accountType: 'Cash', paymentMethod: 'Cash' });
  await tx(user, { title: 'Groceries', amount: 1234.56, type: 'expense', accountType: 'UPI', paymentMethod: 'UPI' });
  await tx(user, { title: 'Shoes', amount: 3000, type: 'expense', accountType: 'Credit Card', paymentMethod: 'Credit Card' });

  const b = await balances(user);
  // The ATM transfer is from Bank, which is the UPI account; the Net Banking salary stays in its own row.
  assert.equal(b.netBankingBalance, 50000);
  assert.equal(b.cashBalance, 4979.9);
  assert.equal(b.upiBalance, -6234.56);
  assert.equal(b.creditCardBalance, -3000);
  assert.equal(b.totalBalance, 45745.34);

  // A transfer is neither income nor expense in the monthly totals.
  const analytics = (await request(app).get('/api/expenses/analytics?period=all_time').set(auth(user))).body.analytics;
  assert.equal(analytics.totalIncome, 50000);
  assert.equal(analytics.totalExpense, 4254.66);
});

test('editing and deleting a transaction updates balances; repeated deletes are harmless', async () => {
  const user = await createUser();
  const e = (await tx(user, { title: 'Fuel', amount: 1000, type: 'expense', accountType: 'Cash', paymentMethod: 'Cash' })).body.expense;
  await request(app).put(`/api/expenses/${e.id}`).set(auth(user)).send({ amount: 400 });
  assert.equal((await balances(user)).cashBalance, -400);
  assert.equal((await request(app).delete(`/api/expenses/${e.id}`).set(auth(user))).status, 200);
  assert.equal((await request(app).delete(`/api/expenses/${e.id}`).set(auth(user))).status, 404);
  assert.equal((await balances(user)).cashBalance, 0);
});

test('recurring transactions keep their account fields (regression: everything landed in Cash)', async () => {
  const user = await createUser();
  const template = (await tx(user, { title: 'Netflix', amount: 649, type: 'expense', category: 'Entertainment', accountType: 'UPI', paymentMethod: 'UPI', recurring: true, recurringType: 'monthly', expenseDate: '2026-09-15' })).body.expense;
  assert.equal(template.nextRunDate.slice(0, 10), '2026-10-15');

  const stats = await processRecurring(new Date('2026-10-15T00:30:00+05:30'));
  assert.equal(stats.created, 1);

  const child = await prisma.expense.findFirst({ where: { userId: user.id, isAutoCreated: true } });
  assert.equal(child.accountType, 'UPI');
  assert.equal(child.paymentMethod, 'UPI');
  assert.equal(child.amount, 649);
  assert.equal(child.expenseDate.toISOString().slice(0, 10), '2026-10-15');
  assert.equal(child.recurring, false);
  assert.equal((await balances(user)).cashBalance, 0);
  assert.equal((await balances(user)).upiBalance, -1298);

  const updated = await prisma.expense.findUnique({ where: { id: template.id } });
  assert.equal(updated.nextRunDate.toISOString().slice(0, 10), '2026-11-15');
});

test('recurring transfers keep from/to accounts', async () => {
  const user = await createUser();
  await prisma.expense.create({ data: {
    userId: user.id, title: 'Savings sweep', amount: 1000, category: 'Transfer', type: 'transfer', accountType: 'Bank',
    paymentMethod: 'Bank', fromAccountType: 'Bank', toAccountType: 'Cash', expenseDate: new Date('2026-10-01T00:00:00Z'),
    recurring: true, recurringType: 'weekly', nextRunDate: new Date('2026-10-08T00:00:00Z'),
  } });
  await processRecurring(new Date('2026-10-08T06:00:00Z'));
  const child = await prisma.expense.findFirst({ where: { isAutoCreated: true } });
  assert.equal(child.fromAccountType, 'Bank');
  assert.equal(child.toAccountType, 'Cash');
});

test('running the job twice, or concurrently, never duplicates an occurrence', async () => {
  const user = await createUser();
  await tx(user, { title: 'Rent', amount: 15000, type: 'expense', accountType: 'Bank', paymentMethod: 'Net Banking', recurring: true, recurringType: 'monthly', expenseDate: '2026-09-01' });
  const now = new Date('2026-10-01T01:00:00+05:30');
  await Promise.all([processRecurring(now), processRecurring(now), processRecurring(now)]);
  await processRecurring(now);
  assert.equal(await prisma.expense.count({ where: { isAutoCreated: true } }), 1);
});

test('missed runs catch up with one transaction per scheduled date', async () => {
  const user = await createUser();
  await tx(user, { title: 'Gym', amount: 500, type: 'expense', accountType: 'UPI', paymentMethod: 'UPI', recurring: true, recurringType: 'weekly', expenseDate: '2026-09-01' });
  await processRecurring(new Date('2026-09-29T12:00:00+05:30'));
  const children = await prisma.expense.findMany({ where: { isAutoCreated: true }, orderBy: { expenseDate: 'asc' } });
  assert.deepEqual(children.map(c => c.expenseDate.toISOString().slice(0, 10)), ['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29']);
});

test('the job uses the IST date: at 00:30 IST the occurrence for that day is due', async () => {
  const user = await createUser();
  await tx(user, { title: 'SIP', amount: 2000, type: 'expense', accountType: 'Bank', paymentMethod: 'Net Banking', recurring: true, recurringType: 'monthly', expenseDate: '2026-09-20' });
  // 2026-10-20 00:30 IST is still 2026-10-19 in UTC.
  const stats = await processRecurring(new Date('2026-10-19T19:00:00Z'));
  assert.equal(stats.created, 1);
});

test('budget alerts fire once per threshold per month (regression: repeated on every expense)', async () => {
  const user = await createUser();
  await request(app).post('/api/budgets').set(auth(user)).send({ category: 'Food', monthlyLimit: 1000 });
  const today = new Date().toISOString().slice(0, 10);
  // Running totals 850, 900 (both >= 80%) then 1200, 1300 (both >= 100%): each threshold is hit twice.
  for (const [i, amount] of [850, 50, 300, 100].entries()) {
    await tx(user, { title: `Meal ${i}`, amount, type: 'expense', category: 'Food', accountType: 'Cash', paymentMethod: 'Cash', expenseDate: today });
  }
  const alerts = await prisma.notification.findMany({ where: { userId: user.id, category: 'Budget Alert' } });
  assert.deepEqual(alerts.map(a => a.type).sort(), ['critical', 'warning']);
});

test('fixed EMI payments: double-submitted pay requests record exactly one installment', async () => {
  const user = await createUser();
  const emi = (await request(app).post('/api/emis').set(auth(user))
    .send({ title: 'Phone', type: 'FIXED', totalAmount: 30000, emiAmount: 2500, totalInstallments: 12, startDate: '2026-01-31' })).body.emi;
  assert.equal(emi.nextDueDate.slice(0, 10), '2026-02-28');

  const results = await Promise.all([1, 2, 3].map(() => request(app).patch(`/api/emis/${emi.id}/pay`).set(auth(user)).send({})));
  const ok = results.filter(r => r.status === 200).length;
  const row = await prisma.eMI.findUnique({ where: { id: emi.id }, include: { payments: true } });
  assert.equal(row.payments.length, ok);
  assert.equal(row.paidInstallments, ok);
  assert.equal(row.paidAmount, ok * 2500);
  assert.ok(results.every(r => r.status === 200 || r.status === 409));
});

test('fixed EMI completes after the last installment and deleting a payment reopens it', async () => {
  const user = await createUser();
  const emi = (await request(app).post('/api/emis').set(auth(user))
    .send({ title: 'Laptop', type: 'FIXED', totalAmount: 3000, emiAmount: 1000, totalInstallments: 3, paidInstallments: 2, startDate: '2026-01-15' })).body.emi;
  assert.equal(emi.paidAmount, 2000);
  const paid = (await request(app).patch(`/api/emis/${emi.id}/pay`).set(auth(user)).send({})).body.emi;
  assert.equal(paid.active, false);
  assert.equal((await request(app).patch(`/api/emis/${emi.id}/pay`).set(auth(user)).send({})).status, 400);

  const payment = await prisma.eMIPayment.findFirst({ where: { emiId: emi.id } });
  const reopened = (await request(app).delete(`/api/emis/payments/${payment.id}`).set(auth(user))).body.emi;
  assert.equal(reopened.active, true);
  assert.equal(reopened.paidInstallments, 2);
  assert.equal(reopened.paidAmount, 2000);
});

test('flexible loan payments reduce the outstanding balance shown in net worth', async () => {
  const user = await createUser();
  const emi = (await request(app).post('/api/emis').set(auth(user))
    .send({ title: 'Family loan', type: 'FLEXIBLE', totalAmount: 10000, startDate: '2026-01-01' })).body.emi;
  await request(app).patch(`/api/emis/${emi.id}/pay`).set(auth(user)).send({ amount: 2500.25 });
  const nw = (await request(app).get('/api/networth/summary').set(auth(user))).body;
  assert.equal(nw.outstandingLoans, 7499.75);
  assert.equal(nw.totalLiabilities, 7499.75);
});

test('net worth = assets + liquid balance + receivables - liabilities', async () => {
  const user = await createUser();
  await tx(user, { title: 'Salary', amount: 20000, type: 'income', accountType: 'Bank', paymentMethod: 'Net Banking' });
  await request(app).post('/api/networth/assets').set(auth(user)).send({ name: 'Gold', type: 'Gold', value: 100000 });
  const a = (await request(app).post('/api/ledger/contacts').set(auth(user)).send({ name: 'A' })).body.contact;
  const b = (await request(app).post('/api/ledger/contacts').set(auth(user)).send({ name: 'B' })).body.contact;
  await request(app).post(`/api/ledger/contacts/${a.id}/entries`).set(auth(user)).send({ type: 'LENT', amount: 3000 });
  await request(app).post(`/api/ledger/contacts/${b.id}/entries`).set(auth(user)).send({ type: 'BORROWED', amount: 1000 });

  const nw = (await request(app).get('/api/networth/summary').set(auth(user))).body;
  assert.equal(nw.ledgerReceivable, 3000);
  assert.equal(nw.ledgerPayable, 1000);
  assert.equal(nw.netWorth, 100000 + 20000 + 3000 - 1000);

  const summary = (await request(app).get('/api/ledger/summary').set(auth(user))).body;
  assert.equal(summary.netBalance, 2000);
});

test('reset-all requires the password, removes every financial record in one go, and leaves other users alone', async () => {
  const user = await createUser();
  const other = await createUser();
  await tx(other, { title: 'Other', amount: 10, type: 'expense', accountType: 'Cash', paymentMethod: 'Cash' });
  await tx(user, { title: 'Mine', amount: 10, type: 'expense', accountType: 'Cash', paymentMethod: 'Cash' });
  await request(app).post('/api/budgets').set(auth(user)).send({ category: 'Food', monthlyLimit: 100 });
  const emi = (await request(app).post('/api/emis').set(auth(user)).send({ title: 'E', type: 'FIXED', totalAmount: 100, emiAmount: 10, totalInstallments: 10, startDate: '2026-01-01' })).body.emi;
  await request(app).patch(`/api/emis/${emi.id}/pay`).set(auth(user)).send({});
  await request(app).post('/api/networth/assets').set(auth(user)).send({ name: 'A', type: 'Gold', value: 1 });
  await request(app).post('/api/networth/liabilities').set(auth(user)).send({ name: 'L', type: 'Other', value: 1 });
  const c = (await request(app).post('/api/ledger/contacts').set(auth(user)).send({ name: 'C' })).body.contact;
  await request(app).post(`/api/ledger/contacts/${c.id}/entries`).set(auth(user)).send({ type: 'LENT', amount: 5 });
  await request(app).post('/api/notifications/fcm-token').set(auth(user)).send({ token: 'device-token-1' });

  assert.equal((await request(app).delete('/api/auth/reset').set(auth(user)).send({})).status, 400);
  assert.equal((await request(app).delete('/api/auth/reset').set(auth(user)).send({ password: 'wrong-password' })).status, 400);
  assert.equal(await prisma.expense.count({ where: { userId: user.id } }), 1);

  const res = await request(app).delete('/api/auth/reset').set(auth(user)).send({ password: user.password });
  assert.equal(res.status, 200);

  const where = { userId: user.id };
  const counts = await Promise.all([
    prisma.expense.count({ where }), prisma.budget.count({ where }), prisma.eMI.count({ where }),
    prisma.eMIPayment.count({ where: { emiId: emi.id } }), prisma.asset.count({ where }), prisma.liability.count({ where }),
    prisma.ledgerContact.count({ where }), prisma.ledgerEntry.count({ where }), prisma.notification.count({ where }),
  ]);
  assert.deepEqual(counts, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  // The account itself, its devices and the other user's data survive.
  assert.ok(await prisma.user.findUnique({ where: { id: user.id } }));
  assert.equal(await prisma.fcmToken.count({ where }), 1);
  assert.equal(await prisma.expense.count({ where: { userId: other.id } }), 1);
});

test('reset-all is atomic: a failure part-way leaves all data in place', async () => {
  const user = await createUser();
  await tx(user, { title: 'Keep', amount: 10, type: 'expense', accountType: 'Cash', paymentMethod: 'Cash' });
  await request(app).post('/api/networth/assets').set(auth(user)).send({ name: 'A', type: 'Gold', value: 1 });
  const original = prisma.notification.deleteMany;
  prisma.notification.deleteMany = () => prisma.$queryRaw`SELECT 1/0`;
  try {
    const res = await request(app).delete('/api/auth/reset').set(auth(user)).send({ password: user.password });
    assert.equal(res.status, 500);
  } finally {
    prisma.notification.deleteMany = original;
  }
  assert.equal(await prisma.expense.count({ where: { userId: user.id } }), 1);
  assert.equal(await prisma.asset.count({ where: { userId: user.id } }), 1);
});

test('CSV export neutralises spreadsheet formulas', async () => {
  const user = await createUser();
  await tx(user, { title: '=HYPERLINK("http://evil.example","x")', amount: 10, type: 'expense', accountType: 'Cash', paymentMethod: 'Cash' });
  const res = await request(app).get('/api/export/csv').set(auth(user));
  assert.equal(res.status, 200);
  assert.ok(res.text.includes(`"'=HYPERLINK`));
});

test('support tickets escape HTML and are rejected when no recipient is configured', async () => {
  const user = await createUser();
  const res = await request(app).post('/api/support/ticket').set(auth(user))
    .send({ subject: 'Help\r\nBcc: victim@example.test', message: '<img src=x onerror=alert(1)>' });
  assert.equal(res.status, 200);
  const mail = sentMail.at(-1);
  assert.equal(mail.to, 'support@example.test');
  assert.ok(!mail.html.includes('<img'));
  assert.ok(!/[\r\n]/.test(mail.subject));

  const { config } = require('../../config/env');
  const saved = config.supportEmailTo;
  config.supportEmailTo = null;
  try {
    assert.equal((await request(app).post('/api/support/ticket').set(auth(user)).send({ subject: 'a', message: 'b' })).status, 503);
  } finally {
    config.supportEmailTo = saved;
  }
});
