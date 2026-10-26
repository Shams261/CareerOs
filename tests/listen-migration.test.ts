import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261026210000_listen';
describe.skipIf(!url)('WI-037 Listen upgrade', () => {
  it('lets the ledger record Listen scripts and keeps earlier rows', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `listen_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "AiUsage" (id,"userId",feature,model,provider,"costMicros",outcome)
          VALUES ('a','u','GRILL_ITEM','m','p',10,'OK'),('b','u','GRILL_PROBLEM','m','p',5,'OK');`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      await client.query(
        `INSERT INTO "AiUsage" (id,"userId",feature,model,provider,"costMicros",outcome)
           VALUES ('c','u','LISTEN_ITEM','m','p',7,'OK')`,
      );
      expect(
        (
          await client.query(
            `SELECT feature::text AS f FROM "AiUsage" ORDER BY id`,
          )
        ).rows.map((r) => r.f),
      ).toEqual(['GRILL_ITEM', 'GRILL_PROBLEM', 'LISTEN_ITEM']);
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
