import 'server-only';
import { db } from './db';
import { staleJobs } from '@/lib/job-health';

/** Must equal the newest prisma/migrations directory (enforced by a test). */
export const LATEST_MIGRATION = '20261029090000_default_curriculum';

/** Safe to expose: statuses only, never URLs, versions of secrets or user data. */
export async function healthCheck() {
  try {
    const [[tz], [migration]] = await Promise.all([
      db().$queryRaw<{ TimeZone: string }[]>`SHOW TimeZone`,
      db().$queryRaw<{ applied: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM "_prisma_migrations"
          WHERE migration_name = ${LATEST_MIGRATION} AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied`,
    ]);
    const utc = tz.TimeZone === 'UTC';
    return {
      ok: utc && migration.applied,
      database: 'ok' as const,
      sessionTimeZone: utc ? ('UTC' as const) : ('not-utc' as const),
      schema: migration.applied
        ? ('current' as const)
        : ('migration-pending' as const),
    };
  } catch {
    return {
      ok: false,
      database: 'unreachable' as const,
      sessionTimeZone: 'unknown' as const,
      schema: 'unknown' as const,
    };
  }
}

/**
 * Whether the scheduled jobs are running (WI-051): "ok" or "stale", never their names or
 * times, so the public health check can feed an external alert without saying more. It is
 * separate from readiness: a stale job must not make the host restart a healthy app.
 */
export async function jobFreshness(now = new Date()) {
  try {
    const runs = await db().jobRun.findMany({
      select: { name: true, lastSucceededAt: true },
    });
    return staleJobs(runs, now).length ? ('stale' as const) : ('ok' as const);
  } catch {
    return 'unknown' as const;
  }
}
