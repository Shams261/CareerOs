import { describe, it, expect } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('WI-003 to WI-004 upgrade', () => {
  it('preserves legacy learning trees, statuses, notes, goals, resources and creates no fake mastery history', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `learn_upgrade_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      for (const migration of [
        '20260923190000_foundation',
        '20260923200000_daily_execution',
        '20260924130000_dsa_revision',
      ])
        await client.query(
          await readFile(
            `prisma/migrations/${migration}/migration.sql`,
            'utf8',
          ),
        );
      await client.query(`INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('u','legacy@example.com','Legacy',now()),('empty','empty@example.com','Empty',now());
 INSERT INTO "Goal" (id,"userId",title,category,"updatedAt") VALUES ('g','u','Legacy goal','TECHNICAL',now());
 INSERT INTO "LearningTopic" (id,"userId",title,notes,status,"goalId","updatedAt") VALUES ('root','u','TypeScript','Keep these notes','INTERVIEW_READY','g',now());
 INSERT INTO "LearningTopic" (id,"userId",title,notes,status,"parentId","updatedAt") VALUES ('child','u','Generics','Child notes','NEEDS_REVISION','root',now());
 INSERT INTO "Resource" (id,"userId",title,url,"learningTopicId","updatedAt") VALUES ('r','u','Docs','https://example.com/legacy','child',now());`);
      const before = (
        await client.query(
          'SELECT id,title,notes,status,"goalId","parentId","createdAt","updatedAt" FROM "LearningTopic" ORDER BY id',
        )
      ).rows;
      await client.query(
        await readFile(
          'prisma/migrations/20260924190000_technical_learning/migration.sql',
          'utf8',
        ),
      );
      expect(
        (
          await client.query(
            'SELECT id,title,notes,status,"goalId","parentId","createdAt","updatedAt" FROM "LearningTopic" ORDER BY id',
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await client.query(
            'SELECT "subjectId",understanding,recall,application,interview,"nextReviewDate" FROM "LearningTopic"',
          )
        ).rows,
      ).toEqual(
        Array(2).fill({
          subjectId: 'legacy-learning-u',
          understanding: 0,
          recall: 0,
          application: 0,
          interview: 0,
          nextReviewDate: null,
        }),
      );
      expect(
        (await client.query('SELECT * FROM "LearningActivity"')).rowCount,
      ).toBe(0);
      expect(
        (await client.query('SELECT name FROM "LearningSubject"')).rows,
      ).toEqual([{ name: 'Imported learning' }]);
      expect(
        (await client.query('SELECT url,"learningTopicId" FROM "Resource"'))
          .rows,
      ).toEqual([
        { url: 'https://example.com/legacy', learningTopicId: 'child' },
      ]);
      await expect(
        client.query(`UPDATE "LearningTopic" SET recall=4 WHERE id='child'`),
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  }, 20000);
});
