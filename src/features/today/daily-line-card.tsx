'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSecondTick } from '@/lib/clock-tick';
import { RefreshCw } from 'lucide-react';
import { clockLabel, dailyQuote, greeting, type DayPart } from './daily-line';

/** The daily line can be switched off per browser (Settings → Appearance), like the shortcuts. */
export const DAILY_LINE_KEY = 'silsila-daily-line';
const listeners = new Set<() => void>();
const read = () => {
  try {
    return localStorage.getItem(DAILY_LINE_KEY) !== 'off';
  } catch {
    return true;
  }
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener('storage', fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', fn);
  };
};
export const useDailyLineEnabled = () =>
  useSyncExternalStore(subscribe, read, () => true);

export function DailyLineToggle({
  label = 'On',
  className = 'check',
}: {
  label?: string;
  className?: string;
}) {
  const enabled = useDailyLineEnabled();
  return (
    <label className={className}>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => {
          try {
            if (e.target.checked) localStorage.removeItem(DAILY_LINE_KEY);
            else localStorage.setItem(DAILY_LINE_KEY, 'off');
          } catch {
            // Storage unavailable: the line simply stays on.
          }
          for (const fn of listeners) fn();
        }}
      />
      {label}
    </label>
  );
}

/**
 * The band at the top of Today (WI-073, WI-075, ADR-028): the greeting large, the day's
 * quotation under it, and a live clock on the right, on the part of the day's tint. "Another"
 * shows the next quotation of the same part; nothing is written. Switched off in Settings, the
 * whole band goes.
 */
export function DailyLine({
  day,
  part,
  name,
  zone,
  dateLabel,
}: {
  day: string;
  part: DayPart;
  name: string | null;
  zone: string;
  /** "Thursday · 29 October", the band's eyebrow (WI-076). */
  dateLabel: string;
}) {
  const enabled = useDailyLineEnabled();
  const [offset, setOffset] = useState(0);
  const now = useSecondTick();
  const root = useRef<HTMLElement>(null);
  // While the band shows the date, the header's own date line steps aside (WI-076).
  useEffect(() => {
    const head = root.current?.closest<HTMLElement>('.today-head, .home-head');
    if (!head) return;
    if (enabled) head.setAttribute('data-band', 'on');
    else head.removeAttribute('data-band');
  }, [enabled]);
  const quote = dailyQuote(day, part, offset);
  return (
    <section
      ref={root}
      className="daily-band"
      data-part={part}
      hidden={!enabled}
      aria-label="Today's greeting"
    >
      <div className="daily-band-text">
        <p className="daily-eyebrow">{dateLabel}</p>
        <p className="daily-greeting">{greeting(part, name)}</p>
        <p className="daily-quote" key={quote.text}>
          <q>{quote.text}</q>
          <span className="daily-by"> — {quote.by}</span>
          <button
            type="button"
            className="link-button daily-another"
            onClick={() => setOffset((o) => o + 1)}
            aria-label="Another quotation"
          >
            <RefreshCw size={14} aria-hidden="true" />
          </button>
        </p>
      </div>
      <div className="daily-band-clock">
        <time className="daily-clock" suppressHydrationWarning>
          {clockLabel(now, zone)}
        </time>
        <span className="daily-part">{part}</span>
      </div>
    </section>
  );
}
