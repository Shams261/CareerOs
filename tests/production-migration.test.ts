import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20260928090000_production_launch';
describe.skipIf(!url)('WI-007 to WI-008 upgrade', () => {
  it('adds sessions/push/job runs and never pushes pre-existing reminders', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `prod_upgrade_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`SET TimeZone TO 'UTC'`);
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      const all = (await readdir('prisma/migrations'))
        .filter((d) => !d.endsWith('.toml'))
        .sort();
      for (const m of all.slice(0, all.indexOf(target)))
        await client.query(
          await readFile(`prisma/migrations/${m}/migration.sql`, 'utf8'),
        );
      await client.query(`
        INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('u','u@example.com','U',now());
        INSERT INTO "NotificationLog" (id,"userId",type,title,body,"scheduledFor","dedupeKey") VALUES ('n','u','DAILY_PROGRESS','t','b',now(),'k');`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect(
        (
          await client.query(
            `SELECT "pushAttempts", "sentAt" FROM "NotificationLog"`,
          )
        ).rows,
      ).toEqual([{ pushAttempts: 3, sentAt: null }]);
      for (const t of ['Session', 'PushSubscription', 'JobRun'])
        expect((await client.query(`SELECT 1 FROM "${t}"`)).rowCount).toBe(0);
      await expect(
        client.query(
          `INSERT INTO "Session" (id,"userId","tokenHash","createdAt","expiresAt","lastSeenAt") VALUES ('s','u','h',now(),now() - interval '1 day',now())`,
        ),
      ).rejects.toThrow();
      await client.query(
        `INSERT INTO "PushSubscription" (id,"userId",endpoint,p256dh,auth) VALUES ('p','u','https://push.example.com/1','k','a')`,
      );
      await expect(
        client.query(
          `INSERT INTO "PushSubscription" (id,"userId",endpoint,p256dh,auth) VALUES ('p2','u','https://push.example.com/1','k','a')`,
        ),
      ).rejects.toThrow();
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
