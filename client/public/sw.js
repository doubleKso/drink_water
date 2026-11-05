// Service worker: receives push messages from the server and shows them as notifications.
// Plain JavaScript on purpose (no build step), served from the site root so it controls the whole app.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  // iOS requires that EVERY push shows a notification, otherwise the subscription gets revoked.
  const title = data.title || '💧 ရေသောက်ချိန်ရောက်ပြီ';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'ရေတစ်ခွက် သောက်လိုက်ပါဦးနော်',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'water-reminder', // a new reminder replaces the unread old one
      renotify: true,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({ type: 'refresh' });
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
