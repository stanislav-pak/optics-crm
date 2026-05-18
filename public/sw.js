self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.getNotifications().then((notifications) => {
      const count = notifications.length + 1;
      if ('setAppBadge' in navigator) navigator.setAppBadge(count);
      return self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/apple-touch-icon-v2.png',
        badge: '/favicon-96x96.png',
        vibrate: [200, 100, 200],
        tag: `msg-${Date.now()}`,
        data,
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if ('clearAppBadge' in navigator) navigator.clearAppBadge();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'clearBadge') {
    if ('clearAppBadge' in navigator) navigator.clearAppBadge();
    self.registration.getNotifications().then(n => n.forEach(n => n.close()));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_BADGE') {
    const count = event.data.count;
    if ('setAppBadge' in self.registration) {
      count > 0
        ? self.registration.setAppBadge(count)
        : self.registration.setAppBadge(0);
    }
  }
});

