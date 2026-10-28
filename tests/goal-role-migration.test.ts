import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261028150000_goal_role_problem_hidden';
describe.skipIf(!url)('WI-060 goal role and hidden problems upgrade', () => {
  it('keeps existing goals and problems as they were: no role, not hidden', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `goalrole_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "Goal" (id,"userId",title,category,"updatedAt") VALUES ('g','u','Offer','Career',now());
        INSERT INTO "DsaTopic" (id,name,"updatedAt") VALUES ('t','Arrays',now());
        INSERT INTO "DsaProblem" (id,"userId",title,platform,"problemUrl",difficulty,"topicId","updatedAt")
          VALUES ('p','u','Two Sum','LeetCode','https://leetcode.com/problems/two-sum/','EASY','t',now());`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect(
        (
          await client.query(
            `SELECT g."targetRole" AS role, p."hiddenAt" AS hidden FROM "Goal" g, "DsaProblem" p`,
          )
        ).rows,
      ).toEqual([{ role: null, hidden: null }]);
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
