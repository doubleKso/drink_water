import { api } from './api.js';

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS pretends to be a Mac

// True when launched from the Home Screen icon (iOS only allows push in this mode).
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const notificationPermission = () => ('Notification' in window ? Notification.permission : 'unsupported');

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}

async function messageWorker(message) {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  (navigator.serviceWorker.controller || registration.active)?.postMessage(message);
}

export function clearReminderNotifications() {
  return messageWorker({ type: 'clear-reminders' });
}

export function updateAppBadge(totalMl, goalMl, cupSizeMl) {
  const remaining = Math.max(0, Math.ceil((goalMl - totalMl) / cupSizeMl));
  if ('setAppBadge' in navigator) {
    return remaining > 0 ? navigator.setAppBadge(remaining) : navigator.clearAppBadge();
  }
  return messageWorker({ type: 'set-badge', count: remaining });
}

function urlBase64ToUint8Array(base64) {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function uint8ToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Gets (or creates) the browser's push subscription for our server key. */
async function getOrCreateSubscription() {
  const registration = await navigator.serviceWorker.ready;
  const { key } = await api.vapidKey();

  let sub = await registration.pushManager.getSubscription();
  if (sub) {
    const current = sub.options?.applicationServerKey;
    // if the server's keys changed, the old subscription is useless: start over
    if (current && uint8ToBase64Url(current) !== key) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) {
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }
  return sub;
}

/**
 * Asks for permission and subscribes. MUST be called straight from a tap handler:
 * iOS ignores permission prompts that do not come from a user gesture, so there is
 * deliberately no `await` before requestPermission().
 */
export async function enablePush(settings) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  const sub = await getOrCreateSubscription();
  const state = await api.subscribe(sub.toJSON(), {
    ...settings,
    enabled: true,
    pushEnabled: true,
    tz: deviceTimeZone(),
  });
  return { permission, state };
}

/** On every app start: if permission is already granted, make sure the server has our subscription. */
export async function syncSubscription(settings) {
  if (!pushSupported() || Notification.permission !== 'granted') return null;
  const sub = await getOrCreateSubscription();
  return api.subscribe(sub.toJSON(), { ...settings, tz: deviceTimeZone() });
}

export async function disablePush() {
  if (pushSupported()) {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  }
  return api.unsubscribe();
}
