'use client';
import { useState, useTransition } from 'react';
import type { ActionState } from '@/lib/action-state';

/** The style chips (WI-100): a radio row that saves on choice, like the theme switch. */
export function StyleSwitch({
  style,
  action,
  options,
}: {
  style: string;
  action: (f: FormData) => Promise<void>;
  options: [string, string][];
}) {
  return (
    <form action={action} className="theme-switch" aria-label="Style">
      {options.map(([value, word]) => (
        <label key={value} className={style === value ? 'is-on' : ''}>
          <input
            type="radio"
            name="style"
            value={value}
            defaultChecked={style === value}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          />
          {word}
        </label>
      ))}
      <noscript>
        <button className="button secondary small">Save</button>
      </noscript>
    </form>
  );
}

/** The switch for notes from conversations: saves on change, says what it did. */
export function MemoryToggle({
  enabled,
  action,
}: {
  enabled: boolean;
  action: (state: ActionState, f: FormData) => Promise<ActionState>;
}) {
  const [on, setOn] = useState(enabled);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <label className="check rumi-toggle">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          const f = new FormData();
          if (next) f.set('enabled', 'on');
          start(async () => {
            const r = await action({ message: '' }, f);
            setMessage(r.message);
            if (!r.ok) setOn(!next);
          });
        }}
      />
      {on ? 'On' : 'Off'}
      {message && (
        <span className="muted rumi-toggle-note" role="status">
          {' '}
          · {message}
        </span>
      )}
    </label>
  );
}
