'use client';
import { useRef, useState } from 'react';

const DURATIONS = [20, 30, 45, 60] as const;
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toClock = (minutes: number) => {
  const m = Math.min(minutes, 23 * 60 + 59);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Two times and a row of length chips (WI-067): a chip sets the end from the start, and both
 * fields stay editable. Used where a panel asks for a time range (Log time, Edit this day).
 */
export function TimeLengthFields({
  startName,
  endName,
  startLabel,
  endLabel,
  defaultStart,
  defaultEnd,
}: {
  startName: string;
  endName: string;
  startLabel: string;
  endLabel: string;
  defaultStart: string;
  defaultEnd: string;
}) {
  const start = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLInputElement>(null);
  const initial = toMinutes(defaultEnd) - toMinutes(defaultStart);
  const [length, setLength] = useState<number | null>(
    (DURATIONS as readonly number[]).includes(initial) ? initial : null,
  );
  const fit = (minutes: number) => {
    if (!start.current || !end.current) return;
    end.current.value = toClock(toMinutes(start.current.value) + minutes);
    setLength(minutes);
  };
  return (
    <>
      <div className="form-grid">
        <label>
          {startLabel}
          <input
            ref={start}
            required
            type="time"
            name={startName}
            defaultValue={defaultStart}
            onChange={() => length && fit(length)}
          />
        </label>
        <label>
          {endLabel}
          <input
            ref={end}
            required
            type="time"
            name={endName}
            defaultValue={defaultEnd}
            onChange={() => setLength(null)}
          />
        </label>
      </div>
      <fieldset className="quick-kinds">
        <legend>Length</legend>
        <div className="template-chips">
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={`template-chip${length === d ? ' is-on' : ''}`}
              aria-pressed={length === d}
              onClick={() => fit(d)}
            >
              {d} min
            </button>
          ))}
        </div>
      </fieldset>
    </>
  );
}
