import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261021135824_roadmap_and_goals';
describe.skipIf(!url)('WI-008 to WI-009 upgrade', () => {
  it('adds roadmaps beside existing goals and keeps every earlier row', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `roadmap_upgrade_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "Goal" (id,"userId",title,category,"updatedAt") VALUES ('g','u','Offer','Career',now());`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect((await client.query(`SELECT id, title FROM "Goal"`)).rows).toEqual(
        [{ id: 'g', title: 'Offer' }],
      );
      await client.query(
        `INSERT INTO "Roadmap" (id,"userId",title,"goalId","updatedAt") VALUES ('r','u','Interview roadmap','g',now())`,
      );
      await client.query(
        `INSERT INTO "RoadmapItem" (id,"userId","roadmapId",section,title,"updatedAt") VALUES ('i','u','r','System design','CAP theorem',now())`,
      );
      expect(
        (
          await client.query(
            `SELECT kind, status, "askedInInterview" FROM "RoadmapItem"`,
          )
        ).rows,
      ).toEqual([
        { kind: 'CONCEPT', status: 'NOT_STARTED', askedInInterview: false },
      ]);
      // Deleting the goal keeps the roadmap; deleting the roadmap removes its items.
      await client.query(`DELETE FROM "Goal" WHERE id = 'g'`);
      expect(
        (await client.query(`SELECT "goalId" FROM "Roadmap"`)).rows,
      ).toEqual([{ goalId: null }]);
      await client.query(`DELETE FROM "Roadmap" WHERE id = 'r'`);
      expect((await client.query(`SELECT 1 FROM "RoadmapItem"`)).rowCount).toBe(
        0,
      );
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
