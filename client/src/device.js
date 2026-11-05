// Each phone gets a random id the first time the app opens. The server keys all data on it,
// so there are no accounts or passwords. Treat the id like a private link.

const KEY = 'water-reminder-device-id';

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // randomUUID only exists on https / localhost, so fall back for plain-http LAN testing
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getDeviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // storage blocked: use an id that lasts until the page is closed
    return (getDeviceId.fallback ||= randomId());
  }
}
