import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261029090000_default_curriculum';
describe.skipIf(!url)('WI-064 default curriculum upgrade', () => {
  it('marks imported roadmaps as curriculum without a goal, and leaves the owner’s own alone', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `curriculum_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "Goal" (id,"userId",title,category,"updatedAt") VALUES ('g','u','Offer','Career',now());
        INSERT INTO "Roadmap" (id,"userId",title,"goalId","updatedAt") VALUES
          ('imported','u','System design','g',now()),
          ('own','u','My notes','g',now());
        INSERT INTO "RoadmapItem" (id,"userId","roadmapId",section,title,slug,"updatedAt") VALUES
          ('i1','u','imported','Basics','Caching','caching',now()),
          ('i2','u','own','Mine','Idea',NULL,now());`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect(
        (
          await client.query(
            `SELECT id, curriculum, "goalId" FROM "Roadmap" ORDER BY id`,
          )
        ).rows,
      ).toEqual([
        { id: 'imported', curriculum: true, goalId: null },
        { id: 'own', curriculum: false, goalId: 'g' },
      ]);
      expect(
        (await client.query(`SELECT count(*)::int AS n FROM "Goal"`)).rows,
      ).toEqual([{ n: 1 }]);
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
