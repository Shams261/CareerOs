import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('WI-002 to WI-003 upgrade', () => {
  it('preserves legacy counts/resources and converts revision instants to owner calendar dates', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `upgrade_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      for (const migration of [
        '20260923190000_foundation',
        '20260923200000_daily_execution',
      ])
        await client.query(
          await readFile(
            `prisma/migrations/${migration}/migration.sql`,
            'utf8',
          ),
        );
      await client.query(`
        INSERT INTO "User" (id,email,name,timezone,"updatedAt") VALUES ('toronto','upgrade-t@example.com','Toronto','America/Toronto',now()),('tokyo','upgrade-j@example.com','Tokyo','Asia/Tokyo',now());
        INSERT INTO "DsaTopic" (id,name,status,"updatedAt") VALUES ('topic','Legacy topic','NEEDS_REVISION',now());
        INSERT INTO "DsaProblem" (id,"userId",title,platform,"problemUrl",difficulty,"topicId",confidence,"lastAttemptedAt","nextRevisionAt","attemptsCount","updatedAt") VALUES
          ('p1','toronto','Legacy','Custom','https://example.com','MEDIUM','topic','YELLOW','2026-09-20T20:00:00Z','2026-09-25T02:00:00Z',2,now()),
          ('p2','tokyo','Legacy2','Custom','https://example.com','EASY','topic','GREEN',null,'2026-09-25T02:00:00Z',1,now()),
          ('p3','toronto','New','Custom','https://example.com','EASY','topic','RED',null,null,0,now());
        INSERT INTO "Resource" (id,"userId",title,url,"problemId","updatedAt") VALUES ('r','toronto','Saved reference','https://example.com/reference','p1',now());
      `);
      await client.query(
        await readFile(
          'prisma/migrations/20260924130000_dsa_revision/migration.sql',
          'utf8',
        ),
      );
      const rows = await client.query(
        'SELECT id,"nextRevisionAt"::text as due,"attemptsCount","revisionStage" FROM "DsaProblem" ORDER BY id',
      );
      expect(rows.rows).toEqual([
        { id: 'p1', due: '2026-09-24', attemptsCount: 2, revisionStage: 0 },
        { id: 'p2', due: '2026-09-25', attemptsCount: 1, revisionStage: 0 },
        { id: 'p3', due: null, attemptsCount: 0, revisionStage: 0 },
      ]);
      expect((await client.query('SELECT * FROM "DsaAttempt"')).rowCount).toBe(
        0,
      );
      expect(
        (
          await client.query(
            'SELECT * FROM "Resource" WHERE id=\'r\' AND "problemId"=\'p1\'',
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (await client.query('SELECT status FROM "DsaTopic"')).rows[0].status,
      ).toBe('NEEDS_REVISION');
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
