'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Ellipsis } from 'lucide-react';

/**
 * The "⋯" menu for a row's less-used actions (WI-063): a labelled button and a short list that
 * opens below it. The items stay in the DOM (and inside any form around the menu), so a submit
 * button in it still submits that form. Escape, a click outside, or choosing an item closes it.
 */
export function MoreMenu({
  label,
  children,
}: {
  /** The button's accessible name, e.g. "More for Consistent hashing". */
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    const onClick = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);
  return (
    <div ref={box} className={`more-menu${open ? ' is-open' : ''}`}>
      <button
        ref={button}
        type="button"
        className="button secondary small more-menu-toggle"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      <div
        id={id}
        className="more-menu-items"
        hidden={!open}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, a')) setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
