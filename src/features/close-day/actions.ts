'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { forgetAll } from '@/server/memo';
import { owner } from '@/server/db';
import { issueMessages } from '@/lib/validation';
import { syncSoon } from '@/features/calendar/background';
import type { ActionState } from '@/features/schedule/actions';
import { closedMessage } from './domain';
import { closeDay } from './service';

/** Close the Day (WI-029): applies every choice and the check-in line together. */
export async function closeDayAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const user = await owner();
    const counts = await closeDay(user, form.entries());
    forgetAll();
    for (const route of ['/today', '/calendar', '/review'])
      revalidatePath(route);
    if (counts.tomorrow || counts.letgo || counts.done) syncSoon(user);
    return { message: closedMessage(counts), ok: true };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { message: issueMessages(error.issues) };
    return {
      message:
        error instanceof Error && !('code' in error)
          ? error.message
          : 'Unable to close the day. Reload and try again.',
    };
  }
}
