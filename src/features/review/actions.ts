'use server';
import { forgetAll } from '@/server/memo';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { owner } from '@/server/db';
import type { ActionState } from '@/features/schedule/actions';
import { syncSoon } from '@/features/calendar/background';
import {
  addPriority,
  movePriority,
  prepareNextWeek,
  removePriority,
  saveReview,
  saveWeeklyReminder,
  setPriorityDone,
} from './service';

type Done = string | { message: string; undo?: ActionState['undo'] };
async function perform(work: () => Promise<Done>): Promise<ActionState> {
  try {
    const done = await work();
    forgetAll();
    revalidatePath('/review');
    revalidatePath('/today');
    return typeof done === 'string'
      ? { ok: true, message: done }
      : { ok: true, message: done.message, undo: done.undo };
  } catch (error) {
    return {
      message:
        error instanceof z.ZodError
          ? error.issues.map((i) => i.message).join('; ')
          : error instanceof Error && !('code' in error)
            ? error.message
            : 'Unable to save. Reload and try again.',
    };
  }
}
const id = (f: FormData) => z.string().min(1).parse(f.get('id'));

export async function reviewAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const intent = f.get('intent') === 'complete' ? 'complete' : 'draft';
    await saveReview(await owner(), { ...Object.fromEntries(f), intent });
    return intent === 'complete'
      ? 'Weekly review completed. You can still edit it.'
      : 'Draft saved.';
  });
}
export async function priorityAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    await addPriority(await owner(), Object.fromEntries(f));
    return 'Priority added.';
  });
}
export async function priorityChangeAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const user = await owner(),
      op = z.enum(['up', 'down', 'done', 'undo', 'remove']).parse(f.get('op'));
    if (op === 'up' || op === 'down') await movePriority(user, id(f), op);
    else if (op === 'remove') {
      const p = await removePriority(user, id(f));
      return {
        message: 'Removed.',
        undo: {
          kind: 'restore-priority',
          payload: {
            weekStart: p.weekStart,
            title: p.title,
            category: p.category,
            goalId: p.goalId,
            target: p.target,
            targetUnit: p.targetUnit,
          },
        },
      };
    } else await setPriorityDone(user, id(f), op === 'done');
    return 'Priorities updated.';
  });
}
/** Generates next week from routines, then lets Calendar sync publish after the response. */
export async function prepareNextWeekAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const user = await owner();
    const r = await prepareNextWeek(user, z.string().parse(f.get('monday')));
    syncSoon(user);
    revalidatePath('/calendar');
    return r.generated
      ? `Prepared ${r.generated} day(s): ${r.blocks} blocks scheduled for next week.`
      : `Next week was already prepared (${r.blocks} blocks). Nothing changed.`;
  });
}
export async function weeklyReminderAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    await saveWeeklyReminder(await owner(), {
      enabled: f.get('enabled') === 'on',
      preferredTime: f.get('preferredTime'),
    });
    return 'Weekly review reminder saved.';
  });
}
