'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { forgetAll } from '@/server/memo';
import { db, owner } from '@/server/db';
import { issueMessages } from '@/lib/validation';
import { dayKey, hhmm } from '@/lib/time';
import { dateInput, shiftDay } from '@/features/schedule/domain';
import { saveBlock } from '@/features/schedule/editing';
import type { ActionState } from '@/features/schedule/actions';
import { syncSoon } from '@/features/calendar/background';
import { PAUSED_FOREVER } from './domain';
import {
  closeNudges,
  nudgeFeedback,
  pauseNudges,
  saveNudgeSetting,
  setRestDay,
  thisSunday,
} from './service';

async function perform(
  work: () => Promise<string | Omit<ActionState, 'ok'>>,
): Promise<ActionState> {
  try {
    const done = await work();
    forgetAll();
    for (const route of ['/today', '/settings', '/calendar'])
      revalidatePath(route);
    return typeof done === 'string'
      ? { message: done, ok: true }
      : { ...done, ok: true };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { message: issueMessages(error.issues) };
    return {
      message:
        error instanceof Error && !('code' in error)
          ? error.message
          : 'Unable to save. Reload and try again.',
    };
  }
}

/** Settings → Study nudges. Days and categories arrive as repeated fields. */
export async function nudgeSettingsAction(_s: ActionState, form: FormData) {
  return perform(async () => {
    await saveNudgeSetting(await owner(), {
      morningEnabled: form.get('morningEnabled') === 'on',
      morningTime: String(form.get('morningTime') ?? ''),
      eveningEnabled: form.get('eveningEnabled') === 'on',
      eveningTime: String(form.get('eveningTime') ?? ''),
      days: form
        .getAll('days')
        .map(Number)
        .reduce((a, b) => a | b, 0),
      onlyStudyDays: form.get('onlyStudyDays') === 'on',
      quietStart: String(form.get('quietStart') ?? ''),
      quietEnd: String(form.get('quietEnd') ?? ''),
      studyCategories: form.getAll('studyCategories').map(String),
    });
    return 'Study nudges saved.';
  });
}

/** Pause this week, pause until turned on, or resume. */
export async function nudgePauseAction(_s: ActionState, form: FormData) {
  return perform(async () => {
    const user = await owner();
    const choice = z
      .enum(['week', 'forever', 'resume'])
      .parse(form.get('pause'));
    const today = dayKey(new Date(), user.timezone);
    await pauseNudges(
      user,
      choice === 'week'
        ? thisSunday(today)
        : choice === 'forever'
          ? PAUSED_FOREVER
          : null,
    );
    return choice === 'resume'
      ? 'Study nudges are on again.'
      : choice === 'week'
        ? 'Paused until Sunday.'
        : 'Paused until you turn them on.';
  });
}

/** "Useful? Yes / Not today / Too many" on the card. */
export async function nudgeFeedbackAction(_s: ActionState, form: FormData) {
  return perform(async () => {
    const value = z
      .enum(['HELPFUL', 'NOT_TODAY', 'TOO_MANY'])
      .parse(form.get('value'));
    await nudgeFeedback(
      await owner(),
      z.string().min(1).parse(form.get('id')),
      value,
    );
    return value === 'TOO_MANY'
      ? {
          message: 'Noted. You can keep mornings only, pause or turn them off.',
          link: { href: '/settings#reminders', label: 'Study nudges' },
        }
      : 'Thanks, noted.';
  });
}

/** "Rest today": evening check-ins stop for the day; Undo makes it an ordinary day again. */
export async function restDayAction(_s: ActionState, form: FormData) {
  return perform(async () => {
    const day = dateInput.parse(form.get('day'));
    await setRestDay(await owner(), day, true);
    return {
      message: 'Rest day. Evening check-ins stop for today.',
      undo: { kind: 'clear-rest-day', payload: { day } },
    };
  });
}

/**
 * "Move to tomorrow": the block keeps its times on the next day through the existing block
 * writer (overlaps refuse with the writer's own message; nothing moves silently).
 */
export async function moveToTomorrowAction(_s: ActionState, form: FormData) {
  return perform(async () => {
    const user = await owner();
    const id = z.string().min(1).parse(form.get('id'));
    const block = await db().timeBlock.findFirst({
      where: { id, dailyPlan: { userId: user.id } },
      include: { dailyPlan: { select: { date: true } } },
    });
    if (!block) throw new Error('This block is no longer on your plan.');
    const day = block.dailyPlan.date.toISOString().slice(0, 10);
    const start = hhmm(block.plannedStart, user.timezone),
      end = hhmm(block.plannedEnd, user.timezone);
    const endShift =
      dayKey(block.plannedEnd, user.timezone) >
      dayKey(block.plannedStart, user.timezone)
        ? 2
        : 1;
    await saveBlock(
      user,
      {
        id: block.id,
        title: block.title,
        description: block.description ?? '',
        category: block.category,
        goalId: block.goalId ?? '',
        priority: block.priority,
        day: shiftDay(day, 1),
        startLocal: start,
        endDay: shiftDay(day, endShift),
        endLocal: end,
      },
      false,
      block.updatedAt.toISOString(),
    );
    await closeNudges(db(), user.id, day);
    syncSoon(user);
    return `Moved to tomorrow at ${start}.`;
  });
}
