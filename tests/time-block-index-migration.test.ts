import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261107000000_time_block_plan_index';
describe.skipIf(!url)('WI-140 time block plan index upgrade', () => {
  it('adds the index over existing blocks without touching them, and the planner uses it', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `tbidx_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "DailyPlan" (id,"userId",date,"updatedAt") VALUES ('p','u','2026-11-02',now());
        INSERT INTO "TimeBlock" (id,"dailyPlanId",title,category,"plannedStart","plannedEnd","updatedAt")
          VALUES ('b','p','Study','DSA','2026-11-02T14:00:00Z','2026-11-02T15:00:00Z',now());`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect(
        (await client.query(`SELECT id, title FROM "TimeBlock"`)).rows,
      ).toEqual([{ id: 'b', title: 'Study' }]);
      const index = await client.query(
        `SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname = 'TimeBlock_dailyPlanId_plannedStart_idx'`,
        [schema],
      );
      expect(index.rows[0]?.indexdef).toMatch(
        /\("dailyPlanId", "plannedStart"\)/,
      );
      await client.query('SET enable_seqscan = off');
      const plan = await client.query(
        `EXPLAIN SELECT id FROM "TimeBlock" WHERE "dailyPlanId" = 'p' ORDER BY "plannedStart"`,
      );
      expect(plan.rows.map((r) => r['QUERY PLAN']).join('\n')).toContain(
        'TimeBlock_dailyPlanId_plannedStart_idx',
      );
    } finally {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    }
  });
});
