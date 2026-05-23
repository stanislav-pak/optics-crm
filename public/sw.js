self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'Уведомление', body: '' };
  try {
    if (event.data) data = event.data.json();
  } catch (_) {}

  event.waitUntil(
    self.registration.getNotifications().then((notifications) => {
      const count = notifications.length + 1;
      // setAppBadge: supported on iOS 16.4+ PWA and modern Android
      if ('setAppBadge' in self.navigator) self.navigator.setAppBadge(count);
      return self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/apple-touch-icon-v2.png',
        badge: '/favicon-96x96.png',
        vibrate: [200, 100, 200],
        tag: `msg-${Date.now()}`,
        renotify: true,
        data,
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if ('clearAppBadge' in self.navigator) self.navigator.clearAppBadge();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    }),
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
