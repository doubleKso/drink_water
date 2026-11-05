import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { DATA_DIR } from './store.js';

// VAPID keys identify this server to the browser push services.
// Production: set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (run `npm run keys` to make a pair).
// Local dev: if unset, a pair is generated once and kept in data/vapid.json.
function loadKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const file = path.join(DATA_DIR, 'vapid.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    const keys = webpush.generateVAPIDKeys();
    fs.writeFileSync(file, JSON.stringify(keys));
    console.warn(
      '[push] No VAPID keys in env, generated data/vapid.json. On hosts with a temporary disk ' +
        'set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY instead, or existing subscriptions will break.',
    );
    return keys;
  }
}

const keys = loadKeys();
export const VAPID_PUBLIC_KEY = keys.publicKey;

// Must be a mailto: or https: URL. It is sent to the push services (Apple/Google/Mozilla)
// so they can contact you if your server misbehaves. Set your own in VAPID_SUBJECT.
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  keys.publicKey,
  keys.privateKey,
);

// Only talk to real push services, never to arbitrary URLs a client might submit.
const ALLOWED_PUSH_HOSTS = [
  'push.apple.com',
  'googleapis.com',
  'push.services.mozilla.com',
  'notify.windows.com',
];

export function isAllowedSubscription(sub) {
  if (!sub || typeof sub !== 'object') return false;
  const { endpoint, keys: k } = sub;
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false;
  if (!k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string') return false;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return ALLOWED_PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
}

/**
 * Sends one push. Resolves { ok: true } or { ok: false, gone: boolean, error }.
 * `gone` means the subscription is dead (uninstalled / permission revoked) and should be dropped.
 */
export async function sendPush(subscription, payload) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 600, // a reminder older than 10 minutes is useless, let the push service drop it
      urgency: 'high',
    });
    return { ok: true };
  } catch (error) {
    const gone = error.statusCode === 404 || error.statusCode === 410;
    return { ok: false, gone, error };
  }
}
