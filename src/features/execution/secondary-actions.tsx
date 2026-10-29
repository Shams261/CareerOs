'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Ellipsis } from 'lucide-react';

/**
 * The block's secondary actions (Complete, Skip, Cancel). On a desktop they show inline;
 * on a phone they sit behind a toggle so each block leads with one button. With `always`
 * they sit behind a labelled More button at every width (the agenda rows, WI-020) and open
 * as a menu under it (WI-071), stacked, so the row never widens or wraps its title. Escape
 * and a click outside close the menu.
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
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open || !always) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        setOpen(false);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, always]);
  return (
    <span ref={root} className={always ? 'exec-menu' : 'exec-inline'}>
      <button
        type="button"
        className={`button secondary${always ? ' small exec-more-always' : ' exec-more-toggle'}`}
        aria-expanded={open}
        aria-haspopup={always ? 'true' : undefined}
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
    </span>
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
    <span className="skip-pop">
      <button
        type="button"
        className={`button secondary${small ? ' small' : ''}`}
        aria-expanded="true"
        onClick={() => setAsking(false)}
      >
        Skip<span className="sr-only">: {title}</span>
      </button>
      <span className="skip-popover" role="group" aria-label="Skip this block">
        <input
          className="reason"
          name="reason"
          maxLength={300}
          aria-label="Skip reason (optional)"
          placeholder="Reason (optional)"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setAsking(false);
            }
          }}
        />
        <span className="actions">
          <button className="button small" name="action" value="skip">
            Skip block<span className="sr-only">: {title}</span>
          </button>
          <button
            type="button"
            className="button secondary small"
            onClick={() => setAsking(false)}
          >
            Keep
          </button>
        </span>
      </span>
    </span>
  );
}
