const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const webpush = require('web-push');
const { app, request, prisma, resetDb, createUser, auth } = require('../helpers/setup');
const firebaseAdmin = require('../../services/firebaseAdmin');
const notificationService = require('../../services/notificationService');
const { sendPushNotification } = require('../../services/pushService');

beforeEach(resetDb);
after(() => prisma.$disconnect());

const subscription = (n) => ({ endpoint: `https://push.example.test/sub-${n}`, keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` } });

test('devices registered from a browser tab are stored but marked as not the installed app', async () => {
  const user = await createUser();
  await request(app).post('/api/notifications/fcm-token').set(auth(user)).send({ token: 'browser-token' });
  await request(app).post('/api/notifications/fcm-token').set(auth(user)).send({ token: 'app-token', installedApp: true });
  await request(app).post('/api/notifications/subscribe').set(auth(user)).send(subscription(1));
  await request(app).post('/api/notifications/subscribe').set(auth(user)).send({ ...subscription(2), installedApp: true });

  const tokens = await prisma.fcmToken.findMany({ where: { userId: user.id }, orderBy: { token: 'asc' } });
  assert.deepEqual(tokens.map(t => [t.token, t.installedApp]), [['app-token', true], ['browser-token', false]]);
  const subs = await prisma.pushSubscription.findMany({ where: { userId: user.id }, orderBy: { endpoint: 'asc' } });
  assert.deepEqual(subs.map(s => s.installedApp), [false, true]);
});

test('re-registering a device from the installed app flags an existing browser registration', async () => {
  const user = await createUser();
  await request(app).post('/api/notifications/fcm-token').set(auth(user)).send({ token: 'shared-token' });
  await request(app).post('/api/notifications/fcm-token').set(auth(user)).send({ token: 'shared-token', installedApp: true });
  const token = await prisma.fcmToken.findUnique({ where: { token: 'shared-token' } });
  assert.equal(token.installedApp, true);
});

test('FCM push is sent only to installed-app devices', async () => {
  const user = await createUser();
  await request(app).post('/api/notifications/fcm-token').set(auth(user)).send({ token: 'browser-token' });
  await request(app).post('/api/notifications/fcm-token').set(auth(user)).send({ token: 'app-token', installedApp: true });

  const original = firebaseAdmin.sendMulticast;
  const sent = [];
  firebaseAdmin.sendMulticast = async ({ tokens }) => { sent.push(...tokens); return { successCount: tokens.length, failureCount: 0, invalidTokens: [] }; };
  try {
    await notificationService.sendToUser(user.id, { title: 'Budget alert', body: 'Food is over budget', category: 'Budget', type: 'warning', saveInApp: false });
  } finally {
    firebaseAdmin.sendMulticast = original;
  }
  assert.deepEqual(sent, ['app-token']);
});

test('web push is sent only to installed-app subscriptions', async () => {
  const user = await createUser();
  await request(app).post('/api/notifications/subscribe').set(auth(user)).send(subscription(1));
  await request(app).post('/api/notifications/subscribe').set(auth(user)).send({ ...subscription(2), installedApp: true });

  const original = webpush.sendNotification;
  const sent = [];
  webpush.sendNotification = async (sub) => { sent.push(sub.endpoint); };
  try {
    await sendPushNotification(user.id, { title: 'Hi', body: 'There' });
  } finally {
    webpush.sendNotification = original;
  }
  assert.deepEqual(sent, ['https://push.example.test/sub-2']);
});
