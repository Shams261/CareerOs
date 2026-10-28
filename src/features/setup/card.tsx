'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Circle } from 'lucide-react';
import { openPanelAfterNavigation } from '@/features/command/bar';
import { hideSetupAction } from './actions';
import type { SetupStep } from './domain';

/**
 * Make Silsila yours on Today (WI-050): each step's tick comes from the owner's records; the
 * open steps go straight to the page (and panel) where they are done.
 */
export function SetupCard({
  steps,
  line,
  compact = false,
}: {
  steps: SetupStep[];
  line: string;
  /** One line until opened: the first-run card already asks for the first routine (WI-059). */
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(!compact);
  const go = (s: SetupStep) => {
    router.push(s.href);
    if (s.panel) openPanelAfterNavigation(s.href.split('#')[0], s.panel);
  };
  return (
    <section
      className="card flat setup-steps"
      aria-labelledby="make-yours-heading"
    >
      <div className="section-head">
        <h2 id="make-yours-heading">Make Silsila yours</h2>
        <span className="muted">{line}</span>
        {compact && (
          <button
            type="button"
            className="link-button"
            aria-expanded={open}
            aria-controls="make-yours-steps"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide the steps' : 'Show the steps'}
          </button>
        )}
      </div>
      <ol className="plain-list" id="make-yours-steps" hidden={!open}>
        {steps.map((s) => (
          <li key={s.key} className={`setup-step${s.done ? ' is-done' : ''}`}>
            {s.done ? (
              <Check size={16} aria-hidden="true" className="setup-icon" />
            ) : (
              <Circle size={16} aria-hidden="true" className="setup-icon" />
            )}
            <span className="setup-title">
              <span className="sr-only">{s.done ? 'Done: ' : 'To do: '}</span>
              {s.title}
            </span>
            {!s.done && (
              <button
                type="button"
                className="button secondary small"
                onClick={() => go(s)}
              >
                {s.action}
              </button>
            )}
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="link-button setup-hide"
        disabled={pending}
        onClick={() => start(() => hideSetupAction())}
      >
        Hide for now
      </button>
    </section>
  );
}
