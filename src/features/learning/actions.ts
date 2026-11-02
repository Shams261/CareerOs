'use server';
import { runAction } from '@/server/action';
import { owner } from '@/server/db';
import type { ActionState } from '@/lib/action-state';
import {
  saveSubject,
  saveLearningTopic,
  recordActivity,
  scheduleReview,
  addLearningResource,
  saveLearningReminder,
} from './service';
const perform = (work: () => Promise<unknown>, message: string) =>
  runAction(
    async () => {
      await work();
      return message;
    },
    {
      area: 'learning',
      fallback:
        'Unable to save. Check duplicate names and reload before retrying.',
    },
  );
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
