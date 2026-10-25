'use client';
import { useEffect } from 'react';

/** Tells the server a Silsila page is visible, at most every two minutes (WI-028). */
export function PresenceBeat() {
  useEffect(() => {
    let last = 0;
    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - last < 120_000) return;
      last = Date.now();
      void fetch('/api/presence', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
      }).catch(() => undefined);
    };
    beat();
    const timer = setInterval(beat, 30_000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', beat);
    };
  }, []);
  return null;
}
