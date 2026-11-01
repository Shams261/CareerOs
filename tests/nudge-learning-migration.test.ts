import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261105000000_nudge_learning';
describe.skipIf(!url)('WI-109 nudge learning upgrade', () => {
  it('keeps an existing setting, with learning on and nothing paused', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `learn_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "StudyNudgeSetting" (id,"userId","morningEnabled","morningTime","updatedAt") VALUES ('s','u',true,'08:30',now());`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect(
        (
          await client.query(
            `SELECT "morningTime","learnTimes","learnedAt","learnedNote","pausedByFeedback" FROM "StudyNudgeSetting"`,
          )
        ).rows,
      ).toEqual([
        {
          morningTime: '08:30',
          learnTimes: true,
          learnedAt: null,
          learnedNote: null,
          pausedByFeedback: [],
        },
      ]);
    } finally {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    }
  });
});
