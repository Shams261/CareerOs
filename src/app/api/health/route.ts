import { healthCheck, jobFreshness } from '@/server/health';
export const runtime = 'nodejs';

/** Public liveness/readiness: statuses only (no URLs, secrets, versions or user data). */
export async function GET() {
  const [h, jobs] = await Promise.all([healthCheck(), jobFreshness()]);
  return Response.json(
    {
      status: h.ok ? 'ok' : 'degraded',
      database: h.database,
      sessionTimeZone: h.sessionTimeZone,
      schema: h.schema,
      // Scheduled jobs (WI-051); informs the uptime alert, never the status code.
      jobs,
    },
    { status: h.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
