'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { forgetAll } from '@/server/memo';
import { db, owner } from '@/server/db';
import { issueMessages } from '@/lib/validation';
import type { ActionState } from '@/features/schedule/actions';
import {
  budgetLine,
  tickInput,
  type Hints,
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
  problemHints,
  removeCard,
} from './service';

const refresh = () => {
  forgetAll();
  revalidatePath('/roadmap', 'layout');
  revalidatePath('/settings');
};
async function perform(
  work: () => Promise<string | Omit<ActionState, 'ok'>>,
): Promise<ActionState> {
  try {
    const done = await work();
    refresh();
    return typeof done === 'string'
      ? { message: done, ok: true }
      : { ...done, ok: true };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { message: issueMessages(error.issues) };
    return {
      message:
        error instanceof Error && !('code' in error)
          ? error.message
          : 'Unable to save. Reload and try again.',
    };
  }
}

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
    return { ok: true, ladder, budget: budgetLine(state.spent) };
  } catch (error) {
    const state = await aiState(user).catch(() => null);
    const budget = state ? budgetLine(state.spent) : undefined;
    if (error instanceof AiRefusal || error instanceof AiUnavailable)
      return { ok: false, message: error.message, budget };
    console.error(
      '[study] grill failed',
      error instanceof Error ? error.name : 'Error',
    );
    return { ok: false, message: 'Grill Me is unavailable right now.', budget };
  }
}

export type HintsResult =
  | { ok: true; hints: Hints; budget: string }
  | { ok: false; message: string; budget?: string };
/** Hints on a Practice problem (WI-032): four fields out, five code-free hints back. */
export async function hintsAction(problemId: string): Promise<HintsResult> {
  const user = await owner();
  try {
    const hints = await problemHints(user, z.string().min(1).parse(problemId));
    const state = await aiState(user);
    return { ok: true, hints, budget: budgetLine(state.spent) };
  } catch (error) {
    const state = await aiState(user).catch(() => null);
    const budget = state ? budgetLine(state.spent) : undefined;
    if (error instanceof AiRefusal || error instanceof AiUnavailable)
      return { ok: false, message: error.message, budget };
    console.error(
      '[study] grill failed',
      error instanceof Error ? error.name : 'Error',
    );
    return { ok: false, message: 'Hints are unavailable right now.', budget };
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
/** Settings: repeat the provider check now; a pass lifts a block. */
export async function aiCheckAction(): Promise<ActionState> {
  return perform(async () => {
    const result = await checkAgain(await owner());
    if (!result.ok) throw new Error(`${result.reason}. Grill Me stays off.`);
    return 'The provider check passed. Grill Me is available.';
  });
}
