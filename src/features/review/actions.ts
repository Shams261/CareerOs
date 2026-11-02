'use server';
import { runAction } from '@/server/action';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { owner } from '@/server/db';
import type { ActionState } from '@/lib/action-state';
import { syncSoon } from '@/features/calendar/background';
import {
  addPriority,
  movePriority,
  prepareNextWeek,
  removePriority,
  saveReview,
  completeReview,
  setPriorityDone,
} from './service';

type Done = string | { message: string; undo?: ActionState['undo'] };
const perform = (work: () => Promise<Done>) =>
  runAction(work, { area: 'review' });
const id = (f: FormData) => z.string().min(1).parse(f.get('id'));

export async function reviewAction(_s: ActionState, f: FormData) {
  const intent =
    f.get('intent') === 'complete'
      ? 'complete'
      : f.get('intent') === 'next'
        ? 'next'
        : 'draft';
  const result = await perform(async () => {
    await saveReview(await owner(), {
      ...Object.fromEntries(f),
      intent: intent === 'complete' ? 'complete' : 'draft',
    });
    return intent === 'complete'
      ? 'Weekly review completed. You can still edit it.'
      : 'Draft saved.';
  });
  // "Save and continue" keeps the text, then opens the next step.
  if (result.ok && intent === 'next')
    redirect(`/review?week=${String(f.get('weekStart'))}&step=plan`);
  return result;
}
export async function completeReviewAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    await completeReview(await owner(), z.string().parse(f.get('weekStart')));
    return 'Weekly review completed. You can still edit it.';
  });
}
export async function priorityAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const p = await addPriority(await owner(), Object.fromEntries(f));
    return {
      message: 'Priority added.',
      undo: { kind: 'remove-priority', payload: { id: p.id } },
    };
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
      ? `Prepared ${r.generated} day${r.generated === 1 ? '' : 's'}: ${r.blocks} block${r.blocks === 1 ? '' : 's'} scheduled for next week.`
      : `Next week was already prepared (${r.blocks} blocks). Nothing changed.`;
  });
}
