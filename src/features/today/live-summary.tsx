'use client';
import { useEffect, useState } from 'react';
import { formatDuration } from './domain';

/**
 * Today's focused minutes for the header chip (WI-065), growing like the summary line. When
 * the day's minutes went up since this tab last showed them (a Complete, a logged session),
 * the number counts up to the new value over a moment (WI-071); reduced motion shows it at once.
 */
export function LiveMinutes({
  minutes,
  running,
  renderedAt,
  day,
}: {
  minutes: number;
  running: boolean;
  renderedAt: string;
  day: string;
}) {
  const [tick, setTick] = useState({ at: renderedAt, extra: 0 });
  const [shown, setShown] = useState(minutes);
  useEffect(() => {
    const key = `silsila-focused:${day}`;
    let last = minutes;
    try {
      const kept = sessionStorage.getItem(key);
      if (kept !== null) last = Number(kept);
      sessionStorage.setItem(key, String(minutes));
    } catch {
      /* no storage: the number shows at once */
    }
    const still =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Every write happens in a frame, after paint: at once when there is nothing to count up.
    const from = last >= minutes || still ? minutes : last,
      start = performance.now(),
      length = 700;
    let frame = 0;
    const step = (t: number) => {
      const k = from === minutes ? 1 : Math.min(1, (t - start) / length);
      const eased = 1 - (1 - k) * (1 - k);
      setShown(Math.round(from + (minutes - from) * eased));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [minutes, day]);
  useEffect(() => {
    if (!running) return;
    const base = +new Date(renderedAt);
    const timer = setInterval(
      () =>
        setTick({
          at: renderedAt,
          extra: Math.max(0, Math.floor((Date.now() - base) / 60000)),
        }),
      30000,
    );
    return () => clearInterval(timer);
  }, [running, renderedAt]);
  const extra = running && tick.at === renderedAt ? tick.extra : 0;
  return <>{formatDuration(shown + extra)}</>;
}
