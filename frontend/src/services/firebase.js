import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import api from './api';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export const isFirebaseConfigured = () => {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
};

let app = null;
let messaging = null;

const getFirebaseApp = () => {
  if (!isFirebaseConfigured()) {
    return null;
  }
  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  }
  return app;
};

const getFirebaseMessaging = async () => {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;

  try {
    const supported = await isSupported();
    if (!supported) return null;
    if (!messaging) {
      messaging = getMessaging(firebaseApp);
    }
    return messaging;
  } catch (err) {
    console.warn('[FCM] Firebase messaging is not supported in this environment:', err.message);
    return null;
  }
};

const getDeviceDetails = () => {
  if (typeof window === 'undefined') return { platform: 'Unknown', device: 'Unknown' };
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const ua = navigator.userAgent;
  let platform = 'Web';
  if (/Android/i.test(ua)) platform = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) platform = 'iOS';
  else if (/Mac/i.test(ua)) platform = 'macOS';
  else if (/Windows/i.test(ua)) platform = 'Windows';
  else if (/Linux/i.test(ua)) platform = 'Linux';

  const mode = isStandalone ? ' PWA' : ' Browser';
  return {
    platform,
    device: `${platform}${mode}`,
  };
};

/**
 * Requests FCM registration token and registers it with the MoneySuivi backend.
 * Completely asynchronous and non-blocking.
 *
 * @param {Object} [options]
 * @param {boolean} [options.isNewLogin=false] - If true, triggers the Login Successful push notification
 * @param {boolean} [options.promptPermission=false] - Whether to actively prompt the user if default
 */
export async function registerFcmToken(options = {}) {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return null;
  }

  if (!isFirebaseConfigured()) {
    return null;
  }

  try {
    const msg = await getFirebaseMessaging();
    if (!msg) return null;

    let permission = Notification.permission;
    if (permission === 'default' && options.promptPermission) {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      return null;
    }

    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker ready timeout')), 8000)),
    ]);

    if (!registration) {
      return null;
    }

    const tokenOptions = {
      serviceWorkerRegistration: registration,
      ...(VAPID_KEY ? { vapidKey: VAPID_KEY } : {}),
    };

    const token = await getToken(msg, tokenOptions);
    if (!token) {
      return null;
    }

    const lastToken = localStorage.getItem('last_registered_fcm_token');
    const isNewToken = lastToken !== token;

    // Send token to backend if it's new, or if this is an explicit new login
    if (isNewToken || options.isNewLogin) {
      const details = getDeviceDetails();
      await api.post('/notifications/fcm-token', {
        token,
        device: details.device,
        platform: details.platform,
        isNewLogin: Boolean(options.isNewLogin),
      });
      localStorage.setItem('last_registered_fcm_token', token);
      console.log('[FCM] Token registered successfully with backend');
    }

    return token;
  } catch (error) {
    console.warn('[FCM] FCM registration completed with note:', error.message);
    return null;
  }
}

/**
 * Listens for FCM notifications delivered while the application is in the foreground.
 *
 * @param {(payload: any) => void} onMessageReceived - Callback with payload
 * @returns {() => void} Unsubscribe function
 */
export function setupForegroundListener(onMessageReceived) {
  if (typeof window === 'undefined' || !isFirebaseConfigured()) {
    return () => {};
  }

  let unsubscribe = () => {};

  getFirebaseMessaging().then(msg => {
    if (!msg) return;
    unsubscribe = onMessage(msg, (payload) => {
      console.log('[FCM] Foreground message received:', payload);
      if (typeof onMessageReceived === 'function') {
        onMessageReceived(payload);
      }
    });
  }).catch(() => {});

  return () => unsubscribe();
}

/**
 * Unregisters the current FCM token from the backend.
 */
export async function unregisterFcmToken() {
  const token = localStorage.getItem('last_registered_fcm_token');
  if (!token) return;

  try {
    await api.delete('/notifications/fcm-token', { data: { token } });
    localStorage.removeItem('last_registered_fcm_token');
  } catch (err) {
    console.warn('[FCM] Failed to unregister token:', err.message);
  }
}
