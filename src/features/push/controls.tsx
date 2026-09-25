'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { subscribeAction, testPushAction, unsubscribeAction } from './actions';

type State = 'checking' | 'unsupported' | 'install' | 'denied' | 'off' | 'on';
const toKey = (base64: string) => {
  const raw = atob(
    (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
      .replace(/-/g, '+')
      .replace(/_/g, '/'),
  );
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Some engines never settle service-worker or push calls (e.g. without a secure context); never hang the UI.
const withTimeout = <T,>(work: Promise<T>, ms = 5000) =>
  Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timed out')), ms),
    ),
  ]);
// Remembered per device so push APIs are only touched after the owner opts in here.
const FLAG = 'careeros.push-enabled';
const remembered = (value?: boolean) => {
  try {
    if (value === true) localStorage.setItem(FLAG, '1');
    else if (value === false) localStorage.removeItem(FLAG);
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
};
const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true;

/** Explicit, one-device-at-a-time Web Push controls. Permission is requested only on click. */
export function PushControls({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>('checking');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const registration = () =>
    navigator.serviceWorker.register('/sw.js', { scope: '/' });
  useEffect(() => {
    (async () => {
      if (
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      )
        return setState(isIos() && !standalone() ? 'install' : 'unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      if (Notification.permission !== 'granted' || !remembered())
        return setState('off');
      const sub = await withTimeout(
        registration().then((r) => r.pushManager.getSubscription()),
      );
      setState(remembered(!!sub) ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, []);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch {
      setMessage(
        'Something went wrong. Check that the site is open over HTTPS and try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  const enable = () =>
    act(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return setMessage('Permission was not granted.');
      }
      const reg = await withTimeout(registration());
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toKey(publicKey),
        }));
      const r = await subscribeAction({
        ...sub.toJSON(),
        label: navigator.userAgent.slice(0, 120),
      });
      setMessage(r.message);
      if (r.ok) {
        remembered(true);
        setState('on');
      }
    });
  const test = () =>
    act(async () => {
      const sub = await withTimeout(
        registration().then((r) => r.pushManager.getSubscription()),
      );
      if (!sub) {
        remembered(false);
        return setState('off');
      }
      setMessage((await testPushAction(sub.endpoint)).message);
    });
  const disable = () =>
    act(async () => {
      const sub = await withTimeout(
        registration().then((r) => r.pushManager.getSubscription()),
      );
      if (sub) {
        const r = await unsubscribeAction(sub.endpoint);
        await sub.unsubscribe();
        setMessage(r.message);
      }
      remembered(false);
      setState('off');
    });
  const status = {
    checking: 'Checking this browser…',
    unsupported: 'Not supported in this browser.',
    install:
      'On iPhone/iPad, add CareerOS to the Home Screen (Share → Add to Home Screen), open it from there, then enable notifications.',
    denied:
      'Blocked for this site. Allow notifications in the browser or system settings, then reload.',
    off: 'Not enabled on this device.',
    on: 'Enabled on this device.',
  }[state];
  return (
    <div>
      <p>
        <strong>This device:</strong> {status}
      </p>
      <div className="actions">
        {state === 'off' && (
          <Button onClick={enable} disabled={busy}>
            Enable notifications
          </Button>
        )}
        {state === 'on' && (
          <>
            <Button onClick={test} disabled={busy}>
              Send test notification
            </Button>
            <Button className="secondary" onClick={disable} disabled={busy}>
              Disable this device
            </Button>
          </>
        )}
      </div>
      <p className="muted mt-3" role="status">
        {message}
      </p>
    </div>
  );
}
