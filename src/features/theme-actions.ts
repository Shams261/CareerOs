'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { owner } from '@/server/db';
import { TEXT_SIZE_COOKIE, TEXT_SIZES, THEME_COOKIE } from '@/lib/theme';

const cookie = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure:
    process.env.NODE_ENV === 'production' &&
    process.env.APP_BASE_URL?.startsWith('https://') === true,
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
};

export async function saveTheme(form: FormData) {
  await owner();
  const theme = form.get('theme');
  if (theme !== 'light' && theme !== 'dark') return;
  (await cookies()).set(THEME_COOKIE, theme, cookie);
  revalidatePath('/', 'layout');
}

/** Text size (WI-087): Default, Large or Larger for this browser. */
export async function saveTextSize(form: FormData) {
  await owner();
  const size = form.get('size');
  if (!TEXT_SIZES.includes(size as (typeof TEXT_SIZES)[number])) return;
  (await cookies()).set(TEXT_SIZE_COOKIE, size as string, cookie);
  revalidatePath('/', 'layout');
}
