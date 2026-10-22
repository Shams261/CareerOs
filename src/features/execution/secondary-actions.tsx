'use client';
import { useState, type ReactNode } from 'react';
import { Ellipsis } from 'lucide-react';

/**
 * The block's secondary actions (Complete, Skip, Cancel). On a desktop they show inline;
 * on a phone they sit behind a toggle so each block leads with one button. With `always`
 * they sit behind a labelled More button at every width (the agenda rows, WI-020).
 */
export function SecondaryActions({
  children,
  title,
  always = false,
}: {
  children: ReactNode;
  title: string;
  always?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`button secondary${always ? ' small exec-more-always' : ' exec-more-toggle'}`}
        aria-expanded={open}
        aria-label={`More actions for ${title}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Ellipsis size={18} aria-hidden="true" />
      </button>
      <div
        className={`exec-secondary${open ? ' is-open' : ''}${always ? ' is-always' : ''}`}
      >
        {children}
      </div>
    </>
  );
}

/** Skip asks for its reason only after Skip is chosen (WI-020). */
export function SkipStep({
  title,
  small = false,
}: {
  title: string;
  small?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button
        type="button"
        className={`button secondary${small ? ' small' : ''}`}
        onClick={() => setAsking(true)}
      >
        Skip<span className="sr-only">: {title}</span>
      </button>
    );
  return (
    <span className="skip-step">
      <input
        className="reason"
        name="reason"
        maxLength={300}
        aria-label="Skip reason (optional)"
        placeholder="Skip reason (optional)"
        autoFocus
      />
      <button
        className={`button secondary${small ? ' small' : ''}`}
        name="action"
        value="skip"
      >
        Skip block<span className="sr-only">: {title}</span>
      </button>
      <button
        type="button"
        className="link-button"
        onClick={() => setAsking(false)}
      >
        Keep
      </button>
    </span>
  );
}
