import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261103000000_rumi_lines';
describe.skipIf(!url)('WI-101 Rumi lines upgrade', () => {
  it('keeps an existing nudge setting with the lines off and adds the afternoon type', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `rumi_lines_${randomUUID().replaceAll('-', '')}`;
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
            `SELECT "morningEnabled","rumiLines","middayEnabled","middayTime","middayPausedUntil" FROM "StudyNudgeSetting"`,
          )
        ).rows,
      ).toEqual([
        {
          morningEnabled: true,
          rumiLines: false,
          middayEnabled: false,
          middayTime: '13:00',
          middayPausedUntil: null,
        },
      ]);
      await expect(
        client.query(`SELECT 'STUDY_MIDDAY'::"NotificationType"`),
      ).resolves.toBeTruthy();
      await expect(
        client.query(`SELECT 'AGENT_LINE'::"AiFeature"`),
      ).resolves.toBeTruthy();
    } finally {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    }
  });
});
