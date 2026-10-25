// Silsila service worker: push display, click routing and the opened stamp (R3).
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
  const title = typeof data.title === 'string' ? data.title : 'Silsila';
  const body =
    typeof data.body === 'string' ? data.body : 'You have a Silsila reminder.';
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
  // Records that this reminder was opened (once, owner-scoped on the server). Never blocks
  // opening the app; the test notification has no row and is skipped.
  const id = event.notification.tag;
  const opened =
    id && id !== 'test'
      ? fetch('/api/notifications/opened', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        }).catch(() => undefined)
      : Promise.resolve();
  // Opening the app runs at once, in parallel: openWindow must stay inside the click's activation.
  const show = self.clients
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
    });
  event.waitUntil(Promise.all([show, opened]));
});
