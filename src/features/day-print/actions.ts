'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db, owner } from '@/server/db';
import { forgetAll } from '@/server/memo';
import type { ActionState } from '@/features/schedule/actions';

/** Keep or remove day prints (WI-033); the answer is the hypothesis's result. */
export async function dayPrintAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  const parsed = z
    .enum(['keep', 'remove', 'on', 'off'])
    .safeParse(f.get('choice'));
  if (!parsed.success) return { message: 'Choose keep or remove.' };
  const user = await owner();
  const keep = parsed.data === 'keep' || parsed.data === 'on';
  await db().user.update({ where: { id: user.id }, data: { dayPrint: keep } });
  // The owner row is cached with the session (WI-061).
  forgetAll();
  revalidatePath('/today');
  revalidatePath('/settings');
  return {
    ok: true,
    message: keep
      ? 'Day prints stay.'
      : 'Day prints are off. Settings can bring them back.',
  };
}
