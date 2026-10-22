const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { app, request, prisma, resetDb, createUser, auth, sentMail, waitFor } = require('../helpers/setup');
const { config } = require('../../config/env');
const { hashToken } = require('../../services/passwordResetService');

beforeEach(resetDb);
after(() => prisma.$disconnect());

const tokenFromMail = (mail) => decodeURIComponent(mail.text.match(/token=([^\s]+)/)[1]);

const requestResetToken = async (email) => {
  const res = await request(app).post('/api/auth/forgot-password').send({ email });
  assert.equal(res.status, 200);
  const mail = await waitFor(() => sentMail.find(m => m.to === email));
  return tokenFromMail(mail);
};

test('login failures are indistinguishable for unknown email and wrong password', async () => {
  const user = await createUser();
  const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.test', password: 'whatever-password' });
  const wrong = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.deepEqual(unknown.body, wrong.body);
  assert.equal(unknown.body.code, 'INVALID_CREDENTIALS');
});

test('each successful login is recorded and failed logins are not', async () => {
  const user = await createUser();
  await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
  assert.equal(await prisma.loginEvent.count(), 0);

  const first = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
  const second = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const events = await prisma.loginEvent.findMany({ where: { userId: user.id } });
  assert.equal(events.length, 2);
});

test('login still succeeds when the login log cannot be written', async () => {
  const user = await createUser();
  const original = prisma.loginEvent.create;
  prisma.loginEvent.create = async () => { throw new Error('simulated write failure'); };
  try {
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  } finally {
    prisma.loginEvent.create = original;
  }
});

test('login is case-insensitive on email and returns a working token', async () => {
  const user = await createUser({ email: 'Mixed.Case@Example.test' });
  const res = await request(app).post('/api/auth/login').send({ email: 'MIXED.case@example.TEST', password: user.password });
  assert.equal(res.status, 200);
  const me = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${res.body.token}` });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.password, undefined);
});

test('registration enforces the password policy and rejects duplicate emails regardless of case', async () => {
  const short = await request(app).post('/api/auth/register').send({ name: 'A', email: 'a@example.test', password: 'short' });
  assert.equal(short.status, 400);
  await createUser({ email: 'dup@example.test' });
  const dup = await request(app).post('/api/auth/register').send({ name: 'B', email: 'DUP@example.test', password: 'long-enough-pass' });
  assert.equal(dup.status, 409);
});

test('legacy forgot-password payload no longer changes the password (account takeover regression)', async () => {
  const user = await createUser();
  const res = await request(app).post('/api/auth/forgot-password').send({ email: user.email, newPassword: 'attacker-chosen-pass' });
  assert.equal(res.status, 200);
  const attacker = await request(app).post('/api/auth/login').send({ email: user.email, password: 'attacker-chosen-pass' });
  assert.equal(attacker.status, 401);
  const owner = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
  assert.equal(owner.status, 200);
});

test('forgot-password gives the same response for unknown and known emails, and only mails real accounts', async () => {
  const user = await createUser();
  const known = await request(app).post('/api/auth/forgot-password').send({ email: user.email });
  const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.test' });
  assert.equal(known.status, unknown.status);
  assert.deepEqual(known.body, unknown.body);
  await waitFor(() => sentMail.length === 1);
  await new Promise(r => setTimeout(r, 100));
  assert.equal(sentMail.length, 1);
  assert.equal(sentMail[0].to, user.email);
  // The token is delivered only by email, never in the API response.
  assert.ok(!JSON.stringify(known.body).includes('token='));
});

test('reset tokens are stored hashed, work once, and revoke existing sessions', async () => {
  const user = await createUser();
  const token = await requestResetToken(user.email);

  const stored = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
  assert.equal(stored.length, 1);
  assert.notEqual(stored[0].tokenHash, token);
  assert.equal(stored[0].tokenHash, hashToken(token));

  const reset = await request(app).post('/api/auth/reset-password').send({ token, password: 'brand-new-password' });
  assert.equal(reset.status, 200);

  const replay = await request(app).post('/api/auth/reset-password').send({ token, password: 'another-password-1' });
  assert.equal(replay.status, 400);
  assert.equal(replay.body.code, 'INVALID_RESET_TOKEN');

  const oldSession = await request(app).get('/api/auth/me').set(auth(user));
  assert.equal(oldSession.status, 401);

  const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'brand-new-password' });
  assert.equal(login.status, 200);
});

test('concurrent use of one reset token succeeds exactly once', async () => {
  const user = await createUser();
  const token = await requestResetToken(user.email);
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
    request(app).post('/api/auth/reset-password').send({ token, password: `parallel-password-${i}` })));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(results.filter(r => r.status === 400).length, 4);
});

test('expired reset tokens are rejected', async () => {
  const user = await createUser();
  const token = await requestResetToken(user.email);
  await prisma.passwordResetToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'brand-new-password' });
  assert.equal(res.status, 400);
});

test('requesting a new reset link invalidates the previous one', async () => {
  const user = await createUser();
  const first = await requestResetToken(user.email);
  sentMail.length = 0;
  const second = await requestResetToken(user.email);
  assert.notEqual(first, second);
  assert.equal((await request(app).post('/api/auth/reset-password').send({ token: first, password: 'brand-new-password' })).status, 400);
  assert.equal((await request(app).post('/api/auth/reset-password').send({ token: second, password: 'brand-new-password' })).status, 200);
});

test('reset email escapes the user name', async () => {
  const res = await request(app).post('/api/auth/register').send({ name: '<script>x</script>', email: 'xss@example.test', password: 'long-enough-pass' });
  assert.equal(res.status, 201);
  await request(app).post('/api/auth/forgot-password').send({ email: 'xss@example.test' });
  const mail = await waitFor(() => sentMail[0]);
  assert.ok(!mail.html.includes('<script>'));
});

test('changing the password revokes other sessions but returns a fresh token', async () => {
  const user = await createUser();
  const res = await request(app).put('/api/auth/profile').set(auth(user)).send({ currentPassword: user.password, password: 'changed-password-1' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal((await request(app).get('/api/auth/me').set(auth(user))).status, 401);
  assert.equal((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${res.body.token}` })).status, 200);
});

