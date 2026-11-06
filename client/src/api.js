import { getDeviceId } from './device.js';

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const error = new Error(detail.error || res.statusText);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

const me = () => getDeviceId();

export const api = {
  vapidKey: () => request('GET', '/vapid-public-key'),
  state: () => request('GET', `/state/${me()}`),
  drink: (amountMl, occurredAt, eventId) => request('POST', `/drink/${me()}`, { amountMl, occurredAt, eventId }),
  undo: () => request('POST', `/undo/${me()}`),
  saveSettings: (settings) => request('PUT', `/settings/${me()}`, settings),
  subscribe: (subscription, settings) => request('POST', `/subscribe/${me()}`, { subscription, settings }),
  unsubscribe: () => request('POST', `/unsubscribe/${me()}`),
  test: () => request('POST', `/test/${me()}`),
  telegramLink: (role) => request('POST', `/telegram-link/${me()}`, { role }),
  disconnectTelegram: (role) => request('DELETE', `/telegram/${me()}/${role}`),
  testTelegram: (role) => request('POST', `/telegram-test/${me()}/${role}`),
};
