'use client';
import { useState, type ReactNode } from 'react';
import { Ellipsis } from 'lucide-react';

/**
 * The block's secondary actions (Complete, Skip, Cancel, the skip reason). Always shown on a
 * desktop; on a phone they sit behind a "More" toggle so each block leads with one button.
 */
export function SecondaryActions({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="button secondary exec-more-toggle"
        aria-expanded={open}
        aria-label={`More actions for ${title}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      <div className={`exec-secondary${open ? ' is-open' : ''}`}>
        {children}
      </div>
    </>
  );
}
