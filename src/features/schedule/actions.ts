'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { owner } from '@/server/db';
import { syncSoon } from '@/features/calendar/background';
import { saveBlock, saveRoutine, PreviewRequired } from './editing';
import { dateInput, shiftDay } from './domain';
import { generatePlan, locked } from './service';
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
};
function refresh() {
  for (const route of ['/today', '/calendar', '/review', '/jobs'])
    revalidatePath(route);
}
async function perform(work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    refresh();
    // Local change is committed; Google Calendar catches up after the response (ADR-010).
    syncSoon(await owner());
    return { message, ok: true };
  } catch (error) {
    if (error instanceof PreviewRequired)
      return {
        message: error.message,
        token: error.token,
        preview: error.lines,
      };
    if (error instanceof z.ZodError)
      return {
        message: error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
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
    await saveBlock(
      await owner(),
      Object.fromEntries(form),
      form.get('allowOverlap') === 'on',
      String(form.get('version') ?? ''),
    );
    return 'Day saved. Your recurring routine is unchanged.';
  });
}
export async function routineAction(_state: ActionState, form: FormData) {
  return perform(async () => {
    const raw = {
      ...Object.fromEntries(form),
      weekdays: form.getAll('weekdays'),
      enabled: form.get('enabled') === 'on',
    };
    const changed = await saveRoutine(await owner(), raw, {
      sync: form.get('scope') === 'future',
      token: String(form.get('token') ?? ''),
      version: String(form.get('version') ?? ''),
      remove: form.get('remove') === 'on',
      allowOverlap: form.get('allowOverlap') === 'on',
    });
    return `Routine saved. ${changed} dated blocks updated; daily overrides and actual work preserved.`;
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
    return action === 'complete'
      ? 'Block completed. Planned times preserved.'
      : 'Progress saved.';
  });
}
export async function manualAction(_state: ActionState, form: FormData) {
  return perform(async () => {
    await logSession(await owner(), Object.fromEntries(form));
    return 'Actual time saved. Complete the block separately when finished.';
  });
}
export async function generationAction(_state: ActionState, form: FormData) {
  return perform(async () => {
    const user = await owner(),
      day = dateInput.parse(form.get('day')),
      count = z.coerce.number().int().min(1).max(7).parse(form.get('count'));
    for (let i = 0; i < count; i++) await generatePlan(user, shiftDay(day, i));
    return `${count} day(s) ready. Existing plans preserved.`;
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
