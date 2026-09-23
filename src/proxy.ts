import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
function equal(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function proxy(request: NextRequest) {
  const config = env();
  if (request.nextUrl.pathname === '/api/notifications/process') {
    if (
      equal(
        request.headers.get('authorization') ?? '',
        `Bearer ${config.CRON_SECRET}`,
      )
    )
      return NextResponse.next();
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const auth = request.headers.get('authorization') ?? '';
  const credentials = auth.startsWith('Basic ')
    ? Buffer.from(auth.slice(6), 'base64').toString()
    : '';
  if (equal(credentials, `${config.OWNER_EMAIL}:${config.APP_PASSWORD}`))
    return NextResponse.next();
  return new NextResponse('Private workspace', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="CareerOS", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
