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

/**
 * A result published while no outlet listens (Focus completes, then opens Today) waits this
 * long for the first outlet on its channel to mount, so the message survives the page change
 * (WI-059).
 */
const HANDOFF_MS = 10_000;
const pending = new Map<string, { f: Feedback; at: number }>();

export function publishFeedback(channel: string, state: ActionState) {
  const f = { id: ++sequence, state };
  const fns = listeners.get(channel);
  if (!fns?.size) pending.set(channel, { f, at: Date.now() });
  for (const fn of fns ?? []) fn(f);
}
export function subscribeFeedback(channel: string, fn: Listener) {
  if (!listeners.has(channel)) listeners.set(channel, new Set());
  listeners.get(channel)!.add(fn);
  const waiting = pending.get(channel);
  if (waiting) {
    pending.delete(channel);
    if (Date.now() - waiting.at < HANDOFF_MS) fn(waiting.f);
  }
  return () => {
    listeners.get(channel)?.delete(fn);
  };
}
