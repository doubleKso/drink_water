import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// point the store at a throwaway folder BEFORE the modules load
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'water-test-'));
process.env.TELEGRAM_BOT_TOKEN = 'test-token';

let time, store, stats, scheduler, messages, telegram, goalAlert;
before(async () => {
  time = await import('../lib/time.js');
  store = await import('../lib/store.js');
  stats = await import('../lib/stats.js');
  scheduler = await import('../lib/scheduler.js');
  messages = await import('../lib/messages.js');
  telegram = await import('../lib/telegram.js');
  goalAlert = await import('../lib/goal-alert.js');
});

const NOON = new Date('2026-11-05T05:30:00Z'); // 12:00 in Asia/Yangon (UTC+6:30)

function makeDevice(id, overrides = {}) {
  const device = store.ensureDevice(id);
  device.subscription = { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'a', auth: 'b' } };
  device.settings = { ...store.DEFAULT_SETTINGS, ...overrides };
  device.log = {};
  device.lastSentAt = 0;
  return device;
}

test('localParts converts to the right local date and time', () => {
  assert.deepEqual(time.localParts(NOON, 'Asia/Yangon'), { date: '2026-11-05', minutes: 12 * 60 });
  // 18:00 UTC is already the next day in Myanmar
  const late = time.localParts(new Date('2026-11-05T18:00:00Z'), 'Asia/Yangon');
  assert.equal(late.date, '2026-11-06');
  assert.equal(late.minutes, 30);
});

test('time validators', () => {
  assert.ok(time.isHM('09:30'));
  assert.ok(!time.isHM('9:30'));
  assert.ok(!time.isHM('24:00'));
  assert.ok(time.isValidTimeZone('Asia/Yangon'));
  assert.ok(!time.isValidTimeZone('Not/AZone'));
  assert.equal(time.shiftDate('2026-03-01', -1), '2026-02-28');
});

test('isDue follows the window, goal and interval rules', () => {
  store.__resetForTests();
  const d = makeDevice('aaaaaaaa-aaaa-aaaa-aaaa-000000000001');
  assert.ok(scheduler.isDue(d, NOON), 'due at noon with no history');

  const early = new Date('2026-11-05T02:00:00Z'); // 08:30 local, before 09:00
  assert.ok(!scheduler.isDue(d, early), 'not before the window opens');

  const night = new Date('2026-11-05T12:00:00Z'); // 18:30 local, after 17:30
  assert.ok(!scheduler.isDue(d, night), 'not after the window closes');

  d.lastSentAt = NOON.getTime() - 30 * 60_000;
  assert.ok(!scheduler.isDue(d, NOON), 'not when the last reminder was 30 min ago');
  d.lastSentAt = NOON.getTime() - 61 * 60_000;
  assert.ok(scheduler.isDue(d, NOON), 'due again after the interval');

  // drinking on her own resets the clock
  store.recordDrink(d, '2026-11-05', 250, NOON.getTime() - 10 * 60_000);
  assert.ok(!scheduler.isDue(d, NOON), 'recent drink delays the reminder');

  // goal reached means no more reminders today
  d.log['2026-11-05'] = Array.from({ length: 8 }, () => ({ at: NOON.getTime() - 3 * 3600_000, ml: 250 }));
  d.lastSentAt = 0;
  assert.ok(!scheduler.isDue(d, NOON), 'goal reached, no reminder');

  d.settings.enabled = false;
  d.log = {};
  assert.ok(!scheduler.isDue(d, NOON), 'disabled device is never due');
  d.settings.enabled = true;
  d.settings.pushEnabled = false;
  assert.ok(!scheduler.isDue(d, NOON), 'explicitly disabled push is not a reminder channel');
});

test('isDue can skip Saturday and Sunday in the device timezone', () => {
  store.__resetForTests();
  const d = makeDevice('aaaaaaaa-aaaa-aaaa-aaaa-000000000011', { skipWeekends: true });
  const saturdayNoon = new Date('2026-11-07T05:30:00Z');
  assert.ok(!scheduler.isDue(d, saturdayNoon));
  d.settings.skipWeekends = false;
  assert.ok(scheduler.isDue(d, saturdayNoon));
});

test('tick sends once, respects the interval, and drops dead subscriptions', async () => {
  store.__resetForTests();
  const d = makeDevice('aaaaaaaa-aaaa-aaaa-aaaa-000000000002');
  const sent = [];
  const okSender = async (sub, payload) => {
    sent.push(payload);
    return { ok: true };
  };

  await scheduler.tick(NOON, okSender);
  const mine = sent.length;
  assert.ok(mine >= 1);
  assert.equal(d.lastSentAt, NOON.getTime());

  const before = sent.length;
  await scheduler.tick(new Date(NOON.getTime() + 60_000), okSender);
  const stillMine = sent.filter((p) => p.body.includes('0/2,000 ml')).length;
  assert.equal(sent.length, before, 'no second reminder one minute later');
  assert.ok(stillMine >= 1);

  const d2 = makeDevice('aaaaaaaa-aaaa-aaaa-aaaa-000000000003');
  await scheduler.tick(NOON, async () => ({ ok: false, gone: true }));
  assert.equal(d2.subscription, null, 'a 410/404 removes the subscription');
});

