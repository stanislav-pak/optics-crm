self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch (e) {}

  const title = data.title || 'NewLine';
  const badgeCount = data.badge_count ?? 1; // fallback 1 если нет в payload

  // Устанавливаем badge ДО показа уведомления
  if ('setAppBadge' in self.registration) {
    self.registration.setAppBadge(badgeCount).catch(() => {});
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  try {
    self.registration.clearAppBadge();
  } catch (e) {}
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
    if ('clearAppBadge' in self.navigator) self.navigator.clearAppBadge();
    self.registration.getNotifications().then((ns) => ns.forEach((n) => n.close()));
  }
  if (event.data?.type === 'SET_BADGE') {
    const count = event.data.count;
    if ('setAppBadge' in self.navigator) {
      count > 0 ? self.navigator.setAppBadge(count) : self.navigator.setAppBadge(0);
    }
  }
});
