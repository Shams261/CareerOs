import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261021213321_roadmap_revision';
describe.skipIf(!url)('WI-012 tracker to WI-012 revision upgrade', () => {
  it('adds revision columns with defaults and keeps done items done', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `revision_upgrade_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "Roadmap" (id,"userId",title,"updatedAt") VALUES ('r','u','Roadmap',now());
        INSERT INTO "RoadmapItem" (id,"userId","roadmapId",section,title,slug,status,"completedAt","updatedAt") VALUES ('i','u','r','Trees','Invert a tree','trees-226','DONE',now(),now());`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect(
        (
          await client.query(
            `SELECT status, "nextRevisionAt", "revisionStage", "lastRevisedAt" FROM "RoadmapItem"`,
          )
        ).rows,
      ).toEqual([
        {
          status: 'DONE',
          nextRevisionAt: null,
          revisionStage: 0,
          lastRevisedAt: null,
        },
      ]);
      // A DATE label round-trips unchanged.
      await client.query(
        `UPDATE "RoadmapItem" SET "nextRevisionAt" = '2026-10-28', "revisionStage" = 1`,
      );
      expect(
        (
          await client.query(
            `SELECT "nextRevisionAt"::text AS d FROM "RoadmapItem"`,
          )
        ).rows,
      ).toEqual([{ d: '2026-10-28' }]);
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
