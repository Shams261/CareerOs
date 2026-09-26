import 'server-only';
import { cookies } from 'next/headers';
import { resolveTheme, THEME_COOKIE } from '@/lib/theme';

export async function savedTheme() {
  return resolveTheme((await cookies()).get(THEME_COOKIE)?.value);
}
