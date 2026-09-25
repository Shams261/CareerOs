// CareerOS service worker: push display and click routing only.
// No application-data caching: PostgreSQL remains the source of truth.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
);

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' ? data.title : 'CareerOS';
  const body =
    typeof data.body === 'string' ? data.body : 'You have a CareerOS reminder.';
  // Only same-origin relative paths are opened.
  const url =
    typeof data.url === 'string' && /^\/(?![/\\])/.test(data.url)
      ? data.url
      : '/today';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.url ?? '/today';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const client of list)
          if (
            new URL(client.url).origin === self.location.origin &&
            'focus' in client
          ) {
            client.navigate(target);
            return client.focus();
          }
        return self.clients.openWindow(target);
      }),
  );
});
