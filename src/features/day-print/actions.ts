'use server';
import { z } from 'zod';
import { db, owner } from '@/server/db';
import { runAction } from '@/server/action';
import type { ActionState } from '@/lib/action-state';

const choice = z.enum(['keep', 'remove', 'on', 'off'], {
  error: 'Choose keep or remove.',
});

/** Keep or remove day prints (WI-033); the answer is the hypothesis's result. */
export async function dayPrintAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  return runAction(
    async () => {
      const picked = choice.parse(f.get('choice'));
      const user = await owner();
      const keep = picked === 'keep' || picked === 'on';
      await db().user.update({
        where: { id: user.id },
        data: { dayPrint: keep },
      });
      // The owner row is cached with the session (WI-061); runAction drops the snapshots.
      return keep
        ? 'Day prints stay.'
        : 'Day prints are off. Settings can bring them back.';
    },
    { area: 'day-print' },
  );
}
