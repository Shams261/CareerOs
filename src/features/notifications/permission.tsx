'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
export function NotificationPermission() {
  const [message, setMessage] = useState(
    'Browser alerts are optional. Background push delivery is not enabled in WI-001.',
  );
  async function enable() {
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        setMessage('This browser does not support notifications.');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setMessage(
          'Permission was not granted. You can change it in browser settings.',
        );
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      await registration.showNotification('CareerOS is ready', {
        body: 'Permission granted. Scheduled reminders are saved in your in-app inbox.',
      });
      setMessage(
        'Permission granted. Reminders remain in-app until Web Push is configured.',
      );
    } catch {
      setMessage(
        'Unable to enable notifications. Use HTTPS or localhost and check browser settings.',
      );
    }
  }
  return (
    <div>
      <Button onClick={enable}>Enable browser permission</Button>
      <p className="muted mt-3" role="status">
        {message}
      </p>
    </div>
  );
}
