'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { owner } from '@/server/db';
import { FIRST_STEPS_COOKIE } from './first-steps-cookie';

/** "Skip for now" on the empty account's three steps (WI-065): hidden for 30 days. */
export async function hideFirstStepsAction() {
  await owner();
  (await cookies()).set(FIRST_STEPS_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure:
      process.env.NODE_ENV === 'production' &&
      process.env.APP_BASE_URL?.startsWith('https://') === true,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath('/today');
}
