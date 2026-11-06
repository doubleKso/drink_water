import { getDeviceId } from './device.js';

const DB_NAME = 'water-reminder-offline';
const STORE_NAME = 'drink-queue';

function openQueue() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'eventId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(mode, action) {
  return openQueue().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = action(store);
    tx.oncomplete = () => {
      db.close();
      resolve(result?.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  }));
}

export function newDrinkEvent(amountMl, occurredAt) {
  const random = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    eventId: random.replace(/[^A-Za-z0-9_-]/g, ''),
    deviceId: getDeviceId(),
    amountMl,
    occurredAt,
    queuedAt: Date.now(),
  };
}

export async function queueDrink(event) {
  await transaction('readwrite', (store) => store.put(event));
  try {
    const registration = await navigator.serviceWorker?.ready;
    await registration?.sync?.register('sync-water-drinks');
  } catch {
    // iOS may not expose Background Sync; the app's online event is the fallback.
  }
}

export async function flushDrinkQueue() {
  if (!navigator.onLine) return null;
  const db = await openQueue();
  const items = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => a.queuedAt - b.queuedAt));
    request.onerror = () => reject(request.error);
  });
  db.close();

  let lastState = null;
  for (const item of items) {
    let response;
    try {
      response = await fetch(`/api/drink/${item.deviceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountMl: item.amountMl,
          occurredAt: item.occurredAt,
          eventId: item.eventId,
        }),
      });
    } catch {
      break;
    }
    if (response.ok) {
      lastState = await response.json();
      await transaction('readwrite', (store) => store.delete(item.eventId));
    } else if (response.status >= 400 && response.status < 500) {
      // A permanently invalid item must not block all newer drinks forever.
      await transaction('readwrite', (store) => store.delete(item.eventId));
    } else {
      break;
    }
  }
  return lastState;
}
