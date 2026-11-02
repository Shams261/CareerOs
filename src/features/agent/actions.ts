'use server';
import { failure, runAction } from '@/server/action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { owner } from '@/server/db';
import { forgetAll } from '@/server/memo';
import { weekdayDate } from '@/lib/time';
import { syncSoon } from '@/features/calendar/background';
import { issueMessages } from '@/lib/validation';
import type { ActionState } from '@/lib/action-state';
import { readStyle } from './domain';
import { AGENT_NAME } from '@/features/agent/constants';
import { MEMORY_KINDS } from './memory-domain';
import {
  agentSetting,
  forgetRumiMemories,
  setMemoryEnabled,
  setRumiStyle,
  setVoiceSettings,
} from './memory-service';
import { readVoiceLang } from './voice-domain';
import { voiceSettingsInput } from '@/features/agent/voice-schema';
import { answerSuggestion, applyProposal, dismissProposal } from './plans';
import { applyRequest, appliedWords, dismissRequest } from './requests';
import { draftWeek } from './draft';
import { weekSummary } from './summary';
import { keepWeekSummary } from '@/features/review/service';
import { AiRefusal, AiUnavailable } from '@/features/ai/service';
import { restore } from '@/features/undo/service';
import { undoWrite } from './writes';
import { addMemory, deleteConversation, removeMemory } from './service';

export type { AskResult } from './service';

const perform = (work: () => Promise<string>) =>
  runAction(work, { area: 'agent' });

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
    const kind = z.enum(MEMORY_KINDS).catch('PREFERENCE').parse(f.get('kind'));
    await addMemory(await owner(), f.get('text'), kind);
    return `${AGENT_NAME} will keep that in mind.`;
  });
}
/** Removes a line, with Undo (WI-100). */
export async function removeMemoryAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  try {
    const row = await removeMemory(
      await owner(),
      z.string().min(1).parse(f.get('id')),
    );
    revalidatePath('/settings');
    revalidatePath('/rumi');
    return {
      ok: true,
      message: 'Removed.',
      undo: {
        kind: 'restore-memory',
        payload: {
          text: row.text,
          kind: row.kind,
          source: row.source,
          expiresAt: row.expiresAt?.toISOString().slice(0, 10) ?? null,
        },
      },
    };
  } catch (error) {
    return {
      message: failure(error, 'agent', 'Unable to save. Reload and try again.'),
    };
  }
}
/** "Forget everything Rumi noted": the owner's own lines stay. */
export async function forgetRumiAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    if (f.get('id') !== 'rumi') throw new Error('Nothing to forget.');
    const n = await forgetRumiMemories(await owner());
    return n
      ? `Forgot ${n} ${n === 1 ? 'line' : 'lines'} ${AGENT_NAME} noted.`
      : `${AGENT_NAME} had noted nothing.`;
  });
}
/** The switch "Rumi keeps notes from conversations". */
export async function memoryEnabledAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const on = f.get('enabled') === 'on';
    await setMemoryEnabled(await owner(), on);
    return on
      ? `${AGENT_NAME} keeps notes from conversations.`
      : `${AGENT_NAME} keeps no new notes.`;
  });
}
/** Settings → Voice (WI-104): consent, the language and spoken replies. */
export async function voiceSettingsAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const v = voiceSettingsInput.parse({
      consent: f.get('consent') === 'on',
      lang: String(f.get('lang') ?? ''),
      speakReplies: f.get('speakReplies') === 'on',
    });
    await setVoiceSettings(await owner(), v);
    return v.consent
      ? 'Voice saved. The microphone shows in Ask Rumi.'
      : 'Voice saved. The microphone is hidden.';
  });
}
/** What the chat needs to know about voice, read when the drawer first opens (WI-104). */
export async function voiceStateAction() {
  const s = await agentSetting(await owner());
  return {
    consented: !!s.voiceConsentAt,
    lang: readVoiceLang(s.voiceLang),
    speakReplies: s.speakReplies,
  };
}

/** The style chip, saved on choice like the theme (WI-100). */
export async function rumiStyleAction(f: FormData) {
  await setRumiStyle(await owner(), readStyle(f.get('style')));
  revalidatePath('/settings');
}

