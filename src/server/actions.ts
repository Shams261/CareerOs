'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db, owner } from './db';
import { localTime } from '@/lib/validation';
type ActionState = { message: string; ok?: boolean };
/** Form-state wrapper so Settings can show "Preference saved." like every other form. */
export async function reminderAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await saveReminder(form);
    return { ok: true, message: 'Preference saved.' };
  } catch (error) {
    return {
      message:
        error instanceof z.ZodError
          ? 'Enter the reminder time as HH:MM.'
          : error instanceof Error
            ? error.message
            : 'Unable to save. Reload and try again.',
    };
  }
}
export async function saveReminder(form: FormData) {
  const user = await owner();
  const time = localTime.parse(form.get('preferredTime'));
  await db().notificationPreference.upsert({
    where: { userId_type: { userId: user.id, type: 'DAILY_PROGRESS' } },
    create: {
      userId: user.id,
      type: 'DAILY_PROGRESS',
      enabled: form.get('enabled') === 'on',
      preferredTime: time,
      timezone: user.timezone,
    },
    update: { enabled: form.get('enabled') === 'on', preferredTime: time },
  });
  revalidatePath('/settings');
}
export async function readNotification(form: FormData) {
  const id = z.string().min(1).parse(form.get('id'));
  const user = await owner();
  await db().notificationLog.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath('/today');
}
