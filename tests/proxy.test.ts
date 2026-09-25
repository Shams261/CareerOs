import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const { session } = vi.hoisted(() => ({ session: { value: null as unknown } }));
vi.mock('@/server/session', () => ({
  SESSION_COOKIE: 'careeros_session',
  resolveSession: async () => session.value,
}));
const url = process.env.TEST_DATABASE_URL;
describe('proxy access control', () => {
  it('guards cron, private pages and APIs; leaves validated public endpoints open; sets CSP', async () => {
    Object.assign(process.env, {
      CRON_SECRET: 's'.repeat(40),
      OWNER_EMAIL: 'o@example.com',
      DATABASE_URL: url ?? 'postgresql://x@localhost/x',
    });
    const { proxy } = await import('../src/proxy');
    const { NextRequest } = await import('next/server');
    const req = (path: string, headers: Record<string, string> = {}) =>
      new NextRequest(`https://careeros.example.com${path}`, { headers });
    session.value = null;
    expect((await proxy(req('/api/notifications/process'))).status).toBe(401);
    expect(
      (
        await proxy(
          req('/api/calendar/sync', {
            authorization: `Bearer ${'x'.repeat(40)}`,
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await proxy(
          req('/api/notifications/process', {
            authorization: `Bearer ${'s'.repeat(40)}`,
          }),
        )
      ).status,
    ).toBe(200);
    const page = await proxy(req('/jobs/abc?tab=1'));
    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toBe(
      'https://careeros.example.com/login?next=%2Fjobs%2Fabc%3Ftab%3D1',
    );
    const api = await proxy(req('/api/export'));
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: 'unauthorized' });
    for (const open of [
      '/login',
      '/api/health',
      '/api/auth/callback',
      '/api/calendar/webhook',
      '/manifest.webmanifest',
      '/sw.js',
      '/icons/icon-192.png',
    ])
      expect((await proxy(req(open))).status, open).toBe(200);
    session.value = { user: { id: 'u' } };
    const ok = await proxy(req('/today'));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-security-policy')).toMatch(
      /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
    );
    expect(ok.headers.get('cache-control')).toBe('private, no-store');
  });
});
