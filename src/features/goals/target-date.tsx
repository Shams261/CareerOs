'use client';
import { useRef, useState } from 'react';
import { QUICK_PICKS, quickTargets } from './horizon';

/** The device's date; the owner's device is in the owner's zone. */
const localToday = () => new Intl.DateTimeFormat('en-CA').format(new Date());

/**
 * The goal's date with quick picks (WI-064): In 2 days, This week, This month, or any date in
 * the field. A pick only fills the field, so the form still submits one `targetDate`.
 */
export function TargetDateField({ defaultValue }: { defaultValue: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <fieldset className="target-date">
      <legend>By</legend>
      <div className="template-chips target-picks">
        {QUICK_PICKS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`template-chip${picked === p.key ? ' is-on' : ''}`}
            aria-pressed={picked === p.key}
            onClick={() => {
              if (!input.current) return;
              input.current.value = quickTargets(localToday())[p.key];
              setPicked(p.key);
            }}
          >
            {p.text}
          </button>
        ))}
        <input
          ref={input}
          name="targetDate"
          type="date"
          defaultValue={defaultValue}
          aria-label="Target date"
          onChange={() => setPicked(null)}
        />
      </div>
    </fieldset>
  );
}
