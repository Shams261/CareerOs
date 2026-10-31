'use server';
import { forgetAll } from '@/server/memo';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { issueMessages } from '@/lib/validation';
import { owner } from '@/server/db';
import type { ActionState } from '@/features/schedule/actions';
import {
  markRevised,
  recordAttempt,
  saveProblem,
  saveTopic,
  scheduleRevision,
  setCurrentTopic,
  startRevision,
} from './service';
import { db } from '@/server/db';
import { ladderState, type LadderState } from './domain';
import { dayKey } from '@/lib/time';
import { formatInTimeZone } from 'date-fns-tz';
const dayLabel = (day: string) =>
  formatInTimeZone(new Date(`${day}T12:00:00Z`), 'UTC', 'MMM d');
/** "Revision 1 of 3 on Nov 3." / "Revised 2 of 3; next on Nov 14." / "Revised 3 of 3." */
function ladderNote(l: LadderState, revisedNow: boolean) {
  if (l.state === 'finished') return 'Revised 3 of 3. The ladder is done.';
  if (!l.step || !l.due) return '';
  return revisedNow
    ? `Revised ${l.step - 1} of 3; next on ${dayLabel(l.due)}.`
    : `Revision ${l.step} of 3 on ${dayLabel(l.due)}.`;
}
async function perform(work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    forgetAll();
    revalidatePath('/dsa', 'layout');
    revalidatePath('/today');
    return { message, ok: true };
  } catch (error) {
    return {
      message:
        error instanceof z.ZodError
          ? issueMessages(error.issues)
          : error instanceof Error && !('code' in error)
            ? error.message
            : 'Unable to save. Check for a duplicate topic name, then reload and try again.',
    };
  }
}
export async function topicAction(_state: ActionState, form: FormData) {
  return perform(async () => {
    await saveTopic(await owner(), {
      ...Object.fromEntries(form),
      current: form.get('current') === 'on',
    });
    return 'Topic saved.';
  });
}
export async function problemAction(_state: ActionState, form: FormData) {
  return perform(async () => {
    await saveProblem(await owner(), Object.fromEntries(form));
    return 'Problem saved.';
  });
}
export async function attemptAction(_state: ActionState, form: FormData) {
  return perform(async () => {
    const user = await owner();
    const attempt = await recordAttempt(user, Object.fromEntries(form));
    const problem = await db().dsaProblem.findFirst({
      where: { id: attempt.problemId, userId: user.id },
    });
    if (!problem) return 'Attempt saved.';
    const ladder = ladderState(problem, dayKey(new Date(), user.timezone));
    // A first attempt starts the ladder; one on an open step counts as that revision.
    const revisedNow =
      ladder.outcomes.length > 0 && ladder.state !== 'finished';
    return `Attempt saved. ${ladderNote(ladder, revisedNow || ladder.state === 'finished')}`.trim();
  });
}
export async function makeCurrentAction(_state: ActionState, form: FormData) {
  return perform(async () => {
    const topic = await setCurrentTopic(
      await owner(),
      String(form.get('id') ?? ''),
    );
    return `${topic.name} is the current topic.`;
  });
}
export async function revisionAction(_state: ActionState, form: FormData) {
  return perform(async () => {
    await scheduleRevision(
      await owner(),
      String(form.get('id') ?? ''),
      String(form.get('date') ?? ''),
    );
    return 'Revision date saved.';
  });
}

export async function markRevisedAction(_state: ActionState, form: FormData) {
  return perform(async () => {
    const ladder = await markRevised(
      await owner(),
      String(form.get('id') ?? ''),
    );
    return ladderNote(ladder, true);
  });
}
export async function startRevisionAction(_state: ActionState, form: FormData) {
  return perform(async () => {
    const user = await owner();
    await startRevision(user, String(form.get('id') ?? ''));
    return 'Revision ladder started: 3, 7 and 14 days from today.';
  });
}
