'use client';
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Header utilities: inline on wide screens, behind a labelled More button under 1100 px. */
export function UtilityMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`today-utils${open ? ' is-open' : ''}`}>
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
      <div id={id} className="today-utils-items">
        {children}
      </div>
    </div>
  );
}
