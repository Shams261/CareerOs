import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { SESSION_COOKIE, resolveSession } from '@/server/session';
import { contentSecurityPolicy } from '@/server/security';
import { clientIp, rateLimit } from '@/server/rate-limit';

function equal(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
/** Reachable without a session; each validates its own credentials or serves no personal data. */
const PUBLIC = [
  /^\/login$/,
  /^\/api\/auth\/callback$/,
  /^\/api\/health$/,
  /^\/api\/calendar\/webhook$/,
  /^\/manifest\.webmanifest$/,
  /^\/sw\.js$/,
  /^\/icons\/[\w.-]+$/,
  /^\/apple-touch-icon\.png$/,
  /^\/favicon\.ico$/,
];
const CRON = ['/api/notifications/process', '/api/calendar/sync'];
const RATE = {
  '/api/auth/callback': 30,
  '/login': 60,
  '/api/calendar/webhook': 300,
} as Record<string, number>;

const formTargets = () => {
  const targets = new Set(['https://accounts.google.com']);
  for (const v of [process.env.GOOGLE_OAUTH_AUTH_URL])
    if (v) targets.add(new URL(v).origin);
  return [...targets];
};

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (CRON.includes(path)) {
    if (
      equal(
        request.headers.get('authorization') ?? '',
        `Bearer ${env().CRON_SECRET}`,
      )
    )
      return NextResponse.next();
    return new NextResponse('Unauthorized', { status: 401 });
  }
  if (
    RATE[path] &&
    !rateLimit(`${path}:${clientIp(request.headers)}`, RATE[path])
  )
    return new NextResponse('Too many requests', {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  const isPublic = PUBLIC.some((p) => p.test(path));
  if (!isPublic) {
    const session = await resolveSession(
      request.cookies.get(SESSION_COOKIE)?.value,
    );
    if (!session) {
      if (path.startsWith('/api/'))
        return NextResponse.json(
          { error: 'unauthorized' },
          { status: 401, headers: { 'Cache-Control': 'no-store' } },
        );
      const login = new URL('/login', request.url);
      if (path !== '/')
        login.searchParams.set('next', `${path}${request.nextUrl.search}`);
      return NextResponse.redirect(login);
    }
  }
  // Per-request nonce: Next.js reads it from the request CSP header and applies it to its scripts.
  const nonce = randomBytes(16).toString('base64');
  const csp = contentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV !== 'production',
    https: !!process.env.APP_BASE_URL?.startsWith('https://'),
    formTargets: formTargets(),
  });
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  if (!isPublic) response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
