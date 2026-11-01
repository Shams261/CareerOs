import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261106000000_owner_ai_limit';
describe.skipIf(!url)('WI-114 owner AI limit upgrade', () => {
  it('keeps an existing AI setting with no limit, and accepts only amounts in range', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `limit_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "AiSetting" ("userId",enabled,"updatedAt") VALUES ('u',true,now());`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect(
        (
          await client.query(
            `SELECT enabled,"rumiStyle","monthlyLimitMicros" FROM "AiSetting"`,
          )
        ).rows,
      ).toEqual([
        { enabled: true, rumiStyle: 'firm', monthlyLimitMicros: null },
      ]);
      await client.query(
        `UPDATE "AiSetting" SET "monthlyLimitMicros" = 20000000`,
      );
      for (const bad of [50_000, 2_000_000_000])
        await expect(
          client.query(`UPDATE "AiSetting" SET "monthlyLimitMicros" = ${bad}`),
        ).rejects.toThrow(/AiSetting_monthly_limit_range/);
    } finally {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    }
  });
});
