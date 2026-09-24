import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20260927090000_weekly_review';
describe.skipIf(!url)('WI-006 to WI-007 upgrade', () => {
  it('adds weekly review tables and the reminder type without touching existing data', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `review_upgrade_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`SET TimeZone TO 'UTC'`);
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      const all = (await readdir('prisma/migrations'))
        .filter((d) => !d.endsWith('.toml'))
        .sort();
      for (const m of all.slice(0, all.indexOf(target)))
        await client.query(
          await readFile(`prisma/migrations/${m}/migration.sql`, 'utf8'),
        );
      await client.query(`
        INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('u','u@example.com','U',now());
        INSERT INTO "DailyPlan" (id,"userId",date,"updatedAt") VALUES ('p','u','2026-09-24',now());
        INSERT INTO "DailyCheckIn" (id,"userId","dailyPlanId","completedAt",notes,"updatedAt") VALUES ('c','u','p',now(),'Daily note',now());`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect(
        (await client.query(`SELECT notes FROM "DailyCheckIn"`)).rows,
      ).toEqual([{ notes: 'Daily note' }]);
      expect(
        (await client.query(`SELECT 1 FROM "WeeklyReview"`)).rowCount,
      ).toBe(0);
      await client.query(
        `INSERT INTO "WeeklyReview" (id,"userId","weekStart","updatedAt") VALUES ('w','u','2026-09-21',now())`,
      );
      await expect(
        client.query(
          `INSERT INTO "WeeklyReview" (id,"userId","weekStart","updatedAt") VALUES ('w2','u','2026-09-21',now())`,
        ),
      ).rejects.toThrow();
      await expect(
        client.query(
          `INSERT INTO "WeeklyReview" (id,"userId","weekStart","updatedAt") VALUES ('w3','u','2026-09-23',now())`,
        ),
      ).rejects.toThrow();
      await expect(
        client.query(
          `INSERT INTO "WeeklyPriority" (id,"userId","reviewId",title,target,ordering,"updatedAt") VALUES ('x','u','w','t',0,0,now())`,
        ),
      ).rejects.toThrow();
      expect(
        (
          await client.query(
            `SELECT unnest(enum_range(NULL::"NotificationType"))::text AS v`,
          )
        ).rows.map((r) => r.v),
      ).toContain('WEEKLY_REVIEW');
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
