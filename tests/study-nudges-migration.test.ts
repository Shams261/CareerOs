import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261025180000_study_nudges';
describe.skipIf(!url)('WI-028 study nudges upgrade', () => {
  it('adds settings off by default, rest days, presence and in-app-only reminders', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `study_nudges_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "DailyPlan" (id,"userId",date,"updatedAt") VALUES ('p','u','2026-10-27',now());
        INSERT INTO "NotificationLog" (id,"userId",type,title,body,"scheduledFor","dedupeKey")
          VALUES ('n','u','DAILY_PROGRESS','Ready?','Ready?',now(),'u:DAILY_PROGRESS:day:2026-10-27');`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect(
        (
          await client.query(
            `SELECT u."lastActiveAt", p."restAt", n."inAppOnly" FROM "User" u, "DailyPlan" p, "NotificationLog" n`,
          )
        ).rows,
      ).toEqual([{ lastActiveAt: null, restAt: null, inAppOnly: false }]);
      await client.query(
        `INSERT INTO "StudyNudgeSetting" (id,"userId","updatedAt") VALUES ('s','u',now())`,
      );
      expect(
        (
          await client.query(
            `SELECT "morningEnabled","eveningEnabled",days,"morningTime","studyCategories" FROM "StudyNudgeSetting"`,
          )
        ).rows,
      ).toEqual([
        {
          morningEnabled: false,
          eveningEnabled: false,
          days: 31,
          morningTime: '08:00',
          studyCategories: ['DSA', 'Technical'],
        },
      ]);
      await expect(
        client.query(`UPDATE "StudyNudgeSetting" SET days = 0`),
      ).rejects.toThrow();
      await expect(
        client.query(`UPDATE "StudyNudgeSetting" SET "morningTime" = '8am'`),
      ).rejects.toThrow();
      // The new reminder types are usable after the migration.
      await client.query(
        `INSERT INTO "NotificationLog" (id,"userId",type,title,body,"scheduledFor","dedupeKey")
           VALUES ('m','u','STUDY_MORNING','Good morning','x',now(),'u:STUDY_MORNING:study:2026-10-27')`,
      );
      await client.query(`DELETE FROM "User" WHERE id = 'u'`);
      expect(
        (
          await client.query(
            `SELECT count(*)::int AS c FROM "StudyNudgeSetting"`,
          )
        ).rows[0].c,
      ).toBe(0);
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
