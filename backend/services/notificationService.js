const prisma = require('../lib/prisma');
const firebaseAdmin = require('./firebaseAdmin');
const { sendPushNotification: sendLegacyWebPush } = require('./pushService');

/**
 * Centralized notification service coordinating In-App, FCM, and Legacy WebPush notifications.
 */
class NotificationService {
  /**
   * Dispatches a notification to a user across all active notification channels.
   *
   * @param {string} userId - Target User ID
   * @param {Object} payload
   * @param {string} payload.title - Notification title
   * @param {string} payload.body - Notification body
   * @param {string} [payload.category='General'] - Notification category (e.g. Security, Expense, Income, Budget, EMI, Recurring)
   * @param {string} [payload.type='info'] - Severity/type (e.g. info, warning, critical)
   * @param {number} [payload.percentage=0] - Optional metric percentage (e.g. budget 80%)
   * @param {Record<string, any>} [payload.data={}] - Metadata payload for deep linking
   * @param {boolean} [payload.saveInApp=true] - Whether to persist to PostgreSQL Notification table
   * @returns {Promise<{ inAppNotification: any, fcmResults: any }>}
   */
  async sendToUser(userId, {
    title,
    body,
    category = 'General',
    type = 'info',
    percentage = 0,
    data = {},
    saveInApp = true,
  }) {
    if (!userId || !title || !body) {
      console.warn('[NotificationService] Missing required fields for sendToUser');
      return null;
    }

    let inAppNotification = null;

    // 1. In-App Notification Record (Database)
    if (saveInApp) {
      try {
        inAppNotification = await prisma.notification.create({
          data: {
            userId,
            category,
            percentage: Number(percentage) || 0,
            message: body,
            type,
          },
        });
      } catch (err) {
        console.error('[NotificationService] Failed to create in-app notification:', err.message);
      }
    }

    // 2. Firebase Cloud Messaging (FCM)
    let fcmResults = { successCount: 0, failureCount: 0, invalidTokens: [] };
    try {
      const tokenRecords = await prisma.fcmToken.findMany({
        where: { userId },
        select: { id: true, token: true },
      });

      if (tokenRecords.length > 0) {
        const tokens = tokenRecords.map(t => t.token);
        fcmResults = await firebaseAdmin.sendMulticast({
          tokens,
          notification: { title, body },
          data: {
            category,
            type,
            url: data.url || '/',
            notificationId: inAppNotification?.id || '',
            ...data,
          },
        });

        // Safe token pruning for unregistered/invalid tokens
        if (fcmResults.invalidTokens && fcmResults.invalidTokens.length > 0) {
          console.log(`[NotificationService] Pruning ${fcmResults.invalidTokens.length} invalid FCM tokens for user ${userId}`);
          await prisma.fcmToken.deleteMany({
            where: {
              token: { in: fcmResults.invalidTokens },
            },
          }).catch(err => console.error('[NotificationService] Error pruning invalid tokens:', err.message));
        }
      }
    } catch (err) {
      console.error('[NotificationService] Error sending FCM push:', err.message);
    }

    // 3. Legacy Web Push (VAPID) fallback
    try {
      sendLegacyWebPush(userId, { title, body }).catch(err => {
        console.error('[NotificationService] Legacy push fallback error:', err.message);
      });
    } catch (err) {
      // Non-critical fallback
    }

    return { inAppNotification, fcmResults };
  }

  /**
   * Registers or updates an FCM token for an authenticated user.
   * Supports multiple devices per user.
   */
  async registerFcmToken(userId, { token, device = null, platform = null, isNewLogin = false }) {
    if (!userId || !token) {
      throw new Error('User ID and token are required');
    }

    const fcmRecord = await prisma.fcmToken.upsert({
      where: { token },
      update: {
        userId,
        device: device || undefined,
        platform: platform || undefined,
        lastUsedAt: new Date(),
      },
      create: {
        userId,
        token,
        device,
        platform,
        lastUsedAt: new Date(),
      },
    });

    // If marked as new login, send the Login Successful push notification immediately
    if (isNewLogin) {
      const loginTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const deviceLabel = device ? ` on ${device}` : '';

      this.sendToUser(userId, {
        title: '🔐 Login Successful',
        body: `You have successfully signed in to MoneySuivi${deviceLabel} at ${loginTime}.`,
        category: 'Security',
        type: 'info',
        data: { url: '/' },
        saveInApp: true,
      }).catch(err => console.error('[NotificationService] Failed to send login push notification:', err.message));
    }

    return fcmRecord;
  }

  /**
   * Unregisters an FCM token when a user logs out or disables notifications.
   */
  async unregisterFcmToken(userId, token) {
    if (!token) return { count: 0 };
    return prisma.fcmToken.deleteMany({
      where: {
        userId,
        token,
      },
    });
  }
}

module.exports = new NotificationService();
