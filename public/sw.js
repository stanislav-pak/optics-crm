self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'NewLine';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' }
  };

  event.waitUntil(
    (async () => {
      // Устанавливаем badge — в отдельном try/catch чтобы не сломать уведомление
      if (data.badge_count !== undefined) {
        try {
          await self.registration.setAppBadge(data.badge_count);
        } catch (e) {
          // iOS не поддерживает — игнорируем
        }
      }
      // Показываем уведомление всегда
      await self.registration.showNotification(title, options);
    })()
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
