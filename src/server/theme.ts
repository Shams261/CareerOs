import 'server-only';
import { cookies } from 'next/headers';
import {
  resolveTextSize,
  resolveTheme,
  TEXT_SIZE_COOKIE,
  THEME_COOKIE,
} from '@/lib/theme';

export async function savedTheme() {
  return resolveTheme((await cookies()).get(THEME_COOKIE)?.value);
}
export async function savedTextSize() {
  return resolveTextSize((await cookies()).get(TEXT_SIZE_COOKIE)?.value);
}
