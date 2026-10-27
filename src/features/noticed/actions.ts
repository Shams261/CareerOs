'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { owner } from '@/server/db';
import { forgetAll } from '@/server/memo';
import { answerNoticed } from './service';

const input = z.object({
  key: z.string().min(3).max(200),
  kind: z.enum(['interview', 'idle', 'routine', 'heavy']),
  acted: z.boolean(),
});

/** Rumi noticed (WI-043): records the owner's action or Dismiss, which hides the card. */
export async function answerNoticedAction(raw: {
  key: string;
  kind: string;
  acted: boolean;
}): Promise<{ ok: boolean }> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false };
  await answerNoticed(await owner(), parsed.data);
  forgetAll();
  revalidatePath('/today');
  return { ok: true };
}
