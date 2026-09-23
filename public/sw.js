// No application-data caching: PostgreSQL remains the source of truth.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/today'));
});
// Push transport can later call showNotification here after subscription support is added.
