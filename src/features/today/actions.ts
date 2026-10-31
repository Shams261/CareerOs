'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { owner } from '@/server/db';
import { forgetAll } from '@/server/memo';
import { syncSoon } from '@/features/calendar/background';
import type { ActionState } from '@/features/schedule/actions';
import { dateInput } from '@/features/schedule/domain';
import { FIRST_STEPS_COOKIE } from './first-steps-cookie';
import { letGoDay } from './let-go';

/** "Skip for now" on the empty account's three steps (WI-065): hidden for 30 days. */
export async function hideFirstStepsAction() {
  await owner();
  (await cookies()).set(FIRST_STEPS_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure:
      process.env.NODE_ENV === 'production' &&
      process.env.APP_BASE_URL?.startsWith('https://') === true,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath('/today');
}

/** "Let go of yesterday's blocks" on Today's launcher (WI-059), with Undo. */
export async function letGoDayAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  try {
    const user = await owner();
    const day = dateInput.parse(f.get('day'));
    const ids = await letGoDay(user, day);
    forgetAll();
    syncSoon(user);
    for (const path of ['/today', '/calendar', '/review']) revalidatePath(path);
    if (!ids.length) return { ok: true, message: 'Nothing left to let go of.' };
    return {
      ok: true,
      message: `Let go of ${ids.length} block${ids.length === 1 ? '' : 's'}.`,
      undo: { kind: 'blocks-reset', payload: { ids } },
    };
  } catch (error) {
    return {
      message:
        error instanceof Error && !(error instanceof z.ZodError)
          ? error.message
          : 'Could not let them go. Try again.',
    };
  }
}
