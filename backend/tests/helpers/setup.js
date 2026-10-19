// Must be required before anything that reads config or creates the Prisma client.
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is required for integration tests');
// Guard against pointing the suite (which truncates tables) at a real database.
const { hostname, pathname } = new URL(url);
if (!['localhost', '127.0.0.1', 'postgres'].includes(hostname) || !/test/i.test(pathname)) {
  throw new Error(`Refusing to run integration tests against ${hostname}${pathname}: use a local *test* database`);
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.SUPPORT_EMAIL_TO = 'support@example.test';
process.env.APP_URL = 'http://localhost:3000';
delete process.env.EMAIL_USER;
delete process.env.EMAIL_PASS;
delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
delete process.env.VAPID_PUBLIC_KEY;

const request = require('supertest');
const prisma = require('../../lib/prisma');
const mailService = require('../../services/mailService');
const app = require('../../app');

// Captures outgoing mail instead of sending it; no test ever reaches a real inbox.
const sentMail = [];
mailService.sendEmail = async (message) => {
  sentMail.push(message);
  return { success: true, messageId: `test-${sentMail.length}` };
};

const TABLES = ['PasswordResetToken', 'LedgerEntry', 'LedgerContact', 'EMIPayment', 'EMI', 'Expense', 'Budget',
  'Asset', 'Liability', 'Notification', 'PushSubscription', 'FcmToken', 'User'];

const resetDb = async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map(t => `"${t}"`).join(', ')} CASCADE`);
  sentMail.length = 0;
};

let counter = 0;
const createUser = async (overrides = {}) => {
  counter += 1;
  const email = overrides.email || `user${counter}-${Date.now()}@example.test`;
  const password = overrides.password || 'correct-horse-battery';
  const res = await request(app).post('/api/auth/register').send({ name: overrides.name || `User ${counter}`, email, password });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...res.body.user, email, password, token: res.body.token };
};

const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

const waitFor = async (predicate, timeoutMs = 2000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await new Promise(r => setTimeout(r, 20));
  }
  throw new Error('waitFor timed out');
};

module.exports = { app, request, prisma, resetDb, createUser, auth, sentMail, waitFor };
