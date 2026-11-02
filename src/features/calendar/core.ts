import 'server-only';
import { db } from '@/server/db';
import { calendarConfig, type CalendarConfig } from '@/lib/env';
import { parseEncryptionKey } from '@/lib/token-crypto';
import {
  googleCalendar,
  googleOAuth,
  type CalendarApi,
  type OAuthApi,
} from './google';

/** What every calendar module shares: its dependencies, the log line and the connection (WI-131). */
export type CalendarDeps = {
  config: CalendarConfig;
  oauth: OAuthApi;
  calendar: (accessToken: () => Promise<string>) => CalendarApi;
  now: () => Date;
};
export function defaultDeps(): CalendarDeps | null {
  const config = calendarConfig();
  if (!config) return null;
  return {
    config,
    oauth: googleOAuth(config),
    calendar: (token) => googleCalendar(config, token),
    now: () => new Date(),
  };
}
export function log(event: string, fields: Record<string, unknown>) {
  // Sanitized: ids, codes and counts only. Never tokens, keys, event bodies or notes.
  console.info(`[calendar] ${event} ${JSON.stringify(fields)}`);
}

export const key = (deps: CalendarDeps) =>
  parseEncryptionKey(deps.config.encryptionKey);
export const getConnection = (userId: string) =>
  db().calendarConnection.findUnique({ where: { userId } });
