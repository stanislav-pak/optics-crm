self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'Уведомление', body: '', url: '/' };
  try {
    if (event.data) data = { url: '/', ...event.data.json() };
  } catch (_) {}

  event.waitUntil(
    (async () => {
      // 1. Бейдж — сначала, до показа уведомления (именно этот порядок работал)
      try {
        const badgeCount = data.badge_count || 1;
        if ('setAppBadge' in self.registration) {
          self.registration.setAppBadge(badgeCount);
        }
      } catch (_) {}

      // 2. Показываем уведомление — iOS воспроизводит системный звук именно здесь
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/apple-touch-icon-v2.png',
        badge: '/favicon-96x96.png',
        tag: `msg-${Date.now()}`,
        data: { url: data.url || '/' },
      });

      // 3. Сообщаем открытым вкладкам сыграть звук (foreground-случай, fire-and-forget)
      clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) =>
          clientList.forEach((client) =>
            client.postMessage({ type: 'PUSH_RECEIVED', title: data.title, body: data.body }),
          ),
        );
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if ('clearAppBadge' in self.registration) {
    self.registration.clearAppBadge();
  }
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
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
