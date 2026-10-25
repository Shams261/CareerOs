import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261025160000_notification_opened_feedback';
describe.skipIf(!url)('R3 notification opened and feedback upgrade', () => {
  it('adds opened and feedback columns, empty for existing reminders', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `notification_feedback_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`SET TimeZone TO 'UTC'`);
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      const all = (await readdir('prisma/migrations'))
        .filter((d) => !d.endsWith('.toml'))
        .sort();
      expect(all).toContain(target);
      for (const m of all.slice(0, all.indexOf(target)))
        await client.query(
          await readFile(`prisma/migrations/${m}/migration.sql`, 'utf8'),
        );
      await client.query(`
        INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('u','u@example.com','U',now());
        INSERT INTO "NotificationLog" (id,"userId",type,title,body,"scheduledFor","dedupeKey")
          VALUES ('n','u','DAILY_PROGRESS','Ready?','Ready?',now(),'u:DAILY_PROGRESS:day:2026-10-25');`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect(
        (
          await client.query(
            `SELECT "openedAt", feedback FROM "NotificationLog"`,
          )
        ).rows,
      ).toEqual([{ openedAt: null, feedback: null }]);
      await client.query(
        `UPDATE "NotificationLog" SET feedback = 'TOO_MANY', "openedAt" = '2026-10-25T23:45:00Z'`,
      );
      expect(
        (
          await client.query(
            `SELECT feedback::text AS f, "openedAt"::text AS o FROM "NotificationLog"`,
          )
        ).rows,
      ).toEqual([{ f: 'TOO_MANY', o: '2026-10-25 23:45:00+00' }]);
      await expect(
        client.query(`UPDATE "NotificationLog" SET feedback = 'LOVED_IT'`),
      ).rejects.toThrow();
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
