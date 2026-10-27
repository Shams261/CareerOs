import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261027150000_prep_docs';
describe.skipIf(!url)('WI-042 prep docs upgrade', () => {
  it('adds prep docs beside existing applications and the ledger feature', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `prep_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "JobApplication" (id,"userId",company,role,"updatedAt") VALUES ('a','u','Northwind','Engineer',now());`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      await client.query(`
        INSERT INTO "AiUsage" (id,"userId",feature,model,provider,"costMicros") VALUES ('x','u','PREP_RESEARCH','m','p',7000);
        INSERT INTO "InterviewPrepDoc" (id,"userId","applicationId",company,role,queries,content,sources)
          VALUES ('d','u','a','Northwind','Engineer',ARRAY['Northwind Engineer interview process and rounds'],'{}','[]');`);
      expect(
        (
          await client.query(
            `SELECT "usedJobDescription" AS jd, "costMicros" AS c FROM "InterviewPrepDoc"`,
          )
        ).rows,
      ).toEqual([{ jd: false, c: 0 }]);
      await expect(
        client.query(
          `INSERT INTO "InterviewPrepDoc" (id,"userId","applicationId",company,role,queries,content,sources)
            VALUES ('d2','u','a','N','E',ARRAY[]::text[],'{}','[]')`,
        ),
      ).rejects.toThrow();
      // Deleting the application takes its docs.
      await client.query(`DELETE FROM "JobApplication" WHERE id = 'a'`);
      expect(
        (
          await client.query(
            `SELECT count(*)::int AS n FROM "InterviewPrepDoc"`,
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
