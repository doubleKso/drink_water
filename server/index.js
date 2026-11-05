import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import {
  DEFAULT_SETTINGS,
  disconnectTelegram,
  ensureDevice,
  isValidDeviceId,
  recordDrink,
  save,
  undoDrink,
} from './lib/store.js';
import { isHM, isValidTimeZone, localParts, parseHM } from './lib/time.js';
import { buildState, totalForDate } from './lib/stats.js';
import { isAllowedSubscription, sendPush, VAPID_PUBLIC_KEY } from './lib/push.js';
import { reminderPayload, startScheduler } from './lib/scheduler.js';
import { TITLE } from './lib/messages.js';
import {
  createTelegramLink,
  sendTelegram,
  startTelegramBot,
  telegramConfigured,
} from './lib/telegram.js';
import { maybeSendGoalAlert } from './lib/goal-alert.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

// ---- helpers -------------------------------------------------------------

/** Loads the device named in :id (creating it on first visit) or answers with an error. */
function withDevice(handler) {
  return async (req, res) => {
    const { id } = req.params;
    if (!isValidDeviceId(id)) return res.status(400).json({ error: 'bad device id' });
    const device = ensureDevice(id);
    if (!device) return res.status(503).json({ error: 'device limit reached' });
    return handler(req, res, device);
  };
}

function sanitizeSettings(input = {}, current = DEFAULT_SETTINGS) {
  const next = { ...current };
  if (typeof input.enabled === 'boolean') next.enabled = input.enabled;
  if (typeof input.pushEnabled === 'boolean') next.pushEnabled = input.pushEnabled;
  if (isHM(input.start)) next.start = input.start;
  if (isHM(input.end)) next.end = input.end;
  if (parseHM(next.start) >= parseHM(next.end)) {
    next.start = current.start;
    next.end = current.end;
  }
  const interval = Number(input.intervalMin);
  if (Number.isInteger(interval) && interval >= 15 && interval <= 240) next.intervalMin = interval;
  const goalMl = Number(input.goalMl);
  if (Number.isInteger(goalMl) && goalMl >= 250 && goalMl <= 10_000) next.goalMl = goalMl;
  const cupSizeMl = Number(input.cupSizeMl);
  if (Number.isInteger(cupSizeMl) && cupSizeMl >= 50 && cupSizeMl <= 2000) next.cupSizeMl = cupSizeMl;
  if (typeof input.skipWeekends === 'boolean') next.skipWeekends = input.skipWeekends;
  if (typeof input.telegramReminderEnabled === 'boolean') {
    next.telegramReminderEnabled = input.telegramReminderEnabled;
  }
  if (typeof input.telegramGoalAlertEnabled === 'boolean') {
    next.telegramGoalAlertEnabled = input.telegramGoalAlertEnabled;
  }
  if (isValidTimeZone(input.tz)) next.tz = input.tz;
  return next;
}

function isTelegramRole(role) {
  return role === 'reminder' || role === 'owner';
}

// ---- API -----------------------------------------------------------------

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/vapid-public-key', (_req, res) => res.json({ key: VAPID_PUBLIC_KEY }));

app.get('/api/state/:id', withDevice((_req, res, device) => res.json(buildState(device))));

app.put(
  '/api/settings/:id',
  withDevice((req, res, device) => {
    device.settings = sanitizeSettings(req.body, device.settings);
    save();
    res.json(buildState(device));
  }),
);

app.post(
  '/api/subscribe/:id',
  withDevice((req, res, device) => {
    const { subscription, settings } = req.body || {};
    if (!isAllowedSubscription(subscription)) {
      return res.status(400).json({ error: 'invalid push subscription' });
    }
    const wasSubscribed = Boolean(device.subscription);
    device.subscription = {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    };
    if (settings) device.settings = sanitizeSettings(settings, device.settings);
    // start the reminder clock from now so the first reminder is not instant
    if (!wasSubscribed) device.lastSentAt = Date.now();
    save();
    res.json(buildState(device));
  }),
);

