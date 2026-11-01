'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AGENT_NAME } from '@/features/agent/domain';
import { planFromDocAction } from './actions';

/**
 * "Plan until the date" (WI-105): the doc's study order as plan cards in a new conversation
 * with Rumi; nothing is added until Add to plan there.
 */
export function PlanUntilButton({ docId }: { docId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        className="button mt-4"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await planFromDocAction(docId);
            if (r.ok) router.push(r.href);
            else setError(r.message);
          })
        }
      >
        {pending
          ? `${AGENT_NAME} is finding free hours…`
          : 'Plan until the date'}
      </button>
      {error && (
        <p className="form-message" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
