'use server';
import { z } from 'zod';
import { db, owner } from '@/server/db';
import { runAction } from '@/server/action';
import type { ActionState } from '@/lib/action-state';

const name = z
  .string()
  .trim()
  .min(1, 'Name: enter at least one character.')
  .max(60, 'Name: at most 60 characters.');

/** What Silsila calls the owner (WI-074): the greeting's name, kept on the owner row. */
export async function nameAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  return runAction(
    async () => {
      const value = name.parse(f.get('name'));
      const user = await owner();
      await db().user.update({ where: { id: user.id }, data: { name: value } });
      // The owner row is cached with the session (WI-061); runAction drops the snapshots.
      return `Saved. Today greets you as ${value.split(/\s+/)[0]}.`;
    },
    { area: 'settings' },
  );
}
