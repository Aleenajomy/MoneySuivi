const webpush = require('web-push');
const prisma = require('../lib/prisma');
const logger = require('../utils/logger');

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

if (publicKey && privateKey) {
  webpush.setVapidDetails(
    'mailto:support@moneysuivi.com',
    publicKey.replace(/['"]/g, ''),
    privateKey.replace(/['"]/g, '')
  );
  logger.info('[PushService] VAPID configured');
} else {
  logger.warn('[PushService] VAPID keys missing; web push disabled');
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
          logger.info('[PushService] Pruning expired subscription', { id: sub.id });
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          logger.error('[PushService] Send failed', { id: sub.id, error: error.message });
        }
      }
    });

    await Promise.all(tasks);
  } catch (error) {
    logger.error('[PushService] sendPushNotification failed', { error: error.message });
  }
};

module.exports = { sendPushNotification };
