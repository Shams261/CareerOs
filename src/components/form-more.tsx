'use client';
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * The less-used fields of a form behind one "More" link (WI-018). The fields stay mounted
 * while hidden, so their defaults still submit and a kept draft still lands in them.
 */
export function FormMore({
  label = 'More',
  defaultOpen = false,
  children,
}: {
  label?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={`form-more${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="disclosure-link"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="disclosure-chevron"
        />
      </button>
      <div id={id} className="form-more-panel" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
