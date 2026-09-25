import 'dotenv/config';
import { readdirSync } from 'node:fs';
import { Client } from 'pg';
import { describeDatabase, utcConnectionString } from '../src/lib/database';
import { dbName, pgEnv, run, withDb } from './lib/pg-tools';

/**
 * pnpm db:restore:verify <file.dump> [--keep]
 * Restores into a NEW scratch database (careeros_restore_verify_<timestamp>) on the server of
 * RESTORE_VERIFY_SERVER_URL (default DATABASE_URL's server), checks it, then drops it. It never
 * writes to an existing database: the scratch name must not exist and must differ from the source.
 */
const [file, ...flags] = process.argv.slice(2);
const server =
  process.env.RESTORE_VERIFY_SERVER_URL ?? process.env.DATABASE_URL;
if (!file || !server)
  throw new Error(
    'Usage: pnpm db:restore:verify <file.dump> (with DATABASE_URL or RESTORE_VERIFY_SERVER_URL set)',
  );
const scratch = `careeros_restore_verify_${Date.now()}`;
if (scratch === dbName(server))
  throw new Error('Refusing: scratch name equals the configured database.');
const target = withDb(server, scratch);
const admin = new Client({
  connectionString: utcConnectionString(withDb(server, 'postgres')),
});

async function main() {
  await admin.connect();
  const exists = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [scratch],
  );
  if (exists.rowCount) throw new Error(`Refusing: ${scratch} already exists.`);
  await admin.query(`CREATE DATABASE "${scratch}"`);
  console.log(
    `Restoring ${file} into new scratch database ${describeDatabase(target)}`,
  );
  try {
    run(
      'pg_restore',
      ['--no-owner', '--no-acl', '--exit-on-error', '--dbname', scratch, file],
      pgEnv(target),
    );
    const db = new Client({ connectionString: utcConnectionString(target) });
    await db.connect();
    try {
      const latest = readdirSync('prisma/migrations')
        .filter((d) => !d.endsWith('.toml'))
        .sort()
        .at(-1);
      const applied = (
        await db.query(
          `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`,
        )
      ).rows.map((r) => r.migration_name);
      const counts: Record<string, number> = {};
      for (const t of [
        'User',
        'DailyPlan',
        'TimeBlock',
        'ActualSession',
        'DsaAttempt',
        'LearningActivity',
        'JobApplication',
        'WeeklyReview',
        'NotificationLog',
      ])
        counts[t] = Number(
          (
            await db
              .query(`SELECT count(*) FROM "${t}"`)
              .catch(() => ({ rows: [{ count: -1 }] }))
          ).rows[0].count,
        );
      const newest = (
        await db
          .query(`SELECT max("createdAt") AS m FROM "TimeBlock"`)
          .catch(() => ({ rows: [{ m: null }] }))
      ).rows[0].m;
      console.log(
        `Migrations applied: ${applied.length} (latest in dump: ${applied.at(-1) ?? 'none'}; code expects ${latest})`,
      );
      console.log(`Row counts: ${JSON.stringify(counts)}`);
      console.log(
        `Newest TimeBlock created: ${newest ? new Date(newest).toISOString() : 'none'} (recovered data age)`,
      );
      if (!counts.User)
        throw new Error('Verification failed: no users restored.');
      console.log('Restore verified.');
    } finally {
      await db.end();
    }
  } finally {
    if (flags.includes('--keep'))
      console.log(`Kept scratch database ${scratch}; drop it when done.`);
    else {
      await admin.query(`DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`);
      console.log(`Dropped scratch database ${scratch}.`);
    }
    await admin.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
