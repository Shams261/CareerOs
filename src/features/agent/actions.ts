'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { owner } from '@/server/db';
import { forgetAll } from '@/server/memo';
import { weekdayDate } from '@/lib/time';
import { syncSoon } from '@/features/calendar/background';
import { issueMessages } from '@/lib/validation';
import type { ActionState } from '@/features/schedule/actions';
import { AGENT_NAME } from './domain';
import { answerSuggestion, applyProposal, dismissProposal } from './plans';
import {
  addMemory,
  askRumi,
  deleteConversation,
  removeMemory,
  type AskResult,
} from './service';

export type { AskResult } from './service';

/** Ask Rumi (WI-040): one owner message, one answer from the owner's own records. */
export async function askAction(
  conversationId: string | null,
  text: string,
): Promise<AskResult> {
  const result = await askRumi(await owner(), conversationId, text);
  if (result.ok) revalidatePath('/rumi');
  return result;
}

async function perform(work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    revalidatePath('/rumi');
    revalidatePath('/settings');
    return { message, ok: true };
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

export async function deleteConversationAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    await deleteConversation(
      await owner(),
      z.string().min(1).parse(f.get('id')),
    );
    return 'Conversation deleted.';
  });
}
/** Settings → "Rumi knows": a line the owner writes for Rumi to keep in mind. */
export async function addMemoryAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    await addMemory(await owner(), f.get('text'));
    return `${AGENT_NAME} will keep that in mind.`;
  });
}
export async function removeMemoryAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    await removeMemory(await owner(), z.string().min(1).parse(f.get('id')));
    return 'Removed.';
  });
}

const cardIds = (f: FormData) =>
  z
    .object({ messageId: z.string().min(1), cardId: z.string().min(1) })
    .parse({ messageId: f.get('messageId'), cardId: f.get('cardId') });

/** Add to plan (WI-041): the proposal's blocks, re-checked and written all or none, with Undo. */
export async function applyProposalAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  try {
    const user = await owner();
    const { messageId, cardId } = cardIds(f);
    const skip = z
      .array(z.coerce.number().int().min(0).max(50))
      .max(50)
      .parse(f.getAll('skip'));
    const { day, ids } = await applyProposal(
      user,
      messageId,
      cardId,
      new Date(),
      skip,
    );
    forgetAll();
    syncSoon(user);
    for (const path of ['/rumi', '/today', '/calendar']) revalidatePath(path);
    return {
      ok: true,
      message: `Added ${ids.length} ${ids.length === 1 ? 'block' : 'blocks'} to ${weekdayDate(day)}.`,
      undo: {
        kind: 'cancel-blocks',
        payload: { ids, messageId, proposalId: cardId },
      },
    };
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
export async function dismissProposalAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const { messageId, cardId } = cardIds(f);
    await dismissProposal(await owner(), messageId, cardId);
    return 'Dismissed.';
  });
}
/** Keep or dismiss a "Rumi knows" suggestion (WI-041). */
export async function answerSuggestionAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const { messageId, cardId } = cardIds(f);
    const keep = f.get('keep') === 'yes';
    await answerSuggestion(await owner(), messageId, cardId, keep);
    return keep ? `${AGENT_NAME} will keep that in mind.` : 'Dismissed.';
  });
}
