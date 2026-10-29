'use client';
import { useRef, useState } from 'react';

/** The kinds a block offers as chips; another stored kind shows as its own chip (WI-066). */
const KINDS = [
  { value: 'DSA', label: 'DSA' },
  { value: 'SYSTEM_DESIGN', label: 'System design' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'JOB_SEARCH', label: 'Job search' },
  { value: 'OTHER', label: 'Other' },
] as const;
/** Lengths a block is planned in (WI-068): half an hour to an hour and a half. */
export const BLOCK_LENGTHS = [30, 45, 60, 90] as const;

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const toClock = (minutes: number) => {
  const m = Math.min(minutes, 23 * 60 + 59);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const lengthLabel = (minutes: number) =>
  minutes < 60
    ? `${minutes} min`
    : minutes % 60
      ? `${minutes / 60} hours`
      : `${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
const kindLabel = (value: string) =>
  KINDS.find((k) => k.value === value)?.label ??
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

/**
 * A block in a few answers (WI-066, WI-068): what, which kind, when and how long, and a note.
 * The kind chips fill the category, a length chip sets the end from the start, and the end
 * stays editable for any other length. Adding and editing a block use the same fields.
 */
export function QuickBlockFields({
  defaultTitle = '',
  defaultKind = 'DSA',
  defaultStart,
  defaultEnd,
  defaultNote = '',
}: {
  defaultTitle?: string;
  defaultKind?: string;
  defaultStart: string;
  defaultEnd: string;
  defaultNote?: string;
}) {
  const [kind, setKind] = useState<string>(defaultKind);
  const kinds = KINDS.some((k) => k.value === defaultKind)
    ? KINDS.map((k) => k.value as string)
    : [...KINDS.map((k) => k.value as string), defaultKind];
  return (
    <>
      <label>
        Title
        <input
          name="title"
          required
          maxLength={160}
          defaultValue={defaultTitle}
          placeholder="Arrays: two pointers"
        />
      </label>
      <fieldset className="quick-kinds">
        <legend>Kind</legend>
        <input type="hidden" name="category" value={kind} />
        <div className="template-chips">
          {kinds.map((value) => (
            <button
              key={value}
              type="button"
              className={`template-chip${kind === value ? ' is-on' : ''}`}
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
            >
              {kindLabel(value)}
            </button>
          ))}
        </div>
      </fieldset>
      <LengthFields
        startName="startLocal"
        endName="endLocal"
        startLabel="Start time"
        endLabel="End time"
        defaultStart={defaultStart}
        defaultEnd={defaultEnd}
        lengths={BLOCK_LENGTHS}
      />
      <label>
        Note (optional)
        <input
          name="description"
          maxLength={1000}
          defaultValue={defaultNote}
          placeholder="What this block is for"
        />
      </label>
    </>
  );
}

/**
 * Two times and a row of length chips: a chip sets the end from the start, a new start keeps
 * the chosen length, and the end stays editable (WI-067). Log time and blocks use it.
 */
export function LengthFields({
  startName,
  endName,
  startLabel,
  endLabel,
  defaultStart,
  defaultEnd,
  lengths,
}: {
  startName: string;
  endName: string;
  startLabel: string;
  endLabel: string;
  defaultStart: string;
  defaultEnd: string;
  lengths: readonly number[];
}) {
  const start = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLInputElement>(null);
  const initial = toMinutes(defaultEnd) - toMinutes(defaultStart);
  const [length, setLength] = useState<number | null>(
    lengths.includes(initial) ? initial : null,
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
          {lengths.map((d) => (
            <button
              key={d}
              type="button"
              className={`template-chip${length === d ? ' is-on' : ''}`}
              aria-pressed={length === d}
              onClick={() => fit(d)}
            >
              {lengthLabel(d)}
            </button>
          ))}
        </div>
      </fieldset>
    </>
  );
}
