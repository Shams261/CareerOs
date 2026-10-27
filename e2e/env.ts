import { userInfo } from 'node:os';

/**
 * The browser smoke suite's environment (WI-052). Every value is a throwaway for a local or CI
 * run against fakes on loopback: no real Google, OpenRouter or database is ever reached.
 */
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_OWNER = 'owner@example.com';
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  `postgresql://${userInfo().username}@127.0.0.1:5432/silsila_e2e`;

// 32 fixed bytes, base64: valid shape for the app's key checks, meaningless anywhere else.
const testKey = (seed: string) =>
  Buffer.from(seed.padEnd(32, '-').slice(0, 32)).toString('base64');

export const appEnv: Record<string, string> = {
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  DATABASE_URL: E2E_DATABASE_URL,
  OWNER_EMAIL: E2E_OWNER,
  CRON_SECRET: 'e2e-only-scheduler-secret-not-for-deployment',
  APP_BASE_URL: E2E_BASE_URL,
  AUTH_SECRET: testKey('e2e-auth-secret'),
  CALENDAR_TOKEN_ENCRYPTION_KEY: testKey('e2e-calendar-key'),
  GOOGLE_CLIENT_ID: 'e2e-client-id',
  GOOGLE_CLIENT_SECRET: 'e2e-client-secret',
  GOOGLE_OAUTH_AUTH_URL: 'http://127.0.0.1:4455/o/oauth2/v2/auth',
  GOOGLE_OAUTH_TOKEN_URL: 'http://127.0.0.1:4455/token',
  GOOGLE_OAUTH_REVOKE_URL: 'http://127.0.0.1:4455/revoke',
  GOOGLE_CALENDAR_API_URL: 'http://127.0.0.1:4455/calendar/v3',
  OPENROUTER_API_KEY: 'sk-or-v1-e2eonlyfakekeyforthesmokesuite000000',
  OPENROUTER_API_URL: 'http://127.0.0.1:4466/api/v1',
};
