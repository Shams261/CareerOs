'use client';
import { useEffect, useSyncExternalStore } from 'react';

type Sentinel = { release: () => Promise<void>; released: boolean };
type WakeLockApi = { request: (type: 'screen') => Promise<Sentinel> };

const api = () =>
  typeof navigator === 'undefined'
    ? undefined
    : (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock;

const noop = () => () => undefined;
/** Whether this browser offers the Screen Wake Lock API (false during server render). */
export function useWakeLockSupported() {
  return useSyncExternalStore(
    noop,
    () => !!api(),
    () => false,
  );
}

/**
 * Keeps the screen on while `enabled`. The browser drops the lock whenever the page is hidden,
 * so it is asked for again when the page becomes visible. Failures are silent: the screen may
 * simply dim as usual (iOS Home Screen apps are to be checked on a device).
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    const wakeLock = api();
    if (!enabled || !wakeLock) return;
    let sentinel: Sentinel | null = null;
    let active = true;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || !active) return;
      try {
        sentinel = await wakeLock.request('screen');
        if (!active) void sentinel.release();
      } catch {
        sentinel = null;
      }
    };
    const onVisible = () => {
      if (!sentinel || sentinel.released) void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel && !sentinel.released) void sentinel.release();
    };
  }, [enabled]);
}
