import 'server-only';
import { cookies } from 'next/headers';
import {
  resolveTextSize,
  resolveTheme,
  TEXT_SIZE_COOKIE,
  THEME_COOKIE,
} from '@/lib/theme';
import {
  resolveButtonPref,
  RUMI_BUTTON_COOKIE,
} from '@/features/agent/button-pref';

export async function savedTheme() {
  return resolveTheme((await cookies()).get(THEME_COOKIE)?.value);
}
export async function savedTextSize() {
  return resolveTextSize((await cookies()).get(TEXT_SIZE_COOKIE)?.value);
}
/** WI-115: where the round Rumi button sits, or whether it is hidden, for this browser. */
export async function savedRumiButton() {
  return resolveButtonPref((await cookies()).get(RUMI_BUTTON_COOKIE)?.value);
}
