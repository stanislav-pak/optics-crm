const CACHE_NAME = 'newline-crm-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/apple-touch-icon-v2.png',
        badge: '/favicon-96x96.png',
        vibrate: [200, 100, 200],
        data: data,
        tag: 'new-message',
        renotify: true,
      }),
      self.registration.getNotifications().then((notifications) => {
        const count = notifications.length + 1;
        if ('setAppBadge' in navigator) {
          navigator.setAppBadge(count);
        }
      })
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if ('clearAppBadge' in navigator) {
    navigator.clearAppBadge();
  }

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});

self.addEventListener('notificationclose', () => {
  self.registration.getNotifications().then((notifications) => {
    if (notifications.length === 0 && 'clearAppBadge' in navigator) {
      navigator.clearAppBadge();
    }
  });
});
