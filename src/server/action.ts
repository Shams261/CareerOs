import 'server-only';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { issueMessages } from '@/lib/validation';
import { errorCode, ownerWords, withReference } from '@/lib/action-error';
import type { ActionState } from '@/lib/action-state';
import { forgetAll } from '@/server/memo';

export const SAVE_FAILED = 'Unable to save. Reload and try again.';

/**
 * The message for a failed action (WI-122). Next's own control flow (`redirect`, `notFound`)
 * is thrown on, validation reads as field messages, an owner-facing refusal keeps its words,
 * and anything unexpected is logged by name, code and a short reference, never by its text.
 */
export function failure(
  error: unknown,
  area: string,
  fallback = SAVE_FAILED,
): string {
  unstable_rethrow(error);
  if (error instanceof z.ZodError) return issueMessages(error.issues);
  const words = ownerWords(error);
  if (words) return words;
  const ref = randomUUID().slice(0, 8);
  console.error(
    `[${area}] action failed`,
    error instanceof Error ? error.name : 'Error',
    errorCode(error),
    `ref ${ref}`,
  );
  return withReference(fallback, ref);
}

type Done =
  string | (Omit<ActionState, 'ok' | 'message'> & { message: string });

/**
 * Runs one server action's work (WI-122). On success the snapshots are dropped and every page
 * is revalidated (all pages are per-owner and dynamic, so one rule replaces per-feature route
 * lists), then `after` runs (a Calendar sync, say). A feature's own error types are answered by
 * `known`; the rest by `failure`.
 */
export async function runAction(
  work: () => Promise<Done>,
  {
    area,
    fallback,
    known,
    after,
  }: {
    area: string;
    fallback?: string;
    known?: (error: unknown) => ActionState | undefined;
    after?: () => unknown;
  },
): Promise<ActionState> {
  try {
    const done = await work();
    forgetAll();
    revalidatePath('/', 'layout');
    // The change is committed; a follow-up (a Calendar sync) never turns it into a failure.
    try {
      await after?.();
    } catch (error) {
      unstable_rethrow(error);
    }
    return typeof done === 'string'
      ? { message: done, ok: true }
      : { ...done, ok: true };
  } catch (error) {
    unstable_rethrow(error);
    return known?.(error) ?? { message: failure(error, area, fallback) };
  }
}
