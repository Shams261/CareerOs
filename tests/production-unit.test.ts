import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  authorizationUrl,
  safeNext,
  verifyIdToken,
  AuthError,
} from '../src/features/auth/oidc';
import {
  configProblems,
  calendarConfig,
  pushConfig,
  type AuthConfig,
} from '../src/lib/env';
import {
  contentSecurityPolicy,
  staticSecurityHeaders,
} from '../src/server/security';
import { rateLimit } from '../src/server/rate-limit';
import {
  classifyPushStatus,
  notificationPath,
  pushPayload,
  subscriptionInput,
} from '../src/features/push/domain';

const cfg: AuthConfig = {
  baseUrl: 'https://careeros.example.com',
  clientId: 'client-123',
  clientSecret: 'secret',
  authSecret: Buffer.alloc(32, 5).toString('base64'),
  redirectUri: 'https://careeros.example.com/api/auth/callback',
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  secureCookies: true,
};
const now = new Date('2026-09-24T12:00:00Z');
const token = (claims: Record<string, unknown>) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const good = {
  iss: 'https://accounts.google.com',
  aud: 'client-123',
  exp: +now / 1000 + 600,
  iat: +now / 1000,
  nonce: 'n1',
  email: 'Owner@Example.com',
  email_verified: true,
};
const expected = {
  clientId: 'client-123',
  nonce: 'n1',
  ownerEmail: 'owner@example.com',
  now,
};

describe('owner sign-in (OIDC)', () => {
  it('requests only openid email with state, nonce and PKCE — never calendar scopes', () => {
    const u = new URL(
      authorizationUrl(cfg, { state: 's', codeChallenge: 'c', nonce: 'n' }),
    );
    expect(u.searchParams.get('scope')).toBe('openid email');
    expect(u.searchParams.get('scope')).not.toMatch(/calendar/);
    expect(u.searchParams.get('redirect_uri')).toBe(cfg.redirectUri);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('nonce')).toBe('n');
    expect(u.searchParams.has('access_type')).toBe(false);
  });
  it('accepts only the configured, verified owner with valid claims', () => {
    expect(verifyIdToken(token(good), expected)).toBe('owner@example.com');
    const code = (claims: Record<string, unknown>) => {
      try {
        verifyIdToken(token({ ...good, ...claims }), expected);
        return 'ok';
      } catch (e) {
        return (e as AuthError).code;
      }
    };
    expect(code({ email: 'someone@gmail.com' })).toBe('not_owner');
    expect(code({ email_verified: false })).toBe('email_unverified');
    expect(code({ aud: 'other-client' })).toBe('invalid_token');
    expect(code({ iss: 'https://evil.example.com' })).toBe('invalid_token');
    expect(code({ exp: +now / 1000 - 1 })).toBe('invalid_token');
    expect(code({ nonce: 'replayed' })).toBe('invalid_token');
    expect(() => verifyIdToken('garbage', expected)).toThrow(AuthError);
  });
  it('allows only same-origin return paths (no open redirect)', () => {
    expect(safeNext('/dsa/abc?x=1')).toBe('/dsa/abc?x=1');
    for (const bad of [
      '//evil.com',
      'https://evil.com',
      '/\\evil.com',
      'javascript:alert(1)',
      '/login',
      '',
      null,
    ])
      expect(safeNext(bad)).toBe('/today');
  });
});

const baseEnv = {
  DATABASE_URL: 'postgresql://u:p@db.example.com:5432/careeros',
  OWNER_EMAIL: 'owner@example.com',
  CRON_SECRET: 'c'.repeat(40),
  APP_BASE_URL: 'https://careeros.example.com',
  GOOGLE_CLIENT_ID: 'client',
  GOOGLE_CLIENT_SECRET: 'super-secret-value',
  AUTH_SECRET: Buffer.alloc(32, 1).toString('base64'),
};
describe('environment validation', () => {
  it('accepts a complete configuration and reports missing names without values', () => {
    expect(configProblems({ ...baseEnv, NODE_ENV: 'production' })).toEqual([]);
    const problems = configProblems({
      ...baseEnv,
      AUTH_SECRET: 'short',
      CRON_SECRET: 'x',
      NODE_ENV: 'production',
    });
    expect(problems.join('\n')).toMatch(/AUTH_SECRET/);
    expect(problems.join('\n')).toMatch(/CRON_SECRET/);
    expect(problems.join('\n')).not.toMatch(
      /super-secret-value|postgresql:\/\/u:p/,
    );
  });
  it('requires HTTPS in production, validates optional integrations, and restricts overrides to loopback', () => {
    expect(
      configProblems({
        ...baseEnv,
        NODE_ENV: 'production',
        APP_BASE_URL: 'http://careeros.example.com',
      }).join(),
    ).toMatch(/HTTPS/);
    expect(
      configProblems({
        ...baseEnv,
        NODE_ENV: 'production',
        APP_BASE_URL: 'http://localhost:3000',
      }),
    ).toEqual([]);
    expect(
      configProblems({
        ...baseEnv,
        NODE_ENV: 'production',
        VAPID_PUBLIC_KEY: 'bad',
      }).join(),
    ).toMatch(/VAPID/);
    expect(
      configProblems({
        ...baseEnv,
        NODE_ENV: 'production',
        GOOGLE_OAUTH_TOKEN_URL: 'https://evil.example.com/token',
      }).join(),
    ).toMatch(/loopback/);
    const saved = process.env;
    process.env = { ...baseEnv } as unknown as NodeJS.ProcessEnv;
    try {
      expect(calendarConfig()).toBeNull();
      expect(pushConfig()).toBeNull();
      process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString(
        'base64',
      );
      expect(calendarConfig()?.redirectUri).toBe(
        'https://careeros.example.com/api/calendar/oauth/callback',
      );
    } finally {
      process.env = saved;
    }
  });
});

