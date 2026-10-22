import type { ActionState } from '@/features/schedule/actions';

/**
 * A tiny in-page channel between an `ActionForm` and a `FeedbackOutlet` (WI-014).
 * A row's form often unmounts with the row it just removed or completed, taking its
 * success message and Undo with it. A form that names a channel publishes its result
 * here before React commits the refreshed page, and the outlet, mounted outside the
 * row, shows the message for as long as the form would have.
 */
export type Feedback = { id: number; state: ActionState };
type Listener = (f: Feedback) => void;
const listeners = new Map<string, Set<Listener>>();
let sequence = 0;

export function publishFeedback(channel: string, state: ActionState) {
  const f = { id: ++sequence, state };
  for (const fn of listeners.get(channel) ?? []) fn(f);
}
export function subscribeFeedback(channel: string, fn: Listener) {
  if (!listeners.has(channel)) listeners.set(channel, new Set());
  listeners.get(channel)!.add(fn);
  return () => {
    listeners.get(channel)?.delete(fn);
  };
}
