'use server';
import { forgetAll } from '@/server/memo';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { issueMessages } from '@/lib/validation';
import { owner } from '@/server/db';
import type { ActionState } from '@/features/schedule/actions';
import {
  recordAttempt,
  saveProblem,
  saveTopic,
  scheduleRevision,
  setCurrentTopic,
} from './service';
import { db } from '@/server/db';
import { revisionDay } from './domain';
import { formatInTimeZone } from 'date-fns-tz';
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
      select: { nextRevisionAt: true },
    });
    const next = problem?.nextRevisionAt
      ? formatInTimeZone(
          new Date(`${revisionDay(problem.nextRevisionAt)}T12:00:00Z`),
          'UTC',
          'MMM d',
        )
      : null;
    return next ? `Attempt saved. Next revision ${next}.` : 'Attempt saved.';
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
