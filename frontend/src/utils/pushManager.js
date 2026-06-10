import api from '../services/api';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "BPoDZKyX7psVM7kdtsWz5HJ_u_VRoxnDqOpnJagVOhRISg6MIma28kgB80AY1Hj8HU-u9bJFAJD5aP2T86piLto";

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeUserToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[PushManager] Push notifications are not supported in this browser.');
    return null;
  }

  try {
    let permission = Notification.permission;
    
    // If not granted or denied, request it
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      console.warn('[PushManager] Permission for notifications was not granted.');
      return null;
    }

    const registration = await navigator.serviceWorker.ready;
    if (!registration) {
      console.warn('[PushManager] Service worker registration is not ready.');
      return null;
    }

    // Get existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const convertedVapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });
      console.log('[PushManager] Created new push subscription:', subscription);
    } else {
      console.log('[PushManager] Found existing push subscription');
    }

    // Send subscription payload to the backend
    const response = await api.post('/notifications/subscribe', subscription);
    console.log('[PushManager] Subscription successfully registered on backend:', response.data);
    return subscription;
  } catch (error) {
    console.error('[PushManager] Failed to subscribe user to push:', error);
    return null;
  }
}
