'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
// Refresh only visible, idle pages so the Now/Next card and status pills stay current.
// Five minutes: the live timer ticks on the client, and every refresh is a full server render.
const REFRESH_MS = 300000;
/** An open side panel (WI-020) or an open details element holds the refresh. */
const busy = () =>
  document.documentElement.hasAttribute('data-panel-open') ||
  !!document.querySelector('details[open]');
export function ExecutionRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        !busy() &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(
          document.activeElement?.tagName ?? '',
        )
      )
        router.refresh();
    }, REFRESH_MS);
    const onFocus = () => {
      if (!busy()) router.refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [router]);
  return null;
}
