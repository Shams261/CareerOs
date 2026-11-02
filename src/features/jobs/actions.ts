'use server';
import { runAction } from '@/server/action';
import { owner } from '@/server/db';
import { syncSoon } from '@/features/calendar/background';
import type { ActionState } from '@/lib/action-state';
import { PreviewRequired } from '@/features/schedule/editing';
import {
  addJobNote,
  addInterviewToSchedule,
  addPrepItem,
  changeStage,
  completeFollowUp,
  createApplication,
  recordRoundResult,
  rescheduleRound,
  saveFormats,
  saveJobReminders,
  scheduleRound,
  setFollowUp,
  setPrepItemDone,
  updateDetails,
  updateRoundDetails,
} from './service';
const perform = (work: () => Promise<unknown>, message: string) =>
  runAction(
    async () => {
      const result = await work();
      const extra =
        result && typeof result === 'object'
          ? (result as {
              undo?: ActionState['undo'];
              link?: ActionState['link'];
            })
          : {};
      return {
        message,
        ...(extra.undo ? { undo: extra.undo } : {}),
        ...(extra.link ? { link: extra.link } : {}),
      };
    },
    {
      area: 'jobs',
      known: (error) =>
        error instanceof PreviewRequired
          ? {
              message: 'Possible duplicate application.',
              token: error.token,
              preview: error.lines,
            }
          : undefined,
      after: async () => syncSoon(await owner()),
    },
  );
const fields = (f: FormData) => Object.fromEntries(f);
export async function createApplicationAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const app = await createApplication(await owner(), fields(f));
    return { link: { href: `/jobs/${app.id}`, label: 'Open application' } };
  }, 'Application added.');
}
export async function detailsAction(_s: ActionState, f: FormData) {
  return perform(
    async () => updateDetails(await owner(), fields(f)),
    'Details saved.',
  );
}
export async function stageAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const activity = await changeStage(await owner(), fields(f));
    // Undo moves the application back; history stays append-only (one more entry).
    return activity.fromStage
      ? {
          undo: {
            kind: 'restore-stage',
            payload: { id: activity.applicationId, stage: activity.fromStage },
          },
        }
      : {};
  }, 'Stage updated. History recorded.');
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
  const onCalendar = f.get('addToSchedule') === 'on';
  return perform(
    async () => {
      const user = await owner();
      const round = await scheduleRound(user, fields(f));
      if (onCalendar) await addInterviewToSchedule(user, round.id);
    },
    onCalendar
      ? 'Interview scheduled and added to your schedule.'
      : 'Interview scheduled.',
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
export async function scheduleInterviewAction(_s: ActionState, f: FormData) {
  return perform(
    async () =>
      addInterviewToSchedule(await owner(), String(f.get('id') ?? '')),
    'Interview added to your schedule. It syncs to Google Calendar when connected.',
  );
}
export async function formatsAction(_s: ActionState, f: FormData) {
  return perform(
    async () =>
      saveFormats(await owner(), {
        id: f.get('id'),
        formats: f.getAll('formats'),
      }),
    'Formats saved.',
  );
}
