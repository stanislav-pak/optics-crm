const SW_VERSION = 'v3-badge';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch (e) {}
  const badgeCount = data.badge_count;

  const title = data.title || 'NewLine';

  event.waitUntil(
    Promise.all([
      typeof badgeCount === 'number' && 'setAppBadge' in self.registration
        ? self.registration.setAppBadge(badgeCount).catch(() => {})
        : Promise.resolve(),
      self.registration.showNotification(title, {
        body: data.body || '',
        icon: data.icon || '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: data.url || '/' }
      })
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'clearBadge') {
    self.registration.getNotifications().then((ns) => ns.forEach((n) => n.close()));
  }
});
