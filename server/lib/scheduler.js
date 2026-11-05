import { allDevices, save } from './store.js';
import { localParts, parseHM } from './time.js';
import { lastDrinkTimestamp, totalForDate } from './stats.js';
import { buildReminder } from './messages.js';
import { sendPush } from './push.js';
import { sendTelegram, telegramConfigured } from './telegram.js';

let running = false;

/**
 * Decides whether a device is due a reminder right now.
 * Rules:
 *  - only while the device has push + reminders enabled
 *  - only inside the working window (start..end, in her timezone)
 *  - not once today's goal is reached
 *  - at least `intervalMin` since the last reminder OR the last time she drank,
 *    so drinking on her own pushes the next reminder back instead of nagging
 */
export function isDue(device, now) {
  const s = device.settings;
  const pushReady = device.subscription && s.pushEnabled;
  const telegramReady = telegramConfigured() && device.telegram?.reminder && s.telegramReminderEnabled;
  if ((!pushReady && !telegramReady) || !s.enabled) return false;

  const { date, minutes } = localParts(now, s.tz);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (s.skipWeekends && (weekday === 0 || weekday === 6)) return false;
  if (minutes < parseHM(s.start) || minutes > parseHM(s.end)) return false;

  const totalMl = totalForDate(device, date);
  if (totalMl >= s.goalMl) return false;

  const reference = Math.max(device.lastSentAt || 0, lastDrinkTimestamp(device));
  const waitedMs = now.getTime() - reference;
  return waitedMs >= s.intervalMin * 60_000 - 20_000; // 20s slack for tick jitter
}

export function reminderPayload(device, now) {
  const { date } = localParts(now, device.settings.tz);
  const totalMl = totalForDate(device, date);
  const { title, body } = buildReminder({
    totalMl,
    goalMl: device.settings.goalMl,
    isFirstOfDay: totalMl === 0,
  });
  return { title, body, tag: 'water-reminder', url: '/' };
}

/** One scheduler pass. `sender` is injectable so tests don't hit the network. */
export async function tick(now = new Date(), sender = sendPush, telegramSender = sendTelegram) {
  if (running) return; // previous pass still going, skip rather than double-send
  running = true;
  try {
    for (const device of allDevices()) {
      if (!isDue(device, now)) continue;

      const payload = reminderPayload(device, now);
      let delivered = false;

      if (device.subscription && device.settings.pushEnabled) {
        const result = await sender(device.subscription, payload);
        if (result.ok) {
          delivered = true;
        } else if (result.gone) {
          console.log(`[scheduler] subscription for ${device.id.slice(0, 8)} is gone, removing`);
          device.subscription = null;
        } else {
          // temporary failure: keep the subscription and try again next minute
          console.warn(`[scheduler] push failed for ${device.id.slice(0, 8)}:`, result.error?.statusCode || result.error?.message);
        }
      }

      if (telegramConfigured() && device.telegram?.reminder && device.settings.telegramReminderEnabled) {
        const result = await telegramSender(
          device.telegram.reminder.chatId,
          `${payload.title}\n\n${payload.body}`,
        );
        delivered = result.ok || delivered;
        if (!result.ok) console.warn(`[scheduler] Telegram failed for ${device.id.slice(0, 8)}:`, result.error?.message);
      }

      if (delivered) device.lastSentAt = now.getTime();
      save();
    }
  } finally {
    running = false;
  }
}

/** Runs tick() on every minute boundary. */
export function startScheduler() {
  const run = () => tick().catch((e) => console.error('[scheduler]', e));
  const untilNextMinute = 60_000 - (Date.now() % 60_000) + 500;
  setTimeout(() => {
    run();
    setInterval(run, 60_000);
  }, untilNextMinute);
  console.log('[scheduler] started');
}
