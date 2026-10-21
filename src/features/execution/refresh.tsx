'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
// Refresh only visible, idle pages so the Now/Next card and status pills stay current.
// Five minutes: the live timer ticks on the client, and every refresh is a full server render.
const REFRESH_MS = 300000;
export function ExecutionRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        !document.querySelector('details[open]') &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(
          document.activeElement?.tagName ?? '',
        )
      )
        router.refresh();
    }, REFRESH_MS);
    const onFocus = () => {
      if (!document.querySelector('details[open]')) router.refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [router]);
  return null;
}
