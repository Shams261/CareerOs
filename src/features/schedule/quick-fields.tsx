'use client';
import { useRef, useState } from 'react';

/** The kinds a quick block offers as chips; any other kind is typed under More (WI-066). */
const KINDS = [
  { value: 'DSA', label: 'DSA' },
  { value: 'SYSTEM_DESIGN', label: 'System design' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'JOB_SEARCH', label: 'Job search' },
  { value: 'OTHER', label: 'Other' },
] as const;
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
 * A block in four answers (WI-066): what, which kind, when, how long. The kind chips fill the
 * category, a duration chip sets the end from the start, and the end stays editable.
 */
export function QuickBlockFields({
  defaultStart,
  defaultEnd,
}: {
  defaultStart: string;
  defaultEnd: string;
}) {
  const [kind, setKind] = useState<string>('DSA');
  const start = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLInputElement>(null);
  const [length, setLength] = useState<number | null>(
    toMinutes(defaultEnd) - toMinutes(defaultStart),
  );
  const fit = (minutes: number) => {
    if (!start.current || !end.current) return;
    end.current.value = toClock(toMinutes(start.current.value) + minutes);
    setLength(minutes);
  };
  return (
    <>
      <label>
        Title
        <input
          name="title"
          required
          maxLength={160}
          placeholder="Arrays: two pointers"
        />
      </label>
      <fieldset className="quick-kinds">
        <legend>Kind</legend>
        <input type="hidden" name="category" value={kind} />
        <div className="template-chips">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              className={`template-chip${kind === k.value ? ' is-on' : ''}`}
              aria-pressed={kind === k.value}
              onClick={() => setKind(k.value)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <label>
          Start time
          <input
            ref={start}
            required
            type="time"
            name="startLocal"
            defaultValue={defaultStart}
            onChange={() => length && fit(length)}
          />
        </label>
        <label>
          End time
          <input
            ref={end}
            required
            type="time"
            name="endLocal"
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
