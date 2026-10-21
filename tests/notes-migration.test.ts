import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261021162842_quick_notes';
describe.skipIf(!url)('WI-009 to WI-010 upgrade', () => {
  it('adds quick notes and keeps roadmap rows', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `notes_upgrade_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`SET TimeZone TO 'UTC'`);
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      const all = (await readdir('prisma/migrations'))
        .filter((d) => !d.endsWith('.toml'))
        .sort();
      expect(all.at(-1)).toBe(target);
      for (const m of all.slice(0, all.indexOf(target)))
        await client.query(
          await readFile(`prisma/migrations/${m}/migration.sql`, 'utf8'),
        );
      await client.query(`
        INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('u','u@example.com','U',now());
        INSERT INTO "Roadmap" (id,"userId",title,"updatedAt") VALUES ('r','u','Roadmap',now());`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect((await client.query(`SELECT id FROM "Roadmap"`)).rows).toEqual([
        { id: 'r' },
      ]);
      await client.query(
        `INSERT INTO "QuickNote" (id,"userId",body) VALUES ('n','u','Call back')`,
      );
      expect(
        (await client.query(`SELECT body, "doneAt" FROM "QuickNote"`)).rows,
      ).toEqual([{ body: 'Call back', doneAt: null }]);
      await client.query(`DELETE FROM "User" WHERE id = 'u'`);
      expect((await client.query(`SELECT 1 FROM "QuickNote"`)).rowCount).toBe(
        0,
      );
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
