import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261021204620_roadmap_tracker_fields';
describe.skipIf(!url)('WI-011 to WI-012 upgrade', () => {
  it('adds tracker fields with defaults and keeps every roadmap row', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `tracker_upgrade_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "RoadmapItem" (id,"userId","roadmapId",section,title,notes,status,"updatedAt") VALUES ('i','u','r','Trees','Invert a tree','my note','DONE',now());`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect(
        (
          await client.query(
            `SELECT slug, scope, checkpoint, priority, "estimateMinutes", "references", "sourceRef", notes, status FROM "RoadmapItem"`,
          )
        ).rows,
      ).toEqual([
        {
          slug: null,
          scope: null,
          checkpoint: null,
          priority: 2,
          estimateMinutes: null,
          references: null,
          sourceRef: null,
          notes: 'my note',
          status: 'DONE',
        },
      ]);
      expect(
        (
          await client.query(
            `SELECT "promptTemplate", scenarios FROM "Roadmap"`,
          )
        ).rows,
      ).toEqual([{ promptTemplate: null, scenarios: null }]);
      // Owner-added items carry no slug, so any number of them may coexist.
      await client.query(
        `INSERT INTO "RoadmapItem" (id,"userId","roadmapId",section,title,"updatedAt") VALUES ('i2','u','r','Trees','Max depth',now())`,
      );
      // Imported slugs are unique within a roadmap.
      await client.query(
        `INSERT INTO "RoadmapItem" (id,"userId","roadmapId",section,title,slug,"updatedAt") VALUES ('i3','u','r','Trees','Diameter','trees-543',now())`,
      );
      await expect(
        client.query(
          `INSERT INTO "RoadmapItem" (id,"userId","roadmapId",section,title,slug,"updatedAt") VALUES ('i4','u','r','Trees','Diameter again','trees-543',now())`,
        ),
      ).rejects.toThrow();
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
