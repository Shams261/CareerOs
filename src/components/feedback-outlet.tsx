'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { subscribeFeedback, type Feedback } from './feedback-channel';
import { SUCCESS_VISIBLE_MS, UNDO_VISIBLE_MS, UndoButton } from './action-form';

/**
 * Shows the success message (with its Undo or link) of any `ActionForm` that broadcasts on `channel`.
 * Mount it where the list lives, not inside a row, so the message survives the row.
 */
export function FeedbackOutlet({
  channel,
  className = '',
}: {
  channel: string;
  className?: string;
}) {
  const [shown, setShown] = useState<Feedback | null>(null);
  useEffect(() => subscribeFeedback(channel, setShown), [channel]);
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(
      () => setShown((s) => (s === shown ? null : s)),
      shown.state.undo || shown.state.link
        ? UNDO_VISIBLE_MS
        : SUCCESS_VISIBLE_MS,
    );
    return () => clearTimeout(timer);
  }, [shown]);
  if (!shown) return null;
  const { state } = shown;
  return (
    <p className={`form-success ${className}`} role="status">
      <Check size={14} aria-hidden="true" />
      {state.message}
      {state.undo && (
        <UndoButton
          undo={state.undo}
          onDone={() => setShown((s) => (s === shown ? null : s))}
        />
      )}
      {state.link && (
        <Link className="link" href={state.link.href} prefetch={false}>
          {state.link.label}
        </Link>
      )}
    </p>
  );
}
