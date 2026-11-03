'use server';

import { cookies } from 'next/headers';
import { browserCookie } from '@/lib/cookie';
import { revalidatePath } from 'next/cache';
import { owner } from '@/server/db';
import { SETUP_COOKIE } from './domain';

/** Hide for now: the card leaves Today for a week; the steps stay in Settings. */
export async function hideSetupAction() {
  await owner();
  (await cookies()).set(SETUP_COOKIE, '1', browserCookie(7));
  revalidatePath('/today');
}
