const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, prisma, resetDb, createUser, auth } = require('../helpers/setup');

beforeEach(resetDb);
after(() => prisma.$disconnect());

const base = { title: 'Lunch', amount: 250, category: 'Food', type: 'expense', accountType: 'UPI', paymentMethod: 'UPI', expenseDate: '2026-10-10' };

test('expense validation rejects bad amounts, dates, enums and oversized text', async () => {
  const user = await createUser();
  const cases = [
    { amount: -5 }, { amount: 0 }, { amount: 'abc' }, { amount: 10.555 }, { amount: 1e13 },
    { expenseDate: 'not-a-date' }, { type: 'gift' }, { accountType: 'Crypto' },
    { title: 'x'.repeat(101) }, { note: 'x'.repeat(501) }, { recurring: true, recurringType: 'daily' },
  ];
  for (const patch of cases) {
    const res = await request(app).post('/api/expenses').set(auth(user)).send({ ...base, ...patch });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(patch)}, got ${res.status}`);
  }
  assert.equal(await prisma.expense.count(), 0);
});

test('transfers must name two different accounts', async () => {
  const user = await createUser();
  const same = await request(app).post('/api/expenses').set(auth(user))
    .send({ ...base, type: 'transfer', fromAccountType: 'Bank', toAccountType: 'Bank' });
  assert.equal(same.status, 400);
  const missing = await request(app).post('/api/expenses').set(auth(user)).send({ ...base, type: 'transfer', fromAccountType: 'Bank' });
  assert.equal(missing.status, 400);
});

test('invalid ids return 400 instead of a server error', async () => {
  const user = await createUser();
  for (const path of ['/api/expenses/not-a-uuid', '/api/ledger/contacts/1/entries']) {
    assert.equal((await request(app).get(path).set(auth(user))).status, 400, path);
  }
});

test('list page size is capped', async () => {
  const user = await createUser();
  assert.equal((await request(app).get('/api/expenses?limit=100000').set(auth(user))).status, 400);
  assert.equal((await request(app).get('/api/expenses?limit=100').set(auth(user))).status, 200);
});

test('EMI and ledger inputs are validated', async () => {
  const user = await createUser();
  const emi = await request(app).post('/api/emis').set(auth(user)).send({ title: 'Bad', type: 'FIXED', totalAmount: 1000, totalInstallments: 0, emiAmount: 100, startDate: '2026-01-01' });
  assert.equal(emi.status, 400);
  const rate = await request(app).post('/api/emis').set(auth(user)).send({ title: 'Bad', type: 'FLEXIBLE', totalAmount: 1000, interestRate: 500, startDate: '2026-01-01' });
  assert.equal(rate.status, 400);
  const contact = (await request(app).post('/api/ledger/contacts').set(auth(user)).send({ name: 'A' })).body.contact;
  const entry = await request(app).post(`/api/ledger/contacts/${contact.id}/entries`).set(auth(user)).send({ type: 'STOLEN', amount: 5 });
  assert.equal(entry.status, 400);
  const negative = await request(app).post(`/api/ledger/contacts/${contact.id}/entries`).set(auth(user)).send({ type: 'LENT', amount: -5 });
  assert.equal(negative.status, 400);
});

test('malformed and oversized JSON bodies are rejected cleanly', async () => {
  const malformed = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
  assert.equal(malformed.status, 400);
  const huge = await request(app).post('/api/auth/login').send({ email: 'a@example.test', password: 'x'.repeat(200 * 1024) });
  assert.equal(huge.status, 413);
});

test('server errors never leak internal details', async () => {
  const user = await createUser();
  const original = prisma.expense.findMany;
  prisma.expense.findMany = async () => { throw new Error('connection to db-internal.example:5432 failed: password=hunter2'); };
  try {
    const res = await request(app).get('/api/expenses').set(auth(user));
    assert.equal(res.status, 500);
    assert.ok(!JSON.stringify(res.body).includes('hunter2'));
    assert.ok(!JSON.stringify(res.body).includes('db-internal'));
  } finally {
    prisma.expense.findMany = original;
  }
});

test('security headers are set and CORS rejects unknown origins', async () => {
  const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-powered-by'], undefined);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  const preflight = await request(app).options('/api/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
  assert.equal(preflight.headers['access-control-allow-origin'], undefined);
  const allowed = await request(app).options('/api/auth/login').set('Origin', 'http://localhost:3000').set('Access-Control-Request-Method', 'POST');
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:3000');
});
