import { z } from 'zod';
const schema = z.object({
  DATABASE_URL: z.url().refine((v) => /^postgres(ql)?:/.test(v)),
  OWNER_EMAIL: z.email(),
  APP_PASSWORD: z.string().min(16),
  CRON_SECRET: z.string().min(32),
});
export function env() {
  return schema.parse(process.env);
}

/** Official Google endpoints. Overrides exist only for local fakes and must point at loopback. */
const GOOGLE_DEFAULTS = {
  GOOGLE_OAUTH_AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  GOOGLE_OAUTH_TOKEN_URL: 'https://oauth2.googleapis.com/token',
  GOOGLE_OAUTH_REVOKE_URL: 'https://oauth2.googleapis.com/revoke',
  GOOGLE_CALENDAR_API_URL: 'https://www.googleapis.com/calendar/v3',
};
const loopback = (v: string) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(v).hostname);
const calendarSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REDIRECT_URI: z.url(),
  CALENDAR_TOKEN_ENCRYPTION_KEY: z.string().min(1),
  GOOGLE_CALENDAR_WEBHOOK_BASE_URL: z
    .url()
    .refine((v) => v.startsWith('https://'), 'Push requires an HTTPS URL')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  ...Object.fromEntries(
    Object.keys(GOOGLE_DEFAULTS).map((k) => [
      k,
      z
        .url()
        .refine(loopback, `${k} may only be overridden with a loopback URL`)
        .optional()
        .or(z.literal('').transform(() => undefined)),
    ]),
  ),
});
export type CalendarConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: string;
  webhookBaseUrl?: string;
  authUrl: string;
  tokenUrl: string;
  revokeUrl: string;
  apiUrl: string;
};
/** Null when Google Calendar is not configured; throws when configured incompletely. */
export function calendarConfig(): CalendarConfig | null {
  if (!process.env.GOOGLE_CLIENT_ID) return null;
  const c = calendarSchema.parse(process.env) as Record<
    string,
    string | undefined
  >;
  return {
    clientId: c.GOOGLE_CLIENT_ID!,
    clientSecret: c.GOOGLE_CLIENT_SECRET!,
    redirectUri: c.GOOGLE_OAUTH_REDIRECT_URI!,
    encryptionKey: c.CALENDAR_TOKEN_ENCRYPTION_KEY!,
    webhookBaseUrl: c.GOOGLE_CALENDAR_WEBHOOK_BASE_URL,
    authUrl: c.GOOGLE_OAUTH_AUTH_URL ?? GOOGLE_DEFAULTS.GOOGLE_OAUTH_AUTH_URL,
    tokenUrl:
      c.GOOGLE_OAUTH_TOKEN_URL ?? GOOGLE_DEFAULTS.GOOGLE_OAUTH_TOKEN_URL,
    revokeUrl:
      c.GOOGLE_OAUTH_REVOKE_URL ?? GOOGLE_DEFAULTS.GOOGLE_OAUTH_REVOKE_URL,
    apiUrl:
      c.GOOGLE_CALENDAR_API_URL ?? GOOGLE_DEFAULTS.GOOGLE_CALENDAR_API_URL,
  };
}
