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
      <span className="live-dot" aria-hidden="true" />
      {h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`}
    </time>
  );
}

/**
 * Time left to a target, with a thin bar that fills as it passes (WI-060: the running session
 * on Today reads like a small Focus). "Time is up" once the target passes; nothing completes.
 */
export function LiveCountdown({
  startedAt,
  target,
}: {
  startedAt: string;
  target: string;
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
  const start = +new Date(startedAt),
    end = +new Date(target),
    total = Math.max(1, Math.round((end - start) / 60000)),
    left = Math.max(0, Math.floor((end - now) / 1000)),
    h = Math.floor(left / 3600),
    m = Math.floor((left % 3600) / 60),
    s = left % 60,
    fraction = Math.min(1, Math.max(0, (now - start) / (end - start || 1)));
  return (
    <div className="live-countdown" suppressHydrationWarning>
      <time
        className="live-timer launcher-timer"
        aria-live="off"
        suppressHydrationWarning
      >
        <span className="live-dot" aria-hidden="true" />
        {left === 0
          ? 'Time is up'
          : h > 0
            ? `${h}:${pad(m)}:${pad(s)}`
            : `${m}:${pad(s)}`}
      </time>
      <span className="live-countdown-of">
        {left === 0 ? `${total} min` : `left of ${total} min`}
      </span>
      <span
        className="live-countdown-bar"
        role="progressbar"
        aria-label="Session time used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
      >
        <i style={{ width: `${fraction * 100}%` }} />
      </span>
    </div>
  );
}
