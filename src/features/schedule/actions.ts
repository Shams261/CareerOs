'use server';
import { deleteBlock } from '@/features/deletes/service';
import { blockUndo } from '@/features/deletes/domain';
import { planLine } from '@/features/today/home';
import { forgetAll } from '@/server/memo';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { issueMessages } from '@/lib/validation';
import { db, owner } from '@/server/db';
import { minutes } from '@/lib/time';
import { recordedText } from './row';
import { syncSoon } from '@/features/calendar/background';
import { saveBlock, saveRoutine, PreviewRequired } from './editing';
import { dateInput } from './domain';
import { locked, recordReview } from './service';
import { completedMessage } from '@/features/execution/service';
import {
  execute,
  logSession,
  stopUnlinkedSession,
} from '@/features/execution/service';
export type ActionState = {
  message: string;
  ok?: boolean;
  token?: string;
  preview?: string[];
  /** A one-click way back, shown beside the success message for a few seconds. */
  undo?: { kind: string; payload: unknown; label?: string };
  /** Where to go next, shown beside the success message ("Open application"). */
  link?: { href: string; label: string };
};
function refresh() {
  for (const route of ['/today', '/calendar', '/review', '/jobs', '/focus'])
    revalidatePath(route);
}
type Done =
  | string
  | {
      message: string;
      undo?: ActionState['undo'];
      link?: ActionState['link'];
    };
async function perform(work: () => Promise<Done>): Promise<ActionState> {
  try {
    const done = await work();
    forgetAll();
    refresh();
    // Local change is committed; Google Calendar catches up after the response (ADR-010).
    syncSoon(await owner());
    return typeof done === 'string'
      ? { message: done, ok: true }
      : { message: done.message, undo: done.undo, link: done.link, ok: true };
  } catch (error) {
    if (error instanceof PreviewRequired)
      return {
        message: error.message,
        token: error.token,
        preview: error.lines,
      };
    if (error instanceof z.ZodError)
      return {
        message: issueMessages(error.issues),
      };
    console.error(
      'Schedule operation failed',
      error instanceof Error ? error.message : 'Unknown',
    );
    return {
      message:
        error instanceof Error && !('code' in error)
          ? error.message
          : 'Unable to save. Reload and try again.',
    };
  }
}
export async function blockAction(_state: ActionState, form: FormData) {
  return perform(async () => {
    const saved = await saveBlock(
      await owner(),
      Object.fromEntries(form),
      form.get('allowOverlap') === 'on',
      String(form.get('version') ?? ''),
    );
    // Undo on a new block cancels it (history stays; nothing is deleted).
    // A new block is answered with one quiet line and its time (WI-071).
    return saved.created
      ? {
          message: planLine(String(form.get('startLocal') ?? ''), saved.id),
          undo: { kind: 'cancel-block', payload: { id: saved.id } },
        }
      : 'Saved for this day.';
  });
}
export async function routineAction(_state: ActionState, form: FormData) {
  return perform(async () => {
    const raw = {
      ...Object.fromEntries(form),
      weekdays: form.getAll('weekdays'),
      enabled: form.get('enabled') === 'on',
    };
    const { changed, added } = await saveRoutine(await owner(), raw, {
      sync: form.get('scope') === 'future',
      token: String(form.get('token') ?? ''),
      version: String(form.get('version') ?? ''),
      remove: form.get('remove') === 'on',
      allowOverlap: form.get('allowOverlap') === 'on',
    });
    const days = (n: number) => `${n} planned day${n === 1 ? '' : 's'}`;
    if (form.get('remove') === 'on') return 'Routine removed.';
    if (!form.get('id'))
      return added ? `Routine added to ${days(added)}.` : 'Routine added.';
    return changed
      ? `Routine saved. ${days(changed)} updated.`
      : 'Routine saved. Days already planned keep their times.';
  });
}
export async function executionAction(_state: ActionState, form: FormData) {
  // Start in one click (WI-066): the session begins and Focus opens already running. The
  // redirect stays outside `perform`, which would catch it; a refusal (another session runs)
  // shows beside the button instead.
  if (form.get('action') === 'focus') {
    const id = z.string().min(1).parse(form.get('id'));
    const started = await perform(async () => {
      await execute(await owner(), id, 'start', '', new Date());
      return 'Started.';
    });
    if (!started.ok) return started;
    redirect(`/focus?block=${encodeURIComponent(id)}`);
  }
  return perform(async () => {
    const action = z
      .enum(['start', 'stop', 'complete', 'skip', 'cancel', 'reset', 'delete'])
      .parse(form.get('action'));
    // Delete from the row's menu (WI-066), with the same Undo as the panel's Delete.
    if (action === 'delete') {
      const id = z.string().min(1).parse(form.get('id'));
      const gone = await deleteBlock(await owner(), id);
      return { message: `Deleted ${gone.title}.`, undo: blockUndo(id, gone) };
    }
    await execute(
      await owner(),
      z.string().min(1).parse(form.get('id')),
      action,
      String(form.get('reason') ?? ''),
      new Date(),
      {
        intention: String(form.get('intention') ?? ''),
        learned: String(form.get('learned') ?? ''),
        sound: String(form.get('sound') ?? ''),
      },
    );
    const id = String(form.get('id'));
    if (action === 'skip' || action === 'cancel')
      return {
        message: action === 'skip' ? 'Skipped.' : 'Block cancelled.',
        undo: { kind: 'block-reset', payload: { id } },
      };
    if (action === 'stop') return pausedMessage(id);
    return action === 'complete'
      ? completedMessage(await owner(), id, new Date())
      : 'Saved.';
  });
}
/** Pause says where the block stands (WI-067): "Paused · 12 min so far. Resume when you are ready." */
async function pausedMessage(id: string) {
  const user = await owner();
  const sessions = await db().actualSession.findMany({
    where: { userId: user.id, taskId: id, endedAt: { not: null } },
    select: { startedAt: true, endedAt: true },
  });
  const total = sessions.reduce(
    (n, s) => n + minutes(s.startedAt, s.endedAt!),
    0,
  );
  return `Paused · ${recordedText(total)} so far. Resume when you are ready.`;
}
export async function manualAction(_state: ActionState, form: FormData) {
  return perform(async () => {
    await logSession(await owner(), Object.fromEntries(form));
    return 'Time saved.';
  });
}
export async function reviewAction(_state: ActionState, form: FormData) {
  return perform(async () => {
    const input = z
      .object({
        day: dateInput,
        notes: z.string().max(1000),
        blocker: z.string().max(500),
        carryForward: z.string().max(500),
        rating: z.union([z.literal(''), z.coerce.number().int().min(1).max(5)]),
      })
      .parse(Object.fromEntries(form));
    const user = await owner();
    await locked(user.id, (tx) =>
      recordReview(tx, user.id, input.day, {
        notes: input.notes,
        blocker: input.blocker,
        carryForward: input.carryForward,
        rating: input.rating === '' ? null : input.rating,
      }),
    );
    return 'Daily review saved.';
  });
}

export async function stopUnlinkedAction(_state: ActionState, form: FormData) {
  return perform(async () => {
    await stopUnlinkedSession(
      await owner(),
      z.string().min(1).parse(form.get('id')),
    );
    return 'Session stopped.';
  });
}
