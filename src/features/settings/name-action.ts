'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db, owner } from '@/server/db';
import { forgetAll } from '@/server/memo';
import type { ActionState } from '@/features/schedule/actions';

/** What Silsila calls the owner (WI-074): the greeting's name, kept on the owner row. */
export async function nameAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  const parsed = z
    .string()
    .trim()
    .min(1, 'Name: enter at least one character.')
    .max(60, 'Name: at most 60 characters.')
    .safeParse(f.get('name'));
  if (!parsed.success)
    return { message: parsed.error.issues[0]?.message ?? 'Name: check it.' };
  const user = await owner();
  await db().user.update({
    where: { id: user.id },
    data: { name: parsed.data },
  });
  // The owner row is cached with the session (WI-061).
  forgetAll();
  revalidatePath('/today');
  revalidatePath('/settings');
  const first = parsed.data.split(/\s+/)[0];
  return { ok: true, message: `Saved. Today greets you as ${first}.` };
}
