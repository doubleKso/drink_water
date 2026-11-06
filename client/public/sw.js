// PWA worker: push notifications, offline app shell and queued drink sync.
const CACHE = 'water-reminder-v3';
const DB_NAME = 'water-reminder-offline';
const STORE_NAME = 'drink-queue';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});

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

async function queuedDrinks() {
  const db = await openQueue();
  const items = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => a.queuedAt - b.queuedAt));
    request.onerror = () => reject(request.error);
  });
  db.close();
  return items;
}

async function deleteQueuedDrink(eventId) {
  const db = await openQueue();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(eventId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function syncDrinks() {
  let changed = false;
  for (const item of await queuedDrinks()) {
    const response = await fetch(`/api/drink/${item.deviceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountMl: item.amountMl, occurredAt: item.occurredAt, eventId: item.eventId }),
    });
    if (response.ok || (response.status >= 400 && response.status < 500)) {
      await deleteQueuedDrink(item.eventId);
      changed = true;
      continue;
    }
    throw new Error('drink sync failed');
  }
  if (changed) {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach((client) => client.postMessage({ type: 'refresh', synced: true }));
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-water-drinks') event.waitUntil(syncDrinks());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'clear-reminders') {
    event.waitUntil(
      self.registration.getNotifications({ tag: 'water-reminder' })
        .then((notifications) => notifications.forEach((notification) => notification.close())),
    );
  }
  if (event.data?.type === 'sync-drinks') event.waitUntil(syncDrinks());
  if (event.data?.type === 'set-badge') {
    const count = Number(event.data.count) || 0;
    if (count > 0) self.navigator.setAppBadge?.(count);
    else self.navigator.clearAppBadge?.();
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || '💧 ရေသောက်ချိန်ရောက်ပြီ';
  event.waitUntil((async () => {
    const remaining = Number(data.remainingCups) || 0;
    if (remaining > 0) await self.navigator.setAppBadge?.(remaining);
    else await self.navigator.clearAppBadge?.();
    await self.registration.showNotification(title, {
      body: data.body || 'ရေတစ်ခွက် သောက်လိုက်ပါဦးနော်',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'water-reminder',
      renotify: true,
      data: { url: data.url || '/' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        client.postMessage({ type: 'refresh' });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
