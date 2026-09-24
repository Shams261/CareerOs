'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { owner } from '@/server/db';
import type { ActionState } from '@/features/schedule/actions';
import {
  saveSubject,
  saveLearningTopic,
  recordActivity,
  scheduleReview,
  addLearningResource,
  saveLearningReminder,
} from './service';
async function perform(
  work: () => Promise<unknown>,
  message: string,
): Promise<ActionState> {
  try {
    await work();
    revalidatePath('/learn', 'layout');
    revalidatePath('/today');
    return { ok: true, message };
  } catch (error) {
    return {
      message:
        error instanceof z.ZodError
          ? error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; ')
          : error instanceof Error && !('code' in error)
            ? error.message
            : 'Unable to save. Check duplicate names and reload before retrying.',
    };
  }
}
export async function subjectAction(_s: ActionState, f: FormData) {
  return perform(
    async () =>
      saveSubject(await owner(), {
        ...Object.fromEntries(f),
        current: f.get('current') === 'on',
      }),
    'Subject saved.',
  );
}
export async function learningTopicAction(_s: ActionState, f: FormData) {
  return perform(
    async () => saveLearningTopic(await owner(), Object.fromEntries(f)),
    'Topic saved.',
  );
}
export async function activityAction(_s: ActionState, f: FormData) {
  return perform(
    async () => recordActivity(await owner(), Object.fromEntries(f)),
    'Activity saved. Topic summary updated.',
  );
}
export async function reviewAction(_s: ActionState, f: FormData) {
  return perform(
    async () =>
      scheduleReview(
        await owner(),
        String(f.get('id') ?? ''),
        String(f.get('date') ?? ''),
      ),
    'Manual review date saved.',
  );
}
export async function resourceAction(_s: ActionState, f: FormData) {
  return perform(
    async () => addLearningResource(await owner(), Object.fromEntries(f)),
    'Resource saved.',
  );
}
export async function learningReminderAction(_s: ActionState, f: FormData) {
  return perform(
    async () =>
      saveLearningReminder(await owner(), {
        ...Object.fromEntries(f),
        enabled: f.get('enabled') === 'on',
      }),
    'Learning reminder saved.',
  );
}
