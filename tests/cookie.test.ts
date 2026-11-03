import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserCookie } from '../src/lib/cookie';

/** The one per-browser cookie shape (WI-145): the four forms that set one share it. */
describe('browserCookie', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('is httpOnly and Lax on every host, for the days asked', () => {
    expect(browserCookie(30)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 86400,
    });
  });
  it('is Secure only in production over HTTPS', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_BASE_URL', 'https://usesilsila.me');
    expect(browserCookie(7).secure).toBe(true);
    vi.stubEnv('APP_BASE_URL', 'http://127.0.0.1:3000');
    expect(browserCookie(7).secure).toBe(false);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_BASE_URL', 'https://usesilsila.me');
    expect(browserCookie(7).secure).toBe(false);
  });
});
