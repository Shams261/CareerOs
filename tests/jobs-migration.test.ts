import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const previous = [
  '20260923190000_foundation',
  '20260923200000_daily_execution',
  '20260924130000_dsa_revision',
  '20260924190000_technical_learning',
];
describe.skipIf(!url)('WI-004 to WI-005 upgrade', () => {
  it('preserves applications, converts dates in the owner zone and imports legacy interviews without fake history', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `jobs_upgrade_${randomUUID().replaceAll('-', '')}`;
    try {
      // Production PostgreSQL runs in UTC; fixtures use explicit instants.
      await client.query(`SET TimeZone TO 'UTC'`);
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      for (const migration of previous)
        await client.query(
          await readFile(
            `prisma/migrations/${migration}/migration.sql`,
            'utf8',
          ),
        );
      await client.query(`
        INSERT INTO "User" (id,email,name,timezone,"updatedAt") VALUES
          ('toronto','t@example.com','Toronto','America/Toronto',now()),
          ('tokyo','j@example.com','Tokyo','Asia/Tokyo',now());
        INSERT INTO "JobApplication" (id,"userId",company,role,"jobUrl",location,source,"appliedAt",stage,"recruiterName","recruiterContact",notes,"nextAction","nextActionAt","interviewAt","createdAt","updatedAt") VALUES
          ('a1','toronto','Amazon','SDE II','https://example.com/a','Vancouver','LinkedIn','2026-09-22T03:30:00Z','TECHNICAL','Jane','jane@example.com','Keep notes','Follow up','2026-09-26T16:00:00Z','2026-09-28T18:00:00Z','2026-09-20T12:00:00Z','2026-09-21T12:00:00Z'),
          ('a2','tokyo','Shopify','Backend','https://example.com/s',null,null,'2026-09-21T16:00:00Z','REJECTED',null,null,null,null,'2026-09-25T15:30:00Z',null,'2026-09-20T12:00:00Z','2026-09-21T12:00:00Z'),
          ('a3','toronto','Saved Co','Engineer',null,null,null,null,'SAVED',null,null,null,null,null,null,'2026-09-20T12:00:00Z','2026-09-21T12:00:00Z');
        INSERT INTO "Resource" (id,"userId",title,url,"jobApplicationId","updatedAt") VALUES ('r','toronto','Posting','https://example.com/posting','a1',now());
      `);
      const stable =
        'SELECT id,"userId",company,role,"jobUrl",location,source,stage,"recruiterName","recruiterContact",notes,"nextAction","createdAt","updatedAt" FROM "JobApplication" ORDER BY id';
      const before = (await client.query(stable)).rows;
      await client.query(
        await readFile(
          'prisma/migrations/20260924230000_job_pipeline/migration.sql',
          'utf8',
        ),
      );
      expect((await client.query(stable)).rows).toEqual(before);
      expect(
        (
          await client.query(
            'SELECT id,"appliedAt"::text AS applied,"nextActionDate"::text AS next,"actionOwner","workArrangement",priority FROM "JobApplication" ORDER BY id',
          )
        ).rows,
      ).toEqual([
        // 2026-09-22 03:30Z is still Sep 21 in Toronto.
        {
          id: 'a1',
          applied: '2026-09-21',
          next: '2026-09-26',
          actionOwner: 'NONE',
          workArrangement: 'UNKNOWN',
          priority: 2,
        },
        // 2026-09-21 16:00Z is already Sep 22 in Tokyo; 15:30Z Sep 25 is Sep 26.
        {
          id: 'a2',
          applied: '2026-09-22',
          next: '2026-09-26',
          actionOwner: 'NONE',
          workArrangement: 'UNKNOWN',
          priority: 2,
        },
        {
          id: 'a3',
          applied: null,
          next: null,
          actionOwner: 'NONE',
          workArrangement: 'UNKNOWN',
          priority: 2,
        },
      ]);
      expect(
        (
          await client.query(
            'SELECT id,"applicationId",title,type,status,timezone,"scheduledStart" FROM "InterviewRound"',
          )
        ).rows,
      ).toEqual([
        {
          id: 'legacy-round-a1',
          applicationId: 'a1',
          title: 'Interview (imported)',
          type: 'OTHER',
          status: 'SCHEDULED',
          timezone: 'America/Toronto',
          scheduledStart: new Date('2026-09-28T18:00:00Z'),
        },
      ]);
      expect((await client.query('SELECT 1 FROM "JobActivity"')).rowCount).toBe(
        0,
      );
      expect(
        (
          await client.query(
            `SELECT 1 FROM "Resource" WHERE "jobApplicationId"='a1'`,
          )
        ).rowCount,
      ).toBe(1);
      const columns = (
        await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='JobApplication'`,
          [schema],
        )
      ).rows.map((r) => r.column_name);
      expect(columns).not.toContain('interviewAt');
      expect(columns).not.toContain('nextActionAt');
      await expect(
        client.query(
          `INSERT INTO "JobActivity" (id,"userId","applicationId",type,"occurredAt","fromStage","toStage") VALUES ('bad','toronto','a1','STAGE_CHANGED',now(),'APPLIED','APPLIED')`,
        ),
      ).rejects.toThrow();
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
