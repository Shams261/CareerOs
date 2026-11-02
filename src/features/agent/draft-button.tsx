'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AGENT_NAME } from '@/features/agent/constants';
import { draftWeekAction } from './actions';

/** Weekly review → Next week (WI-107): Rumi drafts the week as plan cards, one per day. */
export function DraftWeekButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="draft-week">
      <button
        type="button"
        className="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await draftWeekAction();
            if (r.ok) router.push(r.href);
            else setError(r.message);
          })
        }
      >
        {pending
          ? `${AGENT_NAME} is drafting next week…`
          : `Draft next week with ${AGENT_NAME}`}
      </button>
      {error && (
        <p className="form-message" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
