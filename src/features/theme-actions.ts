'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { owner } from '@/server/db';
import { THEME_COOKIE } from '@/lib/theme';

export async function saveTheme(form: FormData) {
  await owner();
  const theme = form.get('theme');
  if (theme !== 'light' && theme !== 'dark') return;
  (await cookies()).set(THEME_COOKIE, theme, {
    httpOnly: true,
    sameSite: 'lax',
    secure:
      process.env.NODE_ENV === 'production' &&
      process.env.APP_BASE_URL?.startsWith('https://') === true,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/', 'layout');
}
