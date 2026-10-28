'use client';
import { useTransition } from 'react';
import { dismissNudgesCardAction } from './actions';

export function DismissNudgesCard() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="link-button"
      disabled={pending}
      onClick={() => start(() => dismissNudgesCardAction())}
    >
      Dismiss
    </button>
  );
}