test('profile update ignores fields outside the allow-list (no mass assignment)', async () => {
  const user = await createUser();
  await request(app).put('/api/auth/profile').set(auth(user)).send({ name: 'New Name', email: 'hijack@example.test', tokenVersion: 99 });
  const row = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(row.name, 'New Name');
  assert.equal(row.email, user.email);
  assert.equal(row.tokenVersion, 0);
});

test('JWTs signed with another secret or algorithm are rejected', async () => {
  const user = await createUser();
  const forged = jwt.sign({ id: user.id, v: 0 }, 'not-the-real-secret');
  assert.equal((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${forged}` })).status, 401);
  const none = jwt.sign({ id: user.id, v: 0 }, null, { algorithm: 'none' });
  assert.equal((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${none}` })).status, 401);
});

test('login is rate limited per account', async () => {
  const user = await createUser();
  config.rateLimitEnabled = true;
  try {
    let last;
    for (let i = 0; i < 11; i++) {
      last = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
    }
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'RATE_LIMITED');
  } finally {
    config.rateLimitEnabled = false;
  }
});

test('forgot-password is rate limited per IP and per email', async () => {
  config.rateLimitEnabled = true;
  try {
    const perEmail = [];
    for (let i = 0; i < 4; i++) {
      perEmail.push((await request(app).post('/api/auth/forgot-password').send({ email: 'same@example.test' })).status);
    }
    assert.deepEqual(perEmail, [200, 200, 200, 429]);

    const statuses = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await request(app).post('/api/auth/forgot-password').send({ email: `r${i}@example.test` })).status);
    }
    assert.equal(statuses.at(-1), 429);
  } finally {
    config.rateLimitEnabled = false;
  }
});
