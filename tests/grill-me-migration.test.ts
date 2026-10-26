import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261026090000_grill_me';
describe.skipIf(!url)('WI-031 Grill Me upgrade', () => {
  it('turns Study AI on for imported roadmaps only and keeps the ledger honest', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `grill_me_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "Roadmap" (id,"userId",title,"updatedAt") VALUES
          ('imported','u','System design',now()),
          ('behavioural','u','Behavioural and resume',now()),
          ('mine','u','My own list',now());
        INSERT INTO "RoadmapItem" (id,"userId","roadmapId",section,title,slug,"updatedAt") VALUES
          ('a','u','imported','S','Rate limiter','rate-limiter',now()),
          ('b','u','behavioural','S','Tell me about yourself','tmay',now()),
          ('c','u','mine','S','Something I added',NULL,now());`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect(
        (await client.query(`SELECT id, "studyAi" FROM "Roadmap" ORDER BY id`))
          .rows,
      ).toEqual([
        { id: 'behavioural', studyAi: false },
        { id: 'imported', studyAi: true },
        { id: 'mine', studyAi: false },
      ]);
      await expect(
        client.query(
          `INSERT INTO "AiUsage" (id,"userId",feature,model,provider,"costMicros") VALUES ('x','u','GRILL_ITEM','m','p',-1)`,
        ),
      ).rejects.toThrow();
      await expect(
        client.query(
          `INSERT INTO "RevisionCard" (id,"userId","roadmapItemId",question,points) VALUES ('k','u','a','Q?',ARRAY['one'])`,
        ),
      ).rejects.toThrow();
      await client.query(
        `INSERT INTO "RevisionCard" (id,"userId","roadmapItemId",question,points) VALUES ('k','u','a','Q?',ARRAY['one','two','three'])`,
      );
      await client.query(`DELETE FROM "RoadmapItem" WHERE id = 'a'`);
      expect(
        (await client.query(`SELECT count(*)::int AS c FROM "RevisionCard"`))
          .rows[0].c,
      ).toBe(0);
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
