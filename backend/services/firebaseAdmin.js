const admin = require('firebase-admin');

let isInitialized = false;
let messagingInstance = null;

const initializeFirebaseAdmin = () => {
  if (isInitialized) {
    return messagingInstance;
  }

  try {
    let credential = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const parsedKey = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        credential = admin.credential.cert(parsedKey);
      } catch {
        // Assume file path
        credential = admin.credential.cert(require(process.env.FIREBASE_SERVICE_ACCOUNT_KEY));
      }
    } else if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
    }

    if (!credential) {
      console.warn('[FirebaseAdmin] Warning: Firebase Admin credentials not found in environment. FCM push notifications disabled.');
      return null;
    }

    admin.initializeApp({ credential });
    isInitialized = true;
    messagingInstance = admin.messaging();
    console.log('[FirebaseAdmin] Firebase Admin SDK initialized successfully');
    return messagingInstance;
  } catch (error) {
    console.error('[FirebaseAdmin] Failed to initialize Firebase Admin SDK:', error.message);
    return null;
  }
};

const isConfigured = () => {
  if (!isInitialized) {
    initializeFirebaseAdmin();
  }
  return isInitialized && Boolean(messagingInstance);
};

/**
 * Send notification to multiple FCM registration tokens.
 * Automatically identifies invalid/unregistered tokens for pruning.
 *
 * @param {Object} options
 * @param {string[]} options.tokens
 * @param {{ title: string, body: string, imageUrl?: string }} options.notification
 * @param {Record<string, string>} [options.data]
 * @returns {Promise<{ successCount: number, failureCount: number, invalidTokens: string[] }>}
 */
const sendMulticast = async ({ tokens, notification, data = {} }) => {
  if (!tokens || tokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  const messaging = initializeFirebaseAdmin();
  if (!messaging) {
    return { successCount: 0, failureCount: tokens.length, invalidTokens: [] };
  }

  // Ensure all data values are strings for FCM payload compliance
  const stringifiedData = {};
  if (data && typeof data === 'object') {
    Object.entries(data).forEach(([k, v]) => {
      stringifiedData[k] = v === null || v === undefined ? '' : String(v);
    });
  }

  const message = {
    tokens,
    notification: {
      title: notification.title,
      body: notification.body,
      ...(notification.imageUrl ? { imageUrl: notification.imageUrl } : {}),
    },
    data: stringifiedData,
    webpush: {
      notification: {
        title: notification.title,
        body: notification.body,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        vibrate: [100, 50, 100],
      },
      fcmOptions: {
        link: stringifiedData.url || '/',
      },
    },
  };

  try {
    const response = await messaging.sendEachForMulticast(message);
    const invalidTokens = [];

    response.responses.forEach((res, index) => {
      if (!res.success && res.error) {
        const errorCode = res.error.code;
        if (
          errorCode === 'messaging/invalid-registration-token' ||
          errorCode === 'messaging/registration-token-not-registered' ||
          errorCode === 'messaging/mismatched-credential'
        ) {
          invalidTokens.push(tokens[index]);
        } else {
          console.warn(`[FirebaseAdmin] FCM delivery error for token [${tokens[index].slice(0, 10)}...]:`, res.error.message);
        }
      }
    });

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
    };
  } catch (error) {
    console.error('[FirebaseAdmin] sendMulticast error:', error.message);
    return { successCount: 0, failureCount: tokens.length, invalidTokens: [] };
  }
};

module.exports = {
  initializeFirebaseAdmin,
  isConfigured,
  sendMulticast,
};
