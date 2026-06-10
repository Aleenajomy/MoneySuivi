const webpush = require('web-push');
const prisma = require('../lib/prisma');

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

if (publicKey && privateKey) {
  webpush.setVapidDetails(
    'mailto:support@moneysuivi.com',
    publicKey.replace(/['"]/g, ''),
    privateKey.replace(/['"]/g, '')
  );
  console.log('[PushService] VAPID details set successfully');
} else {
  console.warn('[PushService] Warning: VAPID keys missing. Push notifications disabled.');
}

const sendPushNotification = async (userId, { title, body }) => {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({ title, body });

    const tasks = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, payload);
      } catch (error) {
        // 410 (Gone) or 404 (Not Found) means subscription has expired or user unsubscribed
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`[PushService] Pruning expired subscription: ${sub.id}`);
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error(`[PushService] Error sending to subscription ${sub.id}:`, error.message);
        }
      }
    });

    await Promise.all(tasks);
  } catch (error) {
    console.error('[PushService] Error in sendPushNotification:', error.message);
  }
};

module.exports = { sendPushNotification };
