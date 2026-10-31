/* Background Web Push & Notification Click Handler for Trade With Amith */
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Trade With Amith',
    body: 'New XAUUSD update available in your terminal.',
    icon: './pwa-192x192.png?v=twa3',
    badge: './pwa-192x192.png?v=twa3',
    url: './index.html',
    tag: 'twa-alert',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = {
        title: parsed.title || payload.title,
        body: parsed.body || parsed.message || payload.body,
        icon: parsed.icon || payload.icon,
        badge: parsed.badge || payload.badge,
        url: parsed.url || parsed.buttonUrl || payload.url,
        tag: parsed.tag || payload.tag,
      };
    } catch {
      try {
        const text = event.data.text();
        if (text) payload.body = text;
      } catch {
        // Ignore malformed payload
      }
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon,
    badge: payload.badge,
    tag: payload.tag,
    renotify: true,
    vibrate: [180, 80, 180],
    data: {
      url: payload.url || './index.html',
    },
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data && event.notification.data.url) || './index.html';
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            if ('navigate' in client) {
              return client.navigate(targetUrl).then(() => client.focus());
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
