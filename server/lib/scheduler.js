import { allDevices, save } from './store.js';
import { localParts, parseHM } from './time.js';
import { lastDrinkTimestamp, totalForDate } from './stats.js';
import { buildReminder } from './messages.js';
import { sendPush } from './push.js';
import { sendTelegram, telegramConfigured } from './telegram.js';
import { maybeSendNoDrinkAlert } from './no-drink-alert.js';

let running = false;

/**
 * Reminders use a rolling anchor, not a pre-created queue. A drink recorded after
 * a reminder automatically wins as the new anchor, so every old projected time
 * is effectively cancelled without needing to delete scheduled jobs.
 */
export function effectiveIntervalMinutes(device, now = null) {
  const base = device.settings.intervalMin;
  if (!now || !device.settings.adaptiveEnabled) return base;
  const { date, minutes } = localParts(now, device.settings.tz);
  if (minutes < 17 * 60) return base;

  const start = parseHM(device.settings.start);
  const end = parseHM(device.settings.end);
  const dayProgress = Math.max(0, Math.min(1, (minutes - start) / Math.max(1, end - start)));
  const waterProgress = totalForDate(device, date) / device.settings.goalMl;
  let adjusted = base;
  if (waterProgress < dayProgress - 0.2) adjusted = base * 0.7;
  else if (waterProgress > dayProgress + 0.15) adjusted = base * 1.35;
  return Math.max(15, Math.round(adjusted / 5) * 5);
}

export function nextReminderTimestamp(device, now = null) {
  const reference = Math.max(device.lastSentAt || 0, lastDrinkTimestamp(device));
  if (!reference) return 0; // first-time devices are due as soon as their window opens
  return reference + effectiveIntervalMinutes(device, now) * 60_000;
}

function isWeekend(date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function isInsideBreak(settings, minutes) {
  return settings.breakEnabled &&
    minutes >= parseHM(settings.breakStart) &&
    minutes < parseHM(settings.breakEnd);
}

function reminderKind(device, now) {
  const primaryDueAt = nextReminderTimestamp(device, now);
  if (primaryDueAt === 0 || now.getTime() >= primaryDueAt - 20_000) return 'primary';

  const lastDrinkAt = lastDrinkTimestamp(device);
  const followUpDueAt = (device.lastSentAt || 0) + device.settings.followUpMin * 60_000;
  if (
    device.settings.followUpEnabled &&
    device.lastSentAt > 0 &&
    device.followUpEligibleFor === device.lastSentAt &&
    lastDrinkAt <= device.lastSentAt &&
    device.followUpSentFor !== device.lastSentAt &&
    now.getTime() >= followUpDueAt - 20_000
  ) {
    return 'follow-up';
  }
  return null;
}

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
  if (s.skipWeekends && isWeekend(date)) return false;
  if (minutes < parseHM(s.start) || minutes > parseHM(s.end)) return false;
  if (isInsideBreak(s, minutes)) return false;

  const totalMl = totalForDate(device, date);
  if (totalMl >= s.goalMl) return false;

  return Boolean(reminderKind(device, now));
}

export function reminderPayload(device, now, kind = 'primary') {
  const { date, minutes } = localParts(now, device.settings.tz);
  const totalMl = totalForDate(device, date);
  const { title, body } = buildReminder({
    totalMl,
    goalMl: device.settings.goalMl,
    isFirstOfDay: totalMl === 0,
    isFollowUp: kind === 'follow-up',
    customMessages: device.settings.customMessages,
    minutes,
  });
  return {
    title,
    body,
    tag: 'water-reminder',
    url: '/',
    remainingCups: Math.max(0, Math.ceil((device.settings.goalMl - totalMl) / device.settings.cupSizeMl)),
  };
}

/** One scheduler pass. `sender` is injectable so tests don't hit the network. */
export async function tick(now = new Date(), sender = sendPush, telegramSender = sendTelegram) {
  if (running) return; // previous pass still going, skip rather than double-send
  running = true;
  try {
    for (const device of allDevices()) {
      const local = localParts(now, device.settings.tz);
      const ownerAlertDue =
        device.settings.telegramNoDrinkAlertEnabled &&
        local.minutes >= parseHM(device.settings.ownerNoDrinkAlertTime) &&
        !(device.settings.skipWeekends && isWeekend(local.date));
      if (ownerAlertDue) {
        const alert = await maybeSendNoDrinkAlert(
          device,
          { date: local.date, totalMl: totalForDate(device, local.date) },
          telegramSender,
        );
        if (alert.error) {
          console.warn(`[scheduler] owner check-in failed for ${device.id.slice(0, 8)}:`, alert.error?.message);
        }
      }

      if (!isDue(device, now)) continue;

      const kind = reminderKind(device, now);
      const payload = reminderPayload(device, now, kind);
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

      if (delivered && kind === 'follow-up') {
        device.followUpSentFor = device.lastSentAt;
      } else if (delivered) {
        device.lastSentAt = now.getTime();
        device.followUpEligibleFor = device.lastSentAt;
        device.followUpSentFor = 0;
      }
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
