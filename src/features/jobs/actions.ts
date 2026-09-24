'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { owner } from '@/server/db';
import type { ActionState } from '@/features/schedule/actions';
import { PreviewRequired } from '@/features/schedule/editing';
import {
  addJobNote,
  addPrepItem,
  changeStage,
  completeFollowUp,
  createApplication,
  recordRoundResult,
  rescheduleRound,
  saveJobReminders,
  scheduleRound,
  setFollowUp,
  setPrepItemDone,
  updateDetails,
  updateRoundDetails,
} from './service';
async function perform(
  work: () => Promise<unknown>,
  message: string,
): Promise<ActionState> {
  try {
    await work();
    revalidatePath('/jobs', 'layout');
    revalidatePath('/today');
    revalidatePath('/learn', 'layout');
    revalidatePath('/dsa', 'layout');
    return { ok: true, message };
  } catch (error) {
    if (error instanceof PreviewRequired)
      return {
        message: 'Possible duplicate application.',
        token: error.token,
        preview: error.lines,
      };
    return {
      message:
        error instanceof z.ZodError
          ? error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; ')
          : error instanceof Error && !('code' in error)
            ? error.message
            : 'Unable to save. Reload and try again.',
    };
  }
}
const fields = (f: FormData) => Object.fromEntries(f);
export async function createApplicationAction(_s: ActionState, f: FormData) {
  return perform(
    async () => createApplication(await owner(), fields(f)),
    'Application added.',
  );
}
export async function detailsAction(_s: ActionState, f: FormData) {
  return perform(
    async () => updateDetails(await owner(), fields(f)),
    'Details saved.',
  );
}
export async function stageAction(_s: ActionState, f: FormData) {
  return perform(
    async () => changeStage(await owner(), fields(f)),
    'Stage updated. History recorded.',
  );
}
export async function followUpAction(_s: ActionState, f: FormData) {
  return perform(
    async () => setFollowUp(await owner(), fields(f)),
    'Next action saved.',
  );
}
export async function followUpDoneAction(_s: ActionState, f: FormData) {
  return perform(
    async () => completeFollowUp(await owner(), fields(f)),
    'Next action completed.',
  );
}
export async function roundAction(_s: ActionState, f: FormData) {
  return perform(
    async () => scheduleRound(await owner(), fields(f)),
    'Interview scheduled.',
  );
}
export async function roundDetailsAction(_s: ActionState, f: FormData) {
  return perform(
    async () => updateRoundDetails(await owner(), fields(f)),
    'Interview details saved.',
  );
}
export async function rescheduleAction(_s: ActionState, f: FormData) {
  return perform(
    async () => rescheduleRound(await owner(), fields(f)),
    'Interview rescheduled. Previous time kept in the timeline.',
  );
}
export async function resultAction(_s: ActionState, f: FormData) {
  return perform(
    async () => recordRoundResult(await owner(), fields(f)),
    'Interview result saved.',
  );
}
export async function prepAction(_s: ActionState, f: FormData) {
  return perform(
    async () => addPrepItem(await owner(), fields(f)),
    'Prep item added.',
  );
}
export async function prepDoneAction(_s: ActionState, f: FormData) {
  return perform(
    async () =>
      setPrepItemDone(
        await owner(),
        String(f.get('id') ?? ''),
        f.get('completed') === 'true',
      ),
    'Prep item updated.',
  );
}
export async function jobNoteAction(_s: ActionState, f: FormData) {
  return perform(
    async () => addJobNote(await owner(), fields(f)),
    'Note added to timeline.',
  );
}
export async function jobReminderAction(_s: ActionState, f: FormData) {
  return perform(
    async () =>
      saveJobReminders(await owner(), {
        ...fields(f),
        followUpEnabled: f.get('followUpEnabled') === 'on',
        interviewEnabled: f.get('interviewEnabled') === 'on',
      }),
    'Job reminders saved.',
  );
}
