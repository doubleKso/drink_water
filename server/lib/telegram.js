import { consumeTelegramLinkToken, createTelegramLinkToken } from './store.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_ROOT = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : '';
let cachedUsername = process.env.TELEGRAM_BOT_USERNAME || '';

export function telegramConfigured() {
  return Boolean(BOT_TOKEN);
}

async function callTelegram(method, body, timeoutMs = 12_000) {
  if (!BOT_TOKEN) return { ok: false, error: new Error('Telegram bot is not configured') };
  try {
    const response = await fetch(`${API_ROOT}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.description || `Telegram HTTP ${response.status}`);
    }
    return { ok: true, result: data.result };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function sendTelegram(chatId, text) {
  const result = await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
  return result.ok ? { ok: true } : { ok: false, gone: false, error: result.error };
}

async function botUsername() {
  if (cachedUsername) return cachedUsername.replace(/^@/, '');
  const result = await callTelegram('getMe', {});
  if (!result.ok || !result.result?.username) throw result.error || new Error('Telegram bot username unavailable');
  cachedUsername = result.result.username;
  return cachedUsername;
}

export async function createTelegramLink(device, role) {
  if (!telegramConfigured()) throw new Error('Telegram bot is not configured');
  const username = await botUsername();
  const token = createTelegramLinkToken(device, role);
  return `https://t.me/${username}?start=${token}`;
}

function displayName(chat) {
  const fullName = [chat.first_name, chat.last_name].filter(Boolean).join(' ');
  if (chat.username && fullName) return `${fullName} (@${chat.username})`;
  if (chat.username) return `@${chat.username}`;
  return fullName || chat.title || 'Telegram';
}

/** Handles one Telegram update. Exported so the linking flow can be unit-tested. */
export async function handleTelegramUpdate(update, sender = sendTelegram) {
  const message = update?.message;
  if (!message?.chat || typeof message.text !== 'string') return false;
  const match = message.text.trim().match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]+))?$/);
  if (!match) return false;

  const token = match[1];
  if (!token) {
    await sender(
      String(message.chat.id),
      '💧 Water Reminder app ထဲက Telegram ချိတ်မယ် ခလုတ်ကို နှိပ်ပြီး ဒီ bot ကို ပြန်ဖွင့်ပေးပါနော်။',
    );
    return true;
  }

  const linked = consumeTelegramLinkToken(token, {
    id: message.chat.id,
    name: displayName(message.chat),
  });
  if (!linked) {
    await sender(
      String(message.chat.id),
      'ဒီချိတ်ဆက် link က သက်တမ်းကုန်သွားပါပြီ။ App ထဲကနေ link အသစ် ပြန်ဖွင့်ပေးပါနော်။',
    );
    return true;
  }

  const confirmation = linked.role === 'reminder'
    ? '✅ ရေသောက် reminder backup ကို ဒီ Telegram ဆီ ပို့ပေးပါမယ်။'
    : '✅ ဒီနေ့ ရေပန်းတိုင်ပြည့်တဲ့အချိန် ဒီ Telegram ဆီ အသိပေးပါမယ်။';
  await sender(String(message.chat.id), confirmation);
  return true;
}

let polling = false;
let updateOffset = 0;

async function pollOnce() {
  const result = await callTelegram(
    'getUpdates',
    { offset: updateOffset, timeout: 25, allowed_updates: ['message'] },
    32_000,
  );
  if (!result.ok) throw result.error;
  for (const update of result.result || []) {
    updateOffset = Math.max(updateOffset, Number(update.update_id) + 1);
    await handleTelegramUpdate(update);
  }
}

export function startTelegramBot() {
  if (!telegramConfigured()) {
    console.log('[telegram] TELEGRAM_BOT_TOKEN not set; Telegram features are disabled');
    return;
  }
  if (polling) return;
  polling = true;
  console.log('[telegram] bot polling started');

  const loop = async () => {
    if (!polling) return;
    try {
      await pollOnce();
      setTimeout(loop, 100);
    } catch (error) {
      console.warn('[telegram] polling failed:', error?.message || error);
      setTimeout(loop, 5_000);
    }
  };
  loop();
}

