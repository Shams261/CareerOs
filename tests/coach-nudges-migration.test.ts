import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261027090000_coach_nudges';
describe.skipIf(!url)('WI-039 coach nudges upgrade', () => {
  it('adds the block-start nudge off by default and keeps existing settings', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `coach_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "StudyNudgeSetting" (id,"userId","morningEnabled","updatedAt") VALUES ('s','u',true,now());`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect(
        (
          await client.query(
            `SELECT "morningEnabled","blockStartEnabled","blockStartMinutes" FROM "StudyNudgeSetting"`,
          )
        ).rows,
      ).toEqual([
        {
          morningEnabled: true,
          blockStartEnabled: false,
          blockStartMinutes: 15,
        },
      ]);
      await expect(
        client.query(`UPDATE "StudyNudgeSetting" SET "blockStartMinutes" = 2`),
      ).rejects.toThrow();
      await client.query(`
        INSERT INTO "NotificationLog" (id,"userId",type,title,body,"scheduledFor","dedupeKey")
          VALUES ('n','u','STUDY_BLOCK','Block started','b',now(),'u:STUDY_BLOCK:b1:2026-10-27')`);
      expect(
        (await client.query(`SELECT type::text AS t FROM "NotificationLog"`))
          .rows,
      ).toEqual([{ t: 'STUDY_BLOCK' }]);
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
