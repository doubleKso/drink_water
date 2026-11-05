// Tiny JSON-file store. Plenty for one person (or a handful of devices).
//
// Shape of db.json:
// {
//   devices: {
//     "<deviceId>": {
//       id, createdAt,
//       subscription: { endpoint, keys: { p256dh, auth } } | null,
//       settings: { enabled, start, end, intervalMin, goalMl, cupSizeMl, ... },
//       lastSentAt: epoch ms | 0,
//       log: { "YYYY-MM-DD": [{ at: epoch ms, ml: number }, ...] }
//     }
//   }
// }

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const MAX_DEVICES = Number(process.env.MAX_DEVICES || 50);
const KEEP_DAYS = 90;

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  pushEnabled: true,
  start: '09:00',
  end: '17:30',
  intervalMin: 60,
  goalMl: 2000,
  cupSizeMl: 250,
  skipWeekends: true,
  telegramReminderEnabled: true,
  telegramGoalAlertEnabled: true,
  tz: 'Asia/Yangon',
});

fs.mkdirSync(DATA_DIR, { recursive: true });

let db = { devices: {} };
try {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} catch {
  // first run or unreadable file: start fresh
}
if (!db.devices || typeof db.devices !== 'object') db.devices = {};

function normalizeDevice(device) {
  let changed = false;
  const current = device.settings && typeof device.settings === 'object' ? device.settings : {};
  const legacyGoal = Number(current.goal);
  const cupSizeMl = Number.isInteger(current.cupSizeMl) ? current.cupSizeMl : DEFAULT_SETTINGS.cupSizeMl;
  const goalMl = Number.isInteger(current.goalMl)
    ? current.goalMl
    : Number.isInteger(legacyGoal) && legacyGoal > 0
      ? legacyGoal * cupSizeMl
      : DEFAULT_SETTINGS.goalMl;
  const settings = { ...DEFAULT_SETTINGS, ...current, cupSizeMl, goalMl };
  if ('goal' in settings) delete settings.goal;
  if (JSON.stringify(settings) !== JSON.stringify(current)) changed = true;
  device.settings = settings;

  if (!device.log || typeof device.log !== 'object') {
    device.log = {};
    changed = true;
  }
  for (const [date, entries] of Object.entries(device.log)) {
    if (!Array.isArray(entries)) {
      device.log[date] = [];
      changed = true;
      continue;
    }
    device.log[date] = entries.flatMap((entry) => {
      if (Number.isFinite(entry)) {
        changed = true;
        return [{ at: entry, ml: cupSizeMl }];
      }
      if (
        entry &&
        typeof entry === 'object' &&
        Number.isFinite(entry.at) &&
        Number.isInteger(entry.ml) &&
        entry.ml > 0
      ) {
        return [{ at: entry.at, ml: entry.ml }];
      }
      changed = true;
      return [];
    });
  }

  if (!device.telegram || typeof device.telegram !== 'object') {
    device.telegram = {};
    changed = true;
  }
  for (const role of ['reminder', 'owner']) {
    if (!(role in device.telegram)) {
      device.telegram[role] = null;
      changed = true;
    }
  }
  if (!device.telegram.pendingLinks || typeof device.telegram.pendingLinks !== 'object') {
    device.telegram.pendingLinks = {};
    changed = true;
  }
  if (!device.goalAlerts || typeof device.goalAlerts !== 'object') {
    device.goalAlerts = {};
    changed = true;
  }
  return changed;
}

let migrated = false;
for (const device of Object.values(db.devices)) migrated = normalizeDevice(device) || migrated;

export function save() {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE); // atomic replace so a crash can't corrupt the file
}

if (migrated) save();

export function isValidDeviceId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(id);
}

export function getDevice(id) {
  const device = db.devices[id];
  if (device && normalizeDevice(device)) save();
  return device;
}

/** Returns the device, creating it on first use. Returns null if the device cap is reached. */
export function ensureDevice(id) {
  let device = db.devices[id];
  if (device) {
    if (normalizeDevice(device)) save();
    return device;
  }
  if (Object.keys(db.devices).length >= MAX_DEVICES) return null;
  device = {
    id,
    createdAt: Date.now(),
    subscription: null,
    settings: { ...DEFAULT_SETTINGS },
    lastSentAt: 0,
    log: {},
    telegram: { reminder: null, owner: null, pendingLinks: {} },
    goalAlerts: {},
  };
  db.devices[id] = device;
  save();
  return device;
}

export function allDevices() {
  return Object.values(db.devices).map((device) => {
    normalizeDevice(device);
    return device;
  });
}

export function recordDrink(device, dateKey, amountMl = device.settings.cupSizeMl, ts = Date.now()) {
  (device.log[dateKey] ||= []).push({ at: ts, ml: amountMl });
  // prune old days so the file stays tiny
  const keys = Object.keys(device.log).sort();
  while (keys.length > KEEP_DAYS) {
    const oldDate = keys.shift();
    delete device.log[oldDate];
    delete device.goalAlerts[oldDate];
  }
  save();
}

/** Removes the most recent drink of the given day. Returns true if something was removed. */
export function undoDrink(device, dateKey) {
  const list = device.log[dateKey];
  if (!list || list.length === 0) return false;
  list.pop();
  save();
  return true;
}

export function createTelegramLinkToken(device, role, now = Date.now()) {
  if (!['reminder', 'owner'].includes(role)) throw new Error('invalid Telegram role');
  const token = crypto.randomBytes(18).toString('base64url');
  device.telegram.pendingLinks[role] = { token, expiresAt: now + 15 * 60_000 };
  save();
  return token;
}

/** Resolves a one-time Telegram link token and stores only safe chat metadata. */
export function consumeTelegramLinkToken(token, chat, now = Date.now()) {
  for (const device of allDevices()) {
    for (const role of ['reminder', 'owner']) {
      const pending = device.telegram.pendingLinks[role];
      if (!pending || pending.token !== token || pending.expiresAt < now) continue;
      device.telegram[role] = {
        chatId: String(chat.id),
        name: chat.name || 'Telegram',
        linkedAt: now,
      };
      // Do not send a reminder immediately after the user finishes linking the bot.
      if (role === 'reminder') device.lastSentAt = now;
      delete device.telegram.pendingLinks[role];
      save();
      return { device, role };
    }
  }
  return null;
}

export function disconnectTelegram(device, role) {
  if (!['reminder', 'owner'].includes(role)) return false;
  device.telegram[role] = null;
  delete device.telegram.pendingLinks[role];
  save();
  return true;
}

/** Test helper: replace the in-memory db without touching disk. */
export function __resetForTests(next = { devices: {} }) {
  db = next;
}
