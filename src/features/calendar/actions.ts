'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { owner } from '@/server/db';
import type { ActionState } from '@/features/schedule/actions';
import {
  beginOAuth,
  CalendarError,
  defaultDeps,
  disconnectCalendar,
  errorMessages,
  getConnection,
  resolveConflict,
  saveExcludedCategories,
  syncCalendar,
} from './service';
import { OAUTH_COOKIE } from './domain';

function deps() {
  const d = defaultDeps();
  if (!d) throw new CalendarError('not_configured');
  return d;
}
async function perform(work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    revalidatePath('/calendar');
    revalidatePath('/today');
    return { ok: true, message };
  } catch (error) {
    revalidatePath('/calendar');
    return {
      message:
        error instanceof CalendarError
          ? errorMessages[error.code]
          : error instanceof z.ZodError
            ? 'Invalid request.'
            : errorMessages.unexpected,
    };
  }
}

/** Server action (origin-checked by Next) that starts OAuth with a fresh state cookie. */
export async function connectCalendarAction() {
  const d = deps();
  const { url, cookie } = beginOAuth(await owner(), d);
  (await cookies()).set(OAUTH_COOKIE, cookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(d.config.redirectUri).protocol === 'https:',
    path: '/api/calendar/oauth',
    maxAge: 600,
  });
  redirect(url);
}

export async function syncNowAction(): Promise<ActionState> {
  return perform(async () => {
    const r = await syncCalendar(await owner(), deps());
    if (!r.ok) throw new CalendarError(r.code);
    const s = r.summary;
    return `Synced. ${s.creates + s.patches + s.deletes} change(s) sent, ${s.inboundUpdates + s.inboundCancels} received${s.conflicts ? `, ${s.conflicts} conflict(s) need a decision` : ''}.`;
  });
}

export async function resolveConflictAction(_s: ActionState, form: FormData) {
  const choice = form.get('choice') === 'remote' ? 'remote' : 'local';
  const result = await perform(async () => {
    await resolveConflict(
      await owner(),
      z.string().min(1).parse(form.get('id')),
      choice,
      deps(),
    );
    return 'Conflict resolved.';
  });
  // The resolved conflict leaves the list, so confirm at panel level instead of in its form.
  if (result.ok) redirect(`/calendar?google=resolved_${choice}#google-heading`);
  return result;
}

export async function categoriesAction(_s: ActionState, form: FormData) {
  return perform(async () => {
    const all = form.getAll('category').map(String);
    const synced = new Set(form.getAll('sync').map(String));
    await saveExcludedCategories(
      await owner(),
      all.filter((c) => !synced.has(c)),
    );
    return 'Sync categories saved. Excluded categories are removed from the CareerOS calendar on the next sync.';
  });
}

export async function disconnectAction(_s: ActionState, form: FormData) {
  const user = await owner();
  const conn = await getConnection(user.id);
  const remove = form.get('remove') === 'on';
  const name = conn?.calendarName ?? 'CareerOS';
  if (remove && form.get('confirm') !== name)
    return {
      message: `Type the calendar name "${name}" exactly to confirm removing it.`,
    };
  let removed = false;
  const result = await perform(async () => {
    removed = (
      await disconnectCalendar(user, { removeCalendar: remove }, deps())
    ).removed;
    return 'Disconnected.';
  });
  // The connected panel (and this form) is replaced after disconnecting: confirm at panel level.
  if (result.ok)
    redirect(
      `/calendar?google=${removed ? 'removed' : 'disconnected'}#google-heading`,
    );
  return result;
}
