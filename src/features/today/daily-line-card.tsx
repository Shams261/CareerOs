'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RefreshCw } from 'lucide-react';
import { dailyQuote, greeting, type DayPart } from './daily-line';

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
 * The greeting and the day's quotation on Today's header (WI-073, ADR-028). "Another" shows the
 * next quotation of the same part of the day; nothing is written.
 */
export function DailyLine({
  day,
  part,
  name,
}: {
  day: string;
  part: DayPart;
  name: string | null;
}) {
  const enabled = useDailyLineEnabled();
  const [offset, setOffset] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  // The header's tint belongs to the line: switched off, it goes too.
  useEffect(() => {
    const head = root.current?.closest<HTMLElement>('.today-head');
    if (!head) return;
    if (enabled) head.setAttribute('data-part', part);
    else head.removeAttribute('data-part');
  }, [enabled, part]);
  const quote = dailyQuote(day, part, offset);
  return (
    <div className="daily-line" data-part={part} ref={root} hidden={!enabled}>
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
          <RefreshCw size={13} aria-hidden="true" />
        </button>
      </p>
    </div>
  );
}
