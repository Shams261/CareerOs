import { z } from 'zod';

/**
 * Environment configuration (WI-008). Required groups throw with variable NAMES only — never
 * values. Optional integrations (Calendar, Web Push) return null when not configured and throw
 * when configured incompletely.
 */
const loopback = (v: string) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(v).hostname);
const optionalUrl = z
  .url()
  .optional()
  .or(z.literal('').transform(() => undefined));
const base64Key = (name: string) =>
  z.string().refine((v) => {
    const b = Buffer.from(v, 'base64');
    return b.length === 32 && b.toString('base64') === v.trim();
  }, `${name} must be 32 random bytes, base64 (openssl rand -base64 32)`);

const core = z.object({
  DATABASE_URL: z
    .url()
    .refine(
      (v) => /^postgres(ql)?:/.test(v),
      'DATABASE_URL must be a PostgreSQL URL',
    ),
  OWNER_EMAIL: z.email(),
  CRON_SECRET: z.string().min(32),
  /** Connections per server process; keep small for hosted/serverless PostgreSQL. */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
});
export function env() {
  return core.parse(process.env);
}

/** Official Google endpoints. Overrides exist only for local fakes and must point at loopback. */
const GOOGLE_DEFAULTS = {
  GOOGLE_OAUTH_AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  GOOGLE_OAUTH_TOKEN_URL: 'https://oauth2.googleapis.com/token',
  GOOGLE_OAUTH_REVOKE_URL: 'https://oauth2.googleapis.com/revoke',
  GOOGLE_CALENDAR_API_URL: 'https://www.googleapis.com/calendar/v3',
};
const overrides = Object.fromEntries(
  Object.keys(GOOGLE_DEFAULTS).map((k) => [
    k,
    z
      .url()
      .refine(loopback, `${k} may only be overridden with a loopback URL`)
      .optional()
      .or(z.literal('').transform(() => undefined)),
  ]),
);
const endpoint = (
  c: Record<string, string | undefined>,
  k: keyof typeof GOOGLE_DEFAULTS,
) => c[k] ?? GOOGLE_DEFAULTS[k];

const authSchema = z
  .object({
    APP_BASE_URL: z.url(),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    AUTH_SECRET: base64Key('AUTH_SECRET'),
    ...overrides,
  })
  .refine(
    (c) =>
      process.env.NODE_ENV !== 'production' ||
      c.APP_BASE_URL.startsWith('https://') ||
      loopback(c.APP_BASE_URL),
    {
      message: 'APP_BASE_URL must use HTTPS in production',
      path: ['APP_BASE_URL'],
    },
  );
export type AuthConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  authSecret: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  /** Secure cookies whenever the app is served over HTTPS (always in production). */
  secureCookies: boolean;
};
/** Owner sign-in (Google OIDC, openid+email). Required: CareerOS has no other login. */
export function authConfig(): AuthConfig {
  const c = authSchema.parse(process.env) as Record<string, string | undefined>;
  const baseUrl = c.APP_BASE_URL!.replace(/\/$/, '');
  return {
    baseUrl,
    clientId: c.GOOGLE_CLIENT_ID!,
    clientSecret: c.GOOGLE_CLIENT_SECRET!,
    authSecret: c.AUTH_SECRET!,
    redirectUri: `${baseUrl}/api/auth/callback`,
    authUrl: endpoint(c, 'GOOGLE_OAUTH_AUTH_URL'),
    tokenUrl: endpoint(c, 'GOOGLE_OAUTH_TOKEN_URL'),
    secureCookies: baseUrl.startsWith('https://'),
  };
}

const calendarSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  APP_BASE_URL: optionalUrl,
  GOOGLE_OAUTH_REDIRECT_URI: optionalUrl,
  CALENDAR_TOKEN_ENCRYPTION_KEY: base64Key('CALENDAR_TOKEN_ENCRYPTION_KEY'),
  GOOGLE_CALENDAR_WEBHOOK_BASE_URL: z
    .url()
    .refine((v) => v.startsWith('https://'), 'Push requires an HTTPS URL')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  ...overrides,
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
/**
 * Google Calendar sync is enabled by CALENDAR_TOKEN_ENCRYPTION_KEY. It shares the owner's Google
 * OAuth client but has its own redirect URI and consent (calendar scope is never granted by sign-in).
 */
export function calendarConfig(): CalendarConfig | null {
  if (
    !process.env.CALENDAR_TOKEN_ENCRYPTION_KEY ||
    !process.env.GOOGLE_CLIENT_ID
  )
    return null;
  const c = calendarSchema.parse(process.env) as Record<
    string,
    string | undefined
  >;
  const redirectUri =
    c.GOOGLE_OAUTH_REDIRECT_URI ??
    (c.APP_BASE_URL
      ? `${c.APP_BASE_URL.replace(/\/$/, '')}/api/calendar/oauth/callback`
      : undefined);
  if (!redirectUri)
    throw new Error(
      'Set APP_BASE_URL or GOOGLE_OAUTH_REDIRECT_URI for Google Calendar.',
    );
  return {
    clientId: c.GOOGLE_CLIENT_ID!,
    clientSecret: c.GOOGLE_CLIENT_SECRET!,
    redirectUri,
    encryptionKey: c.CALENDAR_TOKEN_ENCRYPTION_KEY!,
    webhookBaseUrl: c.GOOGLE_CALENDAR_WEBHOOK_BASE_URL,
    authUrl: endpoint(c, 'GOOGLE_OAUTH_AUTH_URL'),
    tokenUrl: endpoint(c, 'GOOGLE_OAUTH_TOKEN_URL'),
    revokeUrl: endpoint(c, 'GOOGLE_OAUTH_REVOKE_URL'),
    apiUrl: endpoint(c, 'GOOGLE_CALENDAR_API_URL'),
  };
}

const pushSchema = z.object({
  VAPID_PUBLIC_KEY: z
    .string()
    .regex(
      /^[A-Za-z0-9_-]{80,100}$/,
      'VAPID_PUBLIC_KEY must be a base64url P-256 public key',
    ),
  VAPID_PRIVATE_KEY: z
    .string()
    .regex(
      /^[A-Za-z0-9_-]{40,50}$/,
      'VAPID_PRIVATE_KEY must be a base64url P-256 private key',
    ),
  VAPID_SUBJECT: z
    .string()
    .refine(
      (v) => /^mailto:.+@.+/.test(v) || v.startsWith('https://'),
      'VAPID_SUBJECT must be mailto: or https:',
    ),
});
export type PushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};
/** Web Push is enabled by VAPID_PUBLIC_KEY (generate with `pnpm exec web-push generate-vapid-keys`). */
export function pushConfig(): PushConfig | null {
  if (!process.env.VAPID_PUBLIC_KEY) return null;
  const c = pushSchema.parse(process.env);
  return {
    publicKey: c.VAPID_PUBLIC_KEY,
    privateKey: c.VAPID_PRIVATE_KEY,
    subject: c.VAPID_SUBJECT,
  };
}

/**
 * Startup validation: every problem as "NAME: reason", without values. Production refuses to
 * start when this list is non-empty.
 */
export function configProblems(
  source: Record<string, string | undefined> = process.env,
) {
  const problems: string[] = [];
  const saved = process.env;
  process.env = source as NodeJS.ProcessEnv;
  try {
    for (const check of [env, authConfig, calendarConfig, pushConfig])
      try {
        check();
      } catch (error) {
        if (error instanceof z.ZodError)
          for (const i of error.issues)
            problems.push(`${String(i.path[0] ?? check.name)}: ${i.message}`);
        else
          problems.push(
            `${check.name}: ${error instanceof Error ? error.message : 'invalid'}`,
          );
      }
  } finally {
    process.env = saved;
  }
  return [...new Set(problems)];
}
