import { healthCheck } from '@/server/health';
export const runtime = 'nodejs';

/** Public liveness/readiness: statuses only (no URLs, secrets, versions or user data). */
export async function GET() {
  const h = await healthCheck();
  return Response.json(
    {
      status: h.ok ? 'ok' : 'degraded',
      database: h.database,
      sessionTimeZone: h.sessionTimeZone,
      schema: h.schema,
    },
    { status: h.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
