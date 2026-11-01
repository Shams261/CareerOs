'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { owner } from '@/server/db';
import { forgetAll } from '@/server/memo';
import type { ActionState } from '@/features/schedule/actions';
import { AiRefusal, AiUnavailable } from '@/features/ai/service';
import { docInput } from './domain';
import {
  addInviteRound,
  deletePrepDoc,
  parseInvite,
  tickInviteFormats,
  UNAVAILABLE,
  writePrepDoc,
} from './service';
import { planFromDoc } from './plan';
import { debriefRound, mockFeedback } from './mock';
import { MOCK_ANSWER_MAX } from './mock-domain';
import { INVITE_MAX, inviteTopics, type Invite } from './invite';
import { aiPolicies, interviewTypes } from '@/features/jobs/domain';

const roundIn = z.object({
  type: z.enum(interviewTypes),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  start: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  minutes: z.number().int().min(10).max(480).nullable(),
  aiPolicy: z.enum(aiPolicies),
});
const inviteIn = z
  .object({ rounds: z.array(roundIn).max(6), topics: inviteTopics })
  .nullable()
  .optional();
const failed = (error: unknown) => {
  if (error instanceof AiRefusal || error instanceof AiUnavailable)
    return error.message;
  if (error instanceof z.ZodError)
    return 'That did not look right. Reload and try again.';
  if (error instanceof Error && !('code' in error)) return error.message;
  return UNAVAILABLE;
};

/**
 * "I have the invite" (WI-105): read only when the owner ticked "Send the invite text"; the
 * text goes to one strict call and is never stored.
 */
export async function inviteAction(
  applicationId: string,
  text: string,
  send: boolean,
): Promise<{ ok: true; invite: Invite } | { ok: false; message: string }> {
  if (!send)
    return { ok: false, message: 'Tick “Send the invite text” to read it.' };
  try {
    const invite = await parseInvite(
      await owner(),
      z.string().min(1).parse(applicationId),
      z
        .string()
        .max(INVITE_MAX * 2)
        .parse(text),
    );
    return { ok: true, invite };
  } catch (error) {
    return { ok: false, message: failed(error) };
  }
}
/** Adds one round the invite named, on the owner's press. */
export async function addInviteRoundAction(
  applicationId: string,
  round: unknown,
): Promise<{ ok: boolean; message: string }> {
  try {
    await addInviteRound(
      await owner(),
      z.string().min(1).parse(applicationId),
      roundIn.parse(round),
    );
    forgetAll();
    // Not the application page: a refresh would move the open panel into the new round and
    // drop the invite the owner is working through. The page reads fresh when it is opened.
    revalidatePath('/today');
    return { ok: true, message: 'Interview added.' };
  } catch (error) {
    return { ok: false, message: failed(error) };
  }
}
/** Ticks the invite's practice formats on the application. */
export async function tickFormatsAction(
  applicationId: string,
  types: string[],
): Promise<{ ok: boolean; message: string }> {
  try {
    const added = await tickInviteFormats(
      await owner(),
      z.string().min(1).parse(applicationId),
      z.array(z.string().max(40)).max(12).parse(types),
    );
    // As above: the open panel keeps the invite; the page reads fresh when opened again.
    return {
      ok: true,
      message: added
        ? `${added} ${added === 1 ? 'format' : 'formats'} ticked.`
        : 'Already ticked.',
    };
  } catch (error) {
    return { ok: false, message: failed(error) };
  }
}
/** The debrief (WI-108): the owner's three answers on a completed round. */
export async function debriefAction(
  roundId: string,
  answers: { topicsAsked: string; wentWell: string; toImprove: string },
): Promise<{ ok: boolean; message: string }> {
  try {
    const a = z
      .object({
        topicsAsked: z.string().max(2000),
        wentWell: z.string().max(2000),
        toImprove: z.string().max(2000),
      })
      .parse(answers);
    const round = await debriefRound(
      await owner(),
      z.string().min(1).parse(roundId),
      a,
    );
    forgetAll();
    revalidatePath(`/jobs/${round.applicationId}`);
    return { ok: true, message: 'Debrief saved on the interview.' };
  } catch (error) {
    return { ok: false, message: failed(error) };
  }
}
/** The mock interview (WI-108): feedback on one answer, never a score. */
export async function mockFeedbackAction(input: {
  docId: string;
  index: number;
  answer: string;
  conversationId: string | null;
}): Promise<
  | { ok: true; feedback: string; conversationId: string }
  | { ok: false; message: string }
> {
  try {
    const v = z
      .object({
        docId: z.string().min(1).max(40),
        index: z.number().int().min(0).max(9),
        answer: z.string().max(MOCK_ANSWER_MAX * 2),
        conversationId: z.string().min(1).max(40).nullable(),
      })
      .parse(input);
    const r = await mockFeedback(await owner(), v);
    return { ok: true, ...r };
  } catch (error) {
    return { ok: false, message: failed(error) };
  }
}

/** "Plan until the date": plan cards in a new conversation with Rumi. */
export async function planFromDocAction(
  docId: string,
): Promise<{ ok: true; href: string } | { ok: false; message: string }> {
  try {
    const id = await planFromDoc(await owner(), z.string().min(1).parse(docId));
    revalidatePath('/rumi');
    return { ok: true, href: `/rumi?c=${id}` };
  } catch (error) {
    return { ok: false, message: failed(error) };
  }
}

export type PrepResult =
  { ok: true; href: string } | { ok: false; message: string };

/** Prepare with Rumi (WI-042): research, write, store, and open the doc. */
export async function prepAction(
  applicationId: string,
  jobDescription: boolean,
  /** What an invite named (WI-105): rounds and listed topics, never its text. */
  invite?: Invite | null,
): Promise<PrepResult> {
  const user = await owner();
  try {
    const input = docInput.parse({ applicationId, jobDescription });
    const doc = await writePrepDoc(user, {
      ...input,
      invite: inviteIn.parse(invite) ?? undefined,
    });
    forgetAll();
    revalidatePath(`/jobs/${doc.applicationId}`);
    return { ok: true, href: `/jobs/${doc.applicationId}/prep/${doc.id}` };
  } catch (error) {
    if (error instanceof AiRefusal || error instanceof AiUnavailable)
      return { ok: false, message: error.message };
    console.error(
      '[prep] doc failed',
      error instanceof Error ? error.name : 'Error',
    );
    return { ok: false, message: UNAVAILABLE };
  }
}

export async function deletePrepDocAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let applicationId: string;
  try {
    applicationId = await deletePrepDoc(
      await owner(),
      z.string().min(1).parse(f.get('id')),
    );
  } catch (error) {
    return {
      message:
        error instanceof Error && !('code' in error)
          ? error.message
          : 'Unable to delete. Reload and try again.',
    };
  }
  revalidatePath('/jobs', 'layout');
  redirect(`/jobs/${applicationId}`);
}
