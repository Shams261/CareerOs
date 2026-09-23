'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
// Refresh only visible, idle pages. This updates display; it never schedules reminders.
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
    }, 60000);
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
