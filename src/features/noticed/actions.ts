'use server';
import { z } from 'zod';
import { owner } from '@/server/db';
import { runAction } from '@/server/action';
import { answerNoticed } from './service';

const input = z.object({
  key: z.string().min(3).max(200),
  kind: z.enum(['interview', 'idle', 'routine', 'heavy', 'stuck', 'cold']),
  acted: z.boolean(),
});

/** Rumi noticed (WI-043): records the owner's action or Dismiss, which hides the card. */
export async function answerNoticedAction(raw: {
  key: string;
  kind: string;
  acted: boolean;
}): Promise<{ ok: boolean }> {
  const done = await runAction(
    async () => {
      await answerNoticed(await owner(), input.parse(raw));
      return '';
    },
    { area: 'noticed' },
  );
  return { ok: !!done.ok };
}
