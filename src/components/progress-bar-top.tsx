'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * A 2 px bar at the top of the page while something is on its way (WI-017): a navigation,
 * a filter or section change, or a server action. Anything may call `startProgress` and
 * must pair it with `stopProgress`; a URL change clears everything, and a 10 s guard
 * keeps a lost pair from leaving the bar on screen.
 */
let active = 0;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version += 1;
  for (const fn of listeners) fn();
};
export function startProgress() {
  active += 1;
  emit();
}
export function stopProgress() {
  active = Math.max(0, active - 1);
  emit();
}
const clearProgress = () => {
  active = 0;
  emit();
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const snapshot = () => (active > 0 ? version : 0);

export function NavigationProgress() {
  const on = useSyncExternalStore(subscribe, snapshot, () => 0) > 0;
  const pathname = usePathname();
  const params = useSearchParams();
  const url = `${pathname}?${params.toString()}`;
  const seen = useRef(url);
  // A finished navigation ends the bar whatever started it.
  useEffect(() => {
    if (seen.current !== url) {
      seen.current = url;
      clearProgress();
    }
  }, [url]);
  // Internal links start the bar on click; the URL change above ends it.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const a = (event.target as HTMLElement | null)?.closest('a[href]');
      if (!a || a.getAttribute('target') === '_blank') return;
      const href = a.getAttribute('href') ?? '';
      if (!href.startsWith('/') || href.startsWith('//')) return;
      if (href.split('#')[0] === url.split('#')[0].replace(/\?$/, '')) return;
      startProgress();
      setTimeout(stopProgress, 10000);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [url]);
  return (
    <div
      className={`nav-progress${on ? ' is-on' : ''}`}
      role="progressbar"
      aria-label="Loading"
      aria-hidden={!on}
    />
  );
}
