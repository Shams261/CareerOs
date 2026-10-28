'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Header utilities behind one labelled More button at every width (WI-063). */
export function UtilityMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  // Closes on Escape and on a click outside, like the other menus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
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
    <div ref={box} className={`today-utils${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="button secondary small today-utils-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        More
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="disclosure-chevron"
        />
      </button>
      {/* Choosing an item (it opens a panel or a form) closes the menu. */}
      <div
        id={id}
        className="today-utils-items"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, a')) setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
