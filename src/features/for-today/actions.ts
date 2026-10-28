'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { owner } from '@/server/db';
import { forgetAll } from '@/server/memo';
import { syncSoon } from '@/features/calendar/background';
import type { ActionState } from '@/features/schedule/actions';
import { PICK_CATEGORIES, PICK_MINUTES } from './domain';
import { letGoDay, startPick } from './service';
import { dateInput } from '@/features/schedule/domain';

const pickInput = z.object({
  title: z.string().trim().min(1).max(160),
  category: z.enum(PICK_CATEGORIES),
});

/** Start 20 min on a For today pick: adds the block, then opens Focus on it (WI-059). */
export async function startPickAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const user = await owner();
    const pick = pickInput.parse({
      title: f.get('title'),
      category: f.get('category'),
    });
    ({ id } = await startPick(user, pick));
    forgetAll();
    syncSoon(user);
    revalidatePath('/today');
  } catch (error) {
    return {
      message:
        error instanceof Error && !(error instanceof z.ZodError)
          ? error.message
          : 'Could not start it. Try again.',
    };
  }
  redirect(`/focus?block=${id}&minutes=${PICK_MINUTES}`);
}

/** "Let go of yesterday's blocks" on Today's Start from here (WI-059), with Undo. */
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
