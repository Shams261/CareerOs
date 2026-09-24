import 'server-only';
import { PrismaClient } from '@/generated/prisma/client';
import { createPgAdapter } from '@/lib/database';
import { env } from '@/lib/env';
const globalDb = globalThis as unknown as { db?: PrismaClient };
export function db() {
  return (globalDb.db ??= new PrismaClient({
    adapter: createPgAdapter(env().DATABASE_URL),
  }));
}
export async function owner() {
  return db().user.findUniqueOrThrow({ where: { email: env().OWNER_EMAIL } });
}
/** The application session's TimeZone; must be UTC (see instrumentation). */
export async function sessionTimeZone() {
  const [row] = await db().$queryRaw<{ TimeZone: string }[]>`SHOW TimeZone`;
  return row.TimeZone;
}
/**
 * Startup invariant (ADR-009): the application session must be UTC or writes would be shifted.
 * A non-UTC server default is only a warning: sessions are pinned, but data written by versions
 * before WI-005.1 may need `pnpm timestamps:audit` unless a repair is already recorded.
 */
export async function verifyDatabaseTime() {
  const zone = await sessionTimeZone();
  if (zone !== 'UTC')
    throw new Error(
      `CareerOS database sessions must use UTC, but this session reports ${zone}. If a transaction-mode pooler drops startup options, set the database default TimeZone to UTC.`,
    );
  const { Client } = await import('pg');
  const raw = new Client({ connectionString: env().DATABASE_URL });
  try {
    await raw.connect();
    const server = (await raw.query<{ TimeZone: string }>('SHOW TimeZone'))
      .rows[0].TimeZone;
    if (server === 'UTC') return;
    const [ledger] = await db().$queryRaw<{ present: boolean }[]>`
      SELECT to_regclass('"MaintenanceRecord"') IS NOT NULL AS present`;
    const repaired = ledger.present
      ? await db().$queryRaw<unknown[]>`
          SELECT 1 FROM "MaintenanceRecord" WHERE id = 'timestamp-repair:legacy-session-zone:v1'`
      : [];
    if (!repaired.length)
      console.warn(
        `[careeros] Database server default TimeZone is ${server}. Sessions are pinned to UTC, but data written before WI-005.1 may be shifted. Run "pnpm timestamps:audit" (see README: Legacy local database repair).`,
      );
  } finally {
    await raw.end().catch(() => {});
  }
}
