/**
 * Local (client-side) reminder + notification helpers.
 *
 * This intentionally does NOT use server-side Web Push: notifications are
 * shown by the page / service worker while the app is running. A service
 * worker is registered (when supported) so notifications survive a backgrounded
 * tab and clicking one re-focuses the app; we fall back to the page-level
 * Notification constructor otherwise.
 */

let swRegistration = null;
let swRegisterPromise = null;

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function registerReminderServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (swRegistration) return swRegistration;
  if (swRegisterPromise) return swRegisterPromise;
  swRegisterPromise = navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      swRegistration = reg;
      return reg;
    })
    .catch(() => null);
  return swRegisterPromise;
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') {
    registerReminderServiceWorker();
    return 'granted';
  }
  if (Notification.permission === 'denied') return 'denied';
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') registerReminderServiceWorker();
    return result;
  } catch {
    return 'denied';
  }
}

/** Show a notification now, preferring the service worker registration. */
export async function showLocalNotification(title, options = {}) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  const opts = {
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    ...options,
  };
  try {
    const reg = swRegistration || (await registerReminderServiceWorker());
    if (reg && reg.showNotification) {
      await reg.showNotification(title, opts);
      return true;
    }
  } catch {
    /* fall through to page-level Notification */
  }
  try {
    const n = new Notification(title, opts);
    return !!n;
  } catch {
    return false;
  }
}

export const REMINDER_OPTIONS = [
  { value: null, label: 'Без напоминания' },
  { value: 0, label: 'Во время' },
  { value: 5, label: 'За 5 минут' },
  { value: 10, label: 'За 10 минут' },
  { value: 30, label: 'За 30 минут' },
  { value: 60, label: 'За 1 час' },
];

export function reminderLabel(minutes) {
  if (minutes == null) return 'Без напоминания';
  const found = REMINDER_OPTIONS.find((o) => o.value === minutes);
  return found ? found.label : `За ${minutes} мин`;
}

/** "HH:MM" from a Postgres time value like "09:30" or "09:30:00". */
export function formatTimeHHMM(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return '';
  const m = timeStr.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}
