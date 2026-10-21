'use client';
import { useEffect, useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');
/** Elapsed time since `startedAt`, ticking once a second while the page is visible. */
export function LiveTimer({
  startedAt,
  className = '',
}: {
  startedAt: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    const timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  const total = Math.max(0, Math.floor((now - +new Date(startedAt)) / 1000)),
    h = Math.floor(total / 3600),
    m = Math.floor((total % 3600) / 60),
    s = total % 60;
  return (
    <time
      className={`live-timer ${className}`}
      dateTime={`PT${h}H${m}M${s}S`}
      aria-live="off"
      suppressHydrationWarning
    >
      {h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`}
    </time>
  );
}
