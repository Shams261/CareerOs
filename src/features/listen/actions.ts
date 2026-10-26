'use server';
import { z } from 'zod';
import { owner } from '@/server/db';
import { budgetLine } from '@/features/ai/domain';
import { aiState, AiRefusal, AiUnavailable } from '@/features/ai/service';
import { listen, type ListenScript } from './service';

export type ListenResult =
  | { ok: true; script: ListenScript; budget: string }
  | { ok: false; message: string; budget?: string };

/** Listen (WI-037): fetches the item's listed sources and returns a checked script; nothing is stored. */
export async function listenAction(itemId: string): Promise<ListenResult> {
  const user = await owner();
  try {
    const script = await listen(user, z.string().min(1).parse(itemId));
    const state = await aiState(user);
    return { ok: true, script, budget: budgetLine(state.spent) };
  } catch (error) {
    const state = await aiState(user).catch(() => null);
    const budget = state ? budgetLine(state.spent) : undefined;
    if (error instanceof AiRefusal || error instanceof AiUnavailable)
      return { ok: false, message: error.message, budget };
    console.error(
      '[listen] failed',
      error instanceof Error ? error.name : 'Error',
    );
    return { ok: false, message: 'Listen is unavailable right now.', budget };
  }
}