/** Undo on one of Rumi's changes (WI-102): the stored undo of the owner's own answer. */
export async function undoWriteAction(
  messageId: string,
  actionId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await owner();
    const message = await undoWrite(
      user,
      z.string().min(1).max(40).parse(messageId),
      z.string().min(1).max(60).parse(actionId),
      (kind, payload) => restore(user, kind, payload),
    );
    forgetAll();
    for (const path of ['/rumi', '/today', '/calendar']) revalidatePath(path);
    syncSoon(user);
    return { ok: true, message };
  } catch (error) {
    return {
      ok: false,
      message: failure(error, 'agent', 'Unable to undo. Reload and try again.'),
    };
  }
}

/** "Draft next week with Rumi" (WI-107): plan cards per day in a new conversation. */
export async function draftWeekAction(): Promise<
  { ok: true; href: string } | { ok: false; message: string }
> {
  try {
    const id = await draftWeek(await owner());
    revalidatePath('/rumi');
    return { ok: true, href: `/rumi?c=${id}` };
  } catch (error) {
    if (error instanceof AiRefusal || error instanceof AiUnavailable)
      return { ok: false, message: error.message };
    console.error(
      '[agent] draft failed',
      error instanceof Error ? error.name : 'Error',
    );
    return {
      ok: false,
      message: `${AGENT_NAME} couldn’t draft next week right now.`,
    };
  }
}

/** The review summary (WI-110): two sentences on the week, on the owner's press. */
export async function weekSummaryAction(
  monday: string,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  try {
    const text = await weekSummary(
      await owner(),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .parse(monday),
    );
    return { ok: true, text };
  } catch (error) {
    if (error instanceof AiRefusal || error instanceof AiUnavailable)
      return { ok: false, message: error.message };
    return {
      ok: false,
      message: `${AGENT_NAME} couldn’t sum up this week right now.`,
    };
  }
}
/** Keep: the owner's edited summary into What went well?, as a draft. */
export async function keepSummaryAction(
  monday: string,
  text: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    await keepWeekSummary(
      await owner(),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .parse(monday),
      z.string().max(1000).parse(text),
    );
    // The review reads through a snapshot; the kept words must show at once.
    forgetAll();
    revalidatePath('/review');
    return { ok: true, message: 'Kept in What went well? as a draft.' };
  } catch (error) {
    return {
      ok: false,
      message: failure(error, 'agent', 'Unable to save. Reload and try again.'),
    };
  }
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
    // Times changed and blocks added on the card (WI-107), checked again under the lock.
    const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
    const json = (v: FormDataEntryValue | null) => {
      try {
        return v ? JSON.parse(String(v)) : [];
      } catch {
        return [];
      }
    };
    const edits = z
      .array(
        z.object({
          i: z.number().int().min(0).max(50),
          start: HHMM,
          end: HHMM,
        }),
      )
      .max(50)
      .parse(json(f.get('edits')));
    const extra = z
      .array(
        z.object({
          title: z.string().trim().min(1).max(80),
          kind: z.string().trim().min(1).max(40),
          start: HHMM,
          end: HHMM,
        }),
      )
      .max(4)
      .parse(json(f.get('extra')));
    const { day, ids } = await applyProposal(
      user,
      messageId,
      cardId,
      new Date(),
      skip,
      { edits, extra },
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
      message: failure(error, 'agent', 'Unable to save. Reload and try again.'),
    };
  }
}
/**
 * The owner's press on one of Rumi's cards (WI-103): applied under the lock against its
 * snapshot; a review card sends the owner's edited fields.
 */
export async function applyRequestAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  try {
    const user = await owner();
    const { messageId, cardId } = cardIds(f);
    const done = await applyRequest(user, messageId, cardId, new Date(), {
      notes: f.get('notes') ?? undefined,
      blocker: f.get('blocker') ?? undefined,
      carryForward: f.get('carryForward') ?? undefined,
      rating: f.get('rating') ?? undefined,
    });
    forgetAll();
    syncSoon(user);
    for (const path of [
      '/rumi',
      '/today',
      '/calendar',
      '/jobs',
      '/dsa',
      '/review',
    ])
      revalidatePath(path);
    return {
      ok: true,
      message: appliedWords(done.kind),
      ...(done.undo
        ? {
            undo: {
              kind: 'undo-request' as const,
              payload: { messageId, requestId: cardId },
            },
          }
        : {}),
    };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { message: issueMessages(error.issues) };
    return {
      message: failure(error, 'agent', 'Unable to save. Reload and try again.'),
    };
  }
}
export async function dismissRequestAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const { messageId, cardId } = cardIds(f);
    await dismissRequest(await owner(), messageId, cardId);
    return 'Dismissed.';
  });
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