app.post(
  '/api/unsubscribe/:id',
  withDevice((_req, res, device) => {
    device.subscription = null;
    device.settings.pushEnabled = false;
    save();
    res.json(buildState(device));
  }),
);

app.post(
  '/api/drink/:id',
  withDevice(async (req, res, device) => {
    const { date } = localParts(new Date(), device.settings.tz);
    const requestedMl = Number(req.body?.amountMl);
    const amountMl = Number.isInteger(requestedMl) && requestedMl >= 50 && requestedMl <= 2000
      ? requestedMl
      : device.settings.cupSizeMl;
    const beforeMl = totalForDate(device, date);
    recordDrink(device, date, amountMl);
    const afterMl = beforeMl + amountMl;

    const alert = await maybeSendGoalAlert(device, { date, beforeMl, afterMl });
    if (alert.error) {
      console.warn(`[telegram] goal alert failed for ${device.id.slice(0, 8)}:`, alert.error?.message);
    }
    res.json(buildState(device));
  }),
);

app.post(
  '/api/undo/:id',
  withDevice((_req, res, device) => {
    const { date } = localParts(new Date(), device.settings.tz);
    undoDrink(device, date);
    res.json(buildState(device));
  }),
);

app.post(
  '/api/test/:id',
  withDevice(async (_req, res, device) => {
    if (!device.subscription) return res.status(409).json({ error: 'not subscribed' });
    const payload = { ...reminderPayload(device, new Date()), title: `${TITLE} (စမ်းသပ်မှု)` };
    const result = await sendPush(device.subscription, payload);
    if (result.gone) {
      device.subscription = null;
      save();
      return res.status(410).json({ error: 'subscription expired, enable reminders again' });
    }
    if (!result.ok) return res.status(502).json({ error: 'push service rejected the message' });
    res.json({ ok: true });
  }),
);

app.post(
  '/api/telegram-link/:id',
  withDevice(async (req, res, device) => {
    const { role } = req.body || {};
    if (!isTelegramRole(role)) return res.status(400).json({ error: 'invalid Telegram role' });
    if (!telegramConfigured()) return res.status(503).json({ error: 'Telegram bot is not configured' });
    try {
      res.json({ url: await createTelegramLink(device, role) });
    } catch (error) {
      console.warn('[telegram] could not create link:', error?.message);
      res.status(502).json({ error: 'Telegram bot is unavailable' });
    }
  }),
);

app.delete(
  '/api/telegram/:id/:role',
  withDevice((req, res, device) => {
    if (!isTelegramRole(req.params.role)) return res.status(400).json({ error: 'invalid Telegram role' });
    disconnectTelegram(device, req.params.role);
    res.json(buildState(device));
  }),
);

app.post(
  '/api/telegram-test/:id/:role',
  withDevice(async (req, res, device) => {
    const { role } = req.params;
    if (!isTelegramRole(role)) return res.status(400).json({ error: 'invalid Telegram role' });
    const connection = device.telegram?.[role];
    if (!connection) return res.status(409).json({ error: 'Telegram is not connected' });
    const text = role === 'reminder'
      ? '💧 Telegram backup reminder အလုပ်လုပ်ပါတယ်။ ရေလေး သောက်လိုက်ပါဦးနော်။'
      : '🎉 ပန်းတိုင်ပြည့်တဲ့ အသိပေးစာကို ဒီ Telegram ဆီ ပို့ပေးပါမယ်။';
    const result = await sendTelegram(connection.chatId, text);
    if (!result.ok) return res.status(502).json({ error: 'Telegram message failed' });
    res.json({ ok: true });
  }),
);

app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

// ---- serve the built React app (single deploy) -----------------------------

const dist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(
    express.static(dist, {
      setHeaders(res, filePath) {
        // the service worker and html must always be revalidated so updates reach the phone
        if (/(sw\.js|index\.html|manifest\.webmanifest)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  console.warn('[server] client/dist not found. Run `npm run build` first (or use the Vite dev server).');
}

// ---- go ------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  startScheduler();
  startTelegramBot();
});