test('state: streak counts consecutive finished days', () => {
  store.__resetForTests();
  const d = makeDevice('aaaaaaaa-aaaa-aaaa-aaaa-000000000004', { goalMl: 500 });
  d.log['2026-11-03'] = [{ at: 1, ml: 250 }, { at: 2, ml: 250 }];
  d.log['2026-11-04'] = [{ at: 1, ml: 300 }, { at: 2, ml: 300 }];
  d.log['2026-11-05'] = [{ at: 1, ml: 250 }];

  let state = stats.buildState(d, NOON);
  assert.equal(state.count, 1);
  assert.equal(state.totalMl, 250);
  assert.equal(state.streak, 2, 'unfinished today does not break the streak');

  d.log['2026-11-05'].push({ at: 2, ml: 250 });
  state = stats.buildState(d, NOON);
  assert.equal(state.streak, 3, 'finishing today extends it');
  assert.equal(state.week.length, 7);
  assert.equal(state.week.at(-1).date, '2026-11-05');
});

test('undoDrink removes only the latest entry', () => {
  store.__resetForTests();
  const d = makeDevice('aaaaaaaa-aaaa-aaaa-aaaa-000000000005');
  store.recordDrink(d, '2026-11-05', 250, 1);
  store.recordDrink(d, '2026-11-05', 350, 2);
  assert.ok(store.undoDrink(d, '2026-11-05'));
  assert.deepEqual(d.log['2026-11-05'], [{ at: 1, ml: 250 }]);
  assert.ok(store.undoDrink(d, '2026-11-05'));
  assert.ok(!store.undoDrink(d, '2026-11-05'));
});

test('reminder text includes progress and adapts near the goal', () => {
  const first = messages.buildReminder({ totalMl: 0, goalMl: 2000, isFirstOfDay: true, random: () => 0 });
  assert.match(first.body, /0\/2,000 ml/);
  const last = messages.buildReminder({ totalMl: 1750, goalMl: 2000, random: () => 0 });
  assert.match(last.body, /1,750\/2,000 ml/);
});

test('Telegram deep link binds the expected chat and role only once', async () => {
  store.__resetForTests();
  const d = makeDevice('aaaaaaaa-aaaa-aaaa-aaaa-000000000006');
  const token = store.createTelegramLinkToken(d, 'reminder');
  const replies = [];
  const handled = await telegram.handleTelegramUpdate(
    {
      message: {
        text: `/start ${token}`,
        chat: { id: 12345, first_name: 'Mya', username: 'mya_water' },
      },
    },
    async (chatId, text) => {
      replies.push({ chatId, text });
      return { ok: true };
    },
  );
  assert.ok(handled);
  assert.equal(d.telegram.reminder.chatId, '12345');
  assert.match(d.telegram.reminder.name, /Mya/);
  assert.ok(d.lastSentAt > 0, 'linking starts the reminder interval from now');
  assert.equal(replies.length, 1);
  assert.equal(store.consumeTelegramLinkToken(token, { id: 9 }), null, 'link token is one-time');
});

test('Telegram can be the only reminder channel', async () => {
  store.__resetForTests();
  const d = makeDevice('aaaaaaaa-aaaa-aaaa-aaaa-000000000007');
  d.subscription = null;
  d.telegram.reminder = { chatId: '777', name: 'Reminder chat' };
  const messagesSent = [];
  assert.ok(scheduler.isDue(d, NOON));
  await scheduler.tick(
    NOON,
    async () => {
      throw new Error('push sender should not run');
    },
    async (chatId, text) => {
      messagesSent.push({ chatId, text });
      return { ok: true };
    },
  );
  assert.equal(messagesSent.length, 1);
  assert.equal(messagesSent[0].chatId, '777');
  assert.equal(d.lastSentAt, NOON.getTime());
});

test('goal completion alerts the owner once per local date', async () => {
  store.__resetForTests();
  const d = makeDevice('aaaaaaaa-aaaa-aaaa-aaaa-000000000008', { goalMl: 2000 });
  d.telegram.owner = { chatId: '888', name: 'Owner' };
  const sent = [];
  const sender = async (chatId, text) => {
    sent.push({ chatId, text });
    return { ok: true };
  };

  const first = await goalAlert.maybeSendGoalAlert(
    d,
    { date: '2026-11-05', beforeMl: 1750, afterMl: 2000 },
    sender,
  );
  const duplicate = await goalAlert.maybeSendGoalAlert(
    d,
    { date: '2026-11-05', beforeMl: 1750, afterMl: 2000 },
    sender,
  );
  assert.ok(first.sent);
  assert.ok(!duplicate.sent);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, '888');
  assert.match(sent[0].text, /ဒီနေ့ ရေပန်းတိုင် ပြည့်ပြီ/);
});

test('legacy cup logs migrate to ml without losing history', () => {
  const id = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000009';
  store.__resetForTests({
    devices: {
      [id]: {
        id,
        settings: { enabled: true, start: '09:00', end: '17:30', intervalMin: 60, goal: 8, tz: 'Asia/Yangon' },
        subscription: null,
        lastSentAt: 0,
        log: { '2026-11-05': [1, 2] },
      },
    },
  });
  const d = store.ensureDevice(id);
  assert.equal(d.settings.goalMl, 2000);
  assert.deepEqual(d.log['2026-11-05'], [{ at: 1, ml: 250 }, { at: 2, ml: 250 }]);
  assert.equal(stats.buildState(d, NOON).totalMl, 500);
});
