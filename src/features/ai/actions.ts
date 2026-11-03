'use server';
import { unstable_rethrow } from 'next/navigation';
import { runAction } from '@/server/action';
import { z } from 'zod';
import { db, owner } from '@/server/db';
import type { ActionState } from '@/lib/action-state';
import {
  budgetLine,
  dollars,
  limitInput,
  tickInput,
  type Ladder,
  type Ticks,
} from './domain';
import {
  aiState,
  AiRefusal,
  AiUnavailable,
  checkAgain,
  grill,
  keepCard,
  removeCard,
  setMonthlyLimit,
} from './service';

const perform = (work: () => Promise<string | Omit<ActionState, 'ok'>>) =>
  runAction(work, { area: 'ai' });

export type GrillResult =
  | { ok: true; ladder: Ladder; budget: string }
  | { ok: false; message: string; budget?: string };
/** Grill Me (WI-031): sends the ticked fields and returns the ladder; nothing is stored. */
export async function grillAction(
  itemId: string,
  ticks: Ticks,
): Promise<GrillResult> {
  const user = await owner();
  try {
    const ladder = await grill(
      user,
      z.string().min(1).parse(itemId),
      tickInput.parse(ticks),
    );
    const state = await aiState(user);
    return { ok: true, ladder, budget: budgetLine(state.spent, state.limit) };
  } catch (error) {
    // Signed out mid-request: the sign-in redirect goes through (WI-145).
    unstable_rethrow(error);
    const state = await aiState(user).catch(() => null);
    const budget = state ? budgetLine(state.spent, state.limit) : undefined;
    if (error instanceof AiRefusal || error instanceof AiUnavailable)
      return { ok: false, message: error.message, budget };
    console.error(
      '[study] grill failed',
      error instanceof Error ? error.name : 'Error',
    );
    return { ok: false, message: 'Grill Me is unavailable right now.', budget };
  }
}

export async function keepCardAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const { created } = await keepCard(await owner(), {
      itemId: f.get('itemId'),
      question: f.get('question'),
      change: f.get('change') ?? '',
      points: JSON.parse(String(f.get('points') ?? '[]')),
    });
    return created ? 'Kept as a card.' : 'Already kept.';
  });
}
export async function removeCardAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const card = await removeCard(
      await owner(),
      z.string().min(1).parse(f.get('id')),
    );
    return {
      message: 'Card removed.',
      undo: {
        kind: 'restore-card',
        payload: {
          itemId: card.roadmapItemId,
          question: card.question,
          change: card.change ?? '',
          points: card.points,
        },
      },
    };
  });
}
/** Settings: the owner's own switch for Grill Me. */
export async function aiEnabledAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const user = await owner();
    const enabled = f.get('enabled') === 'on';
    await db().aiSetting.upsert({
      where: { userId: user.id },
      create: { userId: user.id, enabled },
      update: { enabled },
    });
    return enabled ? 'Grill Me is on.' : 'Grill Me is off.';
  });
}
/** Settings (WI-114): the owner's monthly AI limit, or none. */
export async function aiLimitAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const user = await owner();
    const choice = String(f.get('limit') ?? '');
    const limit = limitInput.parse(
      choice === 'other' ? String(f.get('amount') ?? '') : choice,
    );
    await setMonthlyLimit(user, limit);
    return limit === null
      ? 'No monthly limit in Silsila. Your OpenRouter key’s own limit still applies.'
      : `Monthly limit set to ${dollars(limit).replace('.00', '')}.`;
  });
}
/** Settings: repeat the provider check now; a pass lifts a block. */
export async function aiCheckAction(): Promise<ActionState> {
  return perform(async () => {
    const result = await checkAgain(await owner());
    if (!result.ok) throw new Error(`${result.reason}. Grill Me stays off.`);
    return 'The provider check passed. Grill Me is available.';
  });
}
