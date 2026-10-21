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
} from './service';
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
    await recordAttempt(await owner(), Object.fromEntries(form));
    return 'Attempt saved.';
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
