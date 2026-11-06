import { save } from './store.js';
import { sendTelegram, telegramConfigured } from './telegram.js';

export function noDrinkAlertMessage() {
  return '💙 ဒီနေ့ ရေသောက်ထားတာ မမှတ်ရသေးဘူးနော်။ အဆင်ပြေရဲ့လားလို့ ဂရုစိုက်ပြီး သတိပေးတာပါ။';
}

/** Sends the consent-based owner check-in at most once for a local date. */
export async function maybeSendNoDrinkAlert(
  device,
  { date, totalMl },
  sender = sendTelegram,
) {
  const shouldSend =
    totalMl === 0 &&
    !device.noDrinkAlerts[date] &&
    device.settings.telegramNoDrinkAlertEnabled &&
    telegramConfigured() &&
    device.telegram?.owner;
  if (!shouldSend) return { sent: false };

  const result = await sender(device.telegram.owner.chatId, noDrinkAlertMessage());
  if (result.ok) {
    device.noDrinkAlerts[date] = Date.now();
    save();
    return { sent: true };
  }
  return { sent: false, error: result.error };
}
