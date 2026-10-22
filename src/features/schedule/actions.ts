'use server';
import { forgetAll } from '@/server/memo';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { issueMessages } from '@/lib/validation';
import { owner } from '@/server/db';
import { syncSoon } from '@/features/calendar/background';
import { saveBlock, saveRoutine, PreviewRequired } from './editing';
import { dateInput } from './domain';
import { locked } from './service';
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
  for (const route of ['/today', '/calendar', '/review', '/jobs'])
    revalidatePath(route);
}
type Done = string | { message: string; undo?: ActionState['undo'] };
async function perform(work: () => Promise<Done>): Promise<ActionState> {
  try {
    const done = await work();
    forgetAll();
    refresh();
    // Local change is committed; Google Calendar catches up after the response (ADR-010).
    syncSoon(await owner());
    return typeof done === 'string'
      ? { message: done, ok: true }
      : { message: done.message, undo: done.undo, ok: true };
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
    return saved.created
      ? {
          message: 'Added for this day.',
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
  return perform(async () => {
    const action = z
      .enum(['start', 'stop', 'complete', 'skip', 'cancel', 'reset'])
      .parse(form.get('action'));
    await execute(
      await owner(),
      z.string().min(1).parse(form.get('id')),
      action,
      String(form.get('reason') ?? ''),
    );
    const id = String(form.get('id'));
    if (action === 'skip' || action === 'cancel')
      return {
        message: action === 'skip' ? 'Skipped.' : 'Block cancelled.',
        undo: { kind: 'block-reset', payload: { id } },
      };
    return action === 'complete' ? 'Completed.' : 'Saved.';
  });
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
    await locked(user.id, async (tx) => {
      const plan = await tx.dailyPlan.upsert({
        where: { userId_date: { userId: user.id, date: new Date(input.day) } },
        create: {
          userId: user.id,
          date: new Date(input.day),
          reviewedAt: new Date(),
        },
        update: { reviewedAt: new Date() },
      });
      const data = {
        notes: input.notes,
        blocker: input.blocker,
        carryForward: input.carryForward,
        rating: input.rating === '' ? null : input.rating,
        completedAt: new Date(),
      };
      await tx.dailyCheckIn.upsert({
        where: { dailyPlanId: plan.id },
        create: { ...data, userId: user.id, dailyPlanId: plan.id },
        update: data,
      });
      await tx.notificationLog.updateMany({
        where: {
          userId: user.id,
          type: { in: ['DAILY_PROGRESS', 'MISSED_CHECK_IN'] },
          readAt: null,
          dedupeKey: { endsWith: `:${input.day}` },
        },
        data: { readAt: new Date() },
      });
    });
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