describe('security headers and rate limiting', () => {
  it('builds a nonce CSP without script unsafe-inline, and blocks framing', () => {
    const csp = contentSecurityPolicy('abc123', {
      dev: false,
      https: true,
      formTargets: ['https://accounts.google.com'],
    });
    expect(csp).toContain(`script-src 'self' 'nonce-abc123' 'strict-dynamic'`);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
    expect(csp).toContain(`frame-ancestors 'none'`);
    expect(csp).toContain(`form-action 'self' https://accounts.google.com`);
    expect(csp).toContain(`object-src 'none'`);
    expect(csp).toContain('upgrade-insecure-requests');
    expect(
      contentSecurityPolicy('x', { dev: false, https: false, formTargets: [] }),
    ).not.toContain('upgrade-insecure-requests');
    expect(
      contentSecurityPolicy('x', { dev: true, https: false, formTargets: [] }),
    ).toContain(`'unsafe-eval'`);
    const prod = staticSecurityHeaders(true).map((h) => h.key);
    expect(prod).toEqual(
      expect.arrayContaining([
        'X-Content-Type-Options',
        'Referrer-Policy',
        'Permissions-Policy',
        'X-Frame-Options',
        'Strict-Transport-Security',
      ]),
    );
    expect(staticSecurityHeaders(false).map((h) => h.key)).not.toContain(
      'Strict-Transport-Security',
    );
  });
  it('limits bursts per key and resets after the window', () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit('k', 3, 60000, t)).toBe(true);
    expect(rateLimit('k', 3, 60000, t + 1)).toBe(false);
    expect(rateLimit('other', 3, 60000, t + 1)).toBe(true);
    expect(rateLimit('k', 3, 60000, t + 60000)).toBe(true);
  });
});

describe('push payloads and service worker', () => {
  it('routes notification clicks to safe paths and keeps payloads minimal', () => {
    expect(
      notificationPath('DSA_REVISION', 'u:DSA_REVISION:day:2026-09-24'),
    ).toBe('/dsa');
    expect(
      notificationPath('WEEKLY_REVIEW', 'u:WEEKLY_REVIEW:week:2026-09-21'),
    ).toBe('/review');
    expect(
      notificationPath('JOB_FOLLOW_UP', 'u:JOB_FOLLOW_UP:app123:2026-09-24'),
    ).toBe('/jobs/app123');
    expect(
      notificationPath('DAILY_PROGRESS', 'u:DAILY_PROGRESS:day:2026-09-24'),
    ).toBe('/today');
    const payload = JSON.parse(
      pushPayload({
        id: 'n1',
        type: 'INTERVIEW',
        title: 'Interview soon',
        dedupeKey: 'u:INTERVIEW:r1:x',
      }),
    );
    expect(Object.keys(payload).sort()).toEqual([
      'body',
      'tag',
      'title',
      'url',
    ]);
    expect(classifyPushStatus(201)).toBe('delivered');
    expect(classifyPushStatus(410)).toBe('gone');
    expect(classifyPushStatus(404)).toBe('gone');
    expect(classifyPushStatus(503)).toBe('transient');
    expect(classifyPushStatus(0)).toBe('transient');
    expect(classifyPushStatus(403)).toBe('rejected');
    expect(
      subscriptionInput.safeParse({
        endpoint: 'http://push.example.com/x',
        keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
      }).success,
    ).toBe(false);
  });
  it('shows pushes and opens only same-origin paths on click', async () => {
    const listeners: Record<string, (e: unknown) => void> = {};
    const shown: { title: string; options: { data: { url: string } } }[] = [];
    const opened: string[] = [];
    const self = {
      location: { origin: 'https://careeros.example.com' },
      addEventListener: (t: string, f: (e: unknown) => void) =>
        (listeners[t] = f),
      registration: {
        showNotification: async (
          title: string,
          options: { data: { url: string } },
        ) => void shown.push({ title, options }),
      },
      clients: {
        claim: async () => {},
        matchAll: async () => [],
        openWindow: async (u: string) => void opened.push(u),
      },
      skipWaiting: () => {},
    };
    runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, URL });
    const wait: Promise<unknown>[] = [];
    const push = (data: unknown) =>
      listeners.push({
        data: { json: () => data },
        waitUntil: (p: Promise<unknown>) => wait.push(p),
      });
    push({ title: 'CareerOS', body: 'Review due', url: '/dsa' });
    push({ title: 'CareerOS', body: 'x', url: 'https://evil.example.com' });
    push({ title: 'CareerOS', body: 'x', url: '//evil.example.com' });
    await Promise.all(wait);
    expect(shown.map((s) => s.options.data.url)).toEqual([
      '/dsa',
      '/today',
      '/today',
    ]);
    const close = vi.fn();
    listeners.notificationclick({
      notification: { close, data: { url: '/review' } },
      waitUntil: (p: Promise<unknown>) => wait.push(p),
    });
    await Promise.all(wait);
    expect(close).toHaveBeenCalled();
    expect(opened).toEqual(['https://careeros.example.com/review']);
  });
});
