'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { owner } from '@/server/db';
import { forgetAll } from '@/server/memo';
import { weekdayDate } from '@/lib/time';
import { syncSoon } from '@/features/calendar/background';
import { issueMessages } from '@/lib/validation';
import type { ActionState } from '@/features/schedule/actions';
import { AiRefusal, AiUnavailable, aiState } from '@/features/ai/service';
import { budgetLine } from '@/features/ai/domain';
import { AGENT_NAME } from './domain';
import { readMetadata, type Proposal, type Suggestion } from './plan-domain';
import { answerSuggestion, applyProposal, dismissProposal } from './plans';
import {
  addMemory,
  deleteConversation,
  removeMemory,
  sendMessage,
  UNAVAILABLE,
} from './service';

export type AskResult =
  | {
      ok: true;
      conversationId: string;
      reply: {
        id: string;
        content: string;
        proposals: Proposal[];
        suggestions: Suggestion[];
      };
      budget: string;
    }
  | { ok: false; message: string; conversationId?: string; budget?: string };

/** Ask Rumi (WI-040): one owner message, one answer from the owner's own records. */
export async function askAction(
  conversationId: string | null,
  text: string,
): Promise<AskResult> {
  const user = await owner();
  try {
    const result = await sendMessage(user, {
      conversationId: conversationId
        ? z.string().min(1).parse(conversationId)
        : null,
      text,
    });
    const state = await aiState(user);
    revalidatePath('/rumi');
    return {
      ok: true,
      conversationId: result.conversationId,
      reply: {
        id: result.message.id,
        content: result.message.content,
        ...readMetadata(result.message.metadata),
      },
      budget: budgetLine(state.spent),
    };
  } catch (error) {
    const state = await aiState(user).catch(() => null);
    const budget = state ? budgetLine(state.spent) : undefined;
    if (error instanceof z.ZodError)
      return { ok: false, message: issueMessages(error.issues), budget };
    if (error instanceof AiRefusal || error instanceof AiUnavailable)
      return { ok: false, message: error.message, budget };
    console.error(
      '[agent] chat failed',
      error instanceof Error ? error.name : 'Error',
    );
    return { ok: false, message: UNAVAILABLE, budget };
  }
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
    const { day, ids } = await applyProposal(user, messageId, cardId);
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
