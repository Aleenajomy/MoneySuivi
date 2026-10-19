const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, prisma, resetDb, createUser, auth } = require('../helpers/setup');

beforeEach(resetDb);
after(() => prisma.$disconnect());

const seedVictim = async (victim) => {
  const expense = (await request(app).post('/api/expenses').set(auth(victim))
    .send({ title: 'Rent', amount: 15000, category: 'Bills', type: 'expense', accountType: 'Bank', paymentMethod: 'Net Banking', expenseDate: '2026-10-01' })).body.expense;
  const budget = (await request(app).post('/api/budgets').set(auth(victim)).send({ category: 'Food', monthlyLimit: 5000 })).body.budget;
  const emi = (await request(app).post('/api/emis').set(auth(victim))
    .send({ title: 'Car', type: 'FIXED', totalAmount: 60000, emiAmount: 5000, totalInstallments: 12, startDate: '2026-01-01' })).body.emi;
  const asset = (await request(app).post('/api/networth/assets').set(auth(victim)).send({ name: 'Gold', type: 'Gold', value: 50000 })).body.asset;
  const liability = (await request(app).post('/api/networth/liabilities').set(auth(victim)).send({ name: 'Loan', type: 'Personal Loan', value: 1000 })).body.liability;
  const contact = (await request(app).post('/api/ledger/contacts').set(auth(victim)).send({ name: 'Ravi' })).body.contact;
  const entry = (await request(app).post(`/api/ledger/contacts/${contact.id}/entries`).set(auth(victim)).send({ type: 'LENT', amount: 2000 })).body.entry;
  await request(app).patch(`/api/emis/${emi.id}/pay`).set(auth(victim)).send({});
  const payment = await prisma.eMIPayment.findFirst({ where: { emiId: emi.id } });
  return { expense, budget, emi, asset, liability, contact, entry, payment };
};

test('a user cannot read, change or delete another user\'s records', async () => {
  const victim = await createUser();
  const attacker = await createUser();
  const v = await seedVictim(victim);
  const as = auth(attacker);

  const attempts = [
    request(app).get(`/api/expenses/${v.expense.id}`).set(as),
    request(app).put(`/api/expenses/${v.expense.id}`).set(as).send({ amount: 1 }),
    request(app).delete(`/api/expenses/${v.expense.id}`).set(as),
    request(app).put(`/api/budgets/${v.budget.id}`).set(as).send({ monthlyLimit: 1 }),
    request(app).delete(`/api/budgets/${v.budget.id}`).set(as),
    request(app).put(`/api/emis/${v.emi.id}`).set(as).send({ title: 'x', type: 'FIXED', totalAmount: 1, emiAmount: 1, totalInstallments: 1, startDate: '2026-01-01' }),
    request(app).patch(`/api/emis/${v.emi.id}/pay`).set(as).send({}),
    request(app).delete(`/api/emis/${v.emi.id}`).set(as),
    request(app).delete(`/api/emis/payments/${v.payment.id}`).set(as),
    request(app).put(`/api/networth/assets/${v.asset.id}`).set(as).send({ value: 1 }),
    request(app).delete(`/api/networth/assets/${v.asset.id}`).set(as),
    request(app).put(`/api/networth/liabilities/${v.liability.id}`).set(as).send({ value: 1 }),
    request(app).delete(`/api/networth/liabilities/${v.liability.id}`).set(as),
    request(app).get(`/api/ledger/contacts/${v.contact.id}/entries`).set(as),
    request(app).post(`/api/ledger/contacts/${v.contact.id}/entries`).set(as).send({ type: 'LENT', amount: 5 }),
    request(app).put(`/api/ledger/contacts/${v.contact.id}`).set(as).send({ name: 'x' }),
    request(app).delete(`/api/ledger/contacts/${v.contact.id}`).set(as),
    request(app).put(`/api/ledger/entries/${v.entry.id}`).set(as).send({ amount: 1 }),
    request(app).delete(`/api/ledger/entries/${v.entry.id}`).set(as),
  ];
  for (const res of await Promise.all(attempts)) {
    assert.equal(res.status, 404, `${res.req.method} ${res.req.path} returned ${res.status}`);
  }

  // Victim data is untouched.
  assert.equal((await prisma.expense.findUnique({ where: { id: v.expense.id } })).amount, 15000);
  assert.equal((await prisma.budget.findUnique({ where: { id: v.budget.id } })).monthlyLimit, 5000);
  assert.equal((await prisma.eMI.findUnique({ where: { id: v.emi.id } })).paidInstallments, 1);
  assert.equal((await prisma.asset.findUnique({ where: { id: v.asset.id } })).value, 50000);
  assert.equal(await prisma.ledgerEntry.count({ where: { contactId: v.contact.id } }), 1);

  // Lists only ever contain the caller's own data.
  const lists = await Promise.all(['/api/expenses', '/api/budgets', '/api/emis', '/api/networth/assets', '/api/ledger/contacts', '/api/notifications']
    .map(p => request(app).get(p).set(as)));
  for (const res of lists) {
    const body = JSON.stringify(res.body);
    assert.ok(!body.includes(victim.id), `${res.req.path} leaked victim data`);
  }
});

test('asset and liability updates cannot reassign ownership (mass assignment regression)', async () => {
  const victim = await createUser();
  const attacker = await createUser();
  const asset = (await request(app).post('/api/networth/assets').set(auth(attacker)).send({ name: 'Mine', type: 'Gold', value: 10 })).body.asset;
  const liability = (await request(app).post('/api/networth/liabilities').set(auth(attacker)).send({ name: 'Mine', type: 'Other', value: 10 })).body.liability;

  await request(app).put(`/api/networth/assets/${asset.id}`).set(auth(attacker)).send({ userId: victim.id, value: 999999 });
  await request(app).put(`/api/networth/liabilities/${liability.id}`).set(auth(attacker)).send({ userId: victim.id, id: 'x' });

  assert.equal((await prisma.asset.findUnique({ where: { id: asset.id } })).userId, attacker.id);
  assert.equal((await prisma.liability.findUnique({ where: { id: liability.id } })).userId, attacker.id);
  assert.equal(await prisma.asset.count({ where: { userId: victim.id } }), 0);
});

test('partial asset update keeps the existing value', async () => {
  const user = await createUser();
  const asset = (await request(app).post('/api/networth/assets').set(auth(user)).send({ name: 'FD', type: 'Fixed Deposit', value: 100000 })).body.asset;
  const res = await request(app).put(`/api/networth/assets/${asset.id}`).set(auth(user)).send({ name: 'FD renamed' });
  assert.equal(res.status, 200);
  assert.equal(res.body.asset.value, 100000);
});

test('protected routes reject requests without a token', async () => {
  for (const path of ['/api/expenses', '/api/budgets', '/api/emis', '/api/networth/summary', '/api/ledger/contacts', '/api/export/csv']) {
    assert.equal((await request(app).get(path)).status, 401, path);
  }
});

test('the analytics debug endpoint is gone', async () => {
  const user = await createUser();
  const res = await request(app).get('/api/expenses/analytics-debug').set(auth(user));
  assert.notEqual(res.status, 200);
});

test('the duplicate /budgets mount without /api is gone', async () => {
  const user = await createUser();
  assert.equal((await request(app).get('/budgets').set(auth(user))).status, 404);
});
