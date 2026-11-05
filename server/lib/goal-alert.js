import { save } from './store.js';
import { sendTelegram, telegramConfigured } from './telegram.js';

export function goalAlertMessage(afterMl, goalMl) {
  return `🎉 ဒီနေ့ ရေပန်းတိုင် ပြည့်ပြီ!\n${afterMl.toLocaleString('en-US')} / ${goalMl.toLocaleString('en-US')} ml သောက်ပြီးပါပြီ။`;
}

/** Sends at most one owner alert per local date when progress crosses the daily goal. */
export async function maybeSendGoalAlert(
  device,
  { date, beforeMl, afterMl },
  sender = sendTelegram,
) {
  const shouldSend =
    beforeMl < device.settings.goalMl &&
    afterMl >= device.settings.goalMl &&
    !device.goalAlerts[date] &&
    device.settings.telegramGoalAlertEnabled &&
    telegramConfigured() &&
    device.telegram?.owner;
  if (!shouldSend) return { sent: false };

  const result = await sender(
    device.telegram.owner.chatId,
    goalAlertMessage(afterMl, device.settings.goalMl),
  );
  if (result.ok) {
    device.goalAlerts[date] = Date.now();
    save();
    return { sent: true };
  }
  return { sent: false, error: result.error };
}

