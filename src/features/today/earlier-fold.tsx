'use client';
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Earlier, folded (WI-077): one line that opens the settled rows. The rows stay mounted while
 * hidden, so a chip for a folded block can still open that block's details.
 */
export function EarlierFold({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="agenda-earlier-fold">
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
      <div id={id} hidden={!open} className="agenda-earlier-rows">
        {children}
      </div>
    </div>
  );
}
