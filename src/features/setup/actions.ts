'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { owner } from '@/server/db';
import { SETUP_COOKIE } from './domain';

/** Hide for now: the card leaves Today for a week; the steps stay in Settings. */
export async function hideSetupAction() {
  await owner();
  (await cookies()).set(SETUP_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure:
      process.env.NODE_ENV === 'production' &&
      process.env.APP_BASE_URL?.startsWith('https://') === true,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  revalidatePath('/today');
}
