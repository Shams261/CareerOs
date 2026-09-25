import 'server-only';
import { db } from './db';

/** Must equal the newest prisma/migrations directory (enforced by a test). */
export const LATEST_MIGRATION = '20260928090000_production_launch';

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
