import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;

const domainTables = [
  'CalendarSyncConflict',
  'NotificationLog',
  'WeeklyPriority',
  'WeeklyReview',
  'QuickNote',
  'RoadmapItem',
  'Roadmap',
  'InterviewPrepItem',
  'Resource',
  'DsaAttempt',
  'LearningActivity',
  'JobActivity',
  'ActualSession',
  'DailyCheckIn',
  'TimeBlock',
  'DailyPlan',
  'RoutineBlock',
  'InterviewRound',
  'JobApplication',
  'DsaProblem',
  'LearningTopic',
  'LearningSubject',
  'Goal',
  'DsaTopic',
];
const keptTables = [
  'User',
  'Session',
  'PushSubscription',
  'NotificationPreference',
  'CalendarConnection',
  'JobRun',
];

/** One row in every domain table, linked the way the app links them. */
const fixture = `
  INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('u','u@example.com','U',now());
  INSERT INTO "Session" (id,"userId","tokenHash","createdAt","expiresAt","lastSeenAt") VALUES ('s','u','h',now(),now() + interval '1 day',now());
  INSERT INTO "PushSubscription" (id,"userId",endpoint,p256dh,auth) VALUES ('p','u','https://push.example.com/1','k','a');
  INSERT INTO "NotificationPreference" (id,"userId",type) VALUES ('np','u','DAILY_PROGRESS');
  INSERT INTO "CalendarConnection" (id,"userId","updatedAt") VALUES ('cc','u',now());
  INSERT INTO "JobRun" (name) VALUES ('notifications');
  INSERT INTO "Goal" (id,"userId",title,category,"updatedAt") VALUES ('g','u','Offer','Career',now());
  INSERT INTO "DsaTopic" (id,name,"updatedAt") VALUES ('t','Sliding Window',now());
  INSERT INTO "DsaProblem" (id,"userId",title,platform,"problemUrl",difficulty,"topicId","updatedAt") VALUES ('pr','u','Two Sum','LeetCode','https://leetcode.com/problems/two-sum/','EASY','t',now());
  INSERT INTO "DsaAttempt" (id,"userId","problemId","requestId","attemptedAt","confidenceAfter","solvedIndependently") VALUES ('at','u','pr','r1',now(),'GREEN','YES');
  INSERT INTO "LearningSubject" (id,"userId",name,"updatedAt") VALUES ('ls','u','PostgreSQL',now());
  INSERT INTO "LearningTopic" (id,"subjectId","userId",title,"updatedAt") VALUES ('lt','ls','u','Indexes',now());
  INSERT INTO "LearningActivity" (id,"userId","topicId","requestId","activityType","performedAt","statusBefore","statusAfter") VALUES ('la','u','lt','r2','LEARN',now(),'NOT_STARTED','LEARNING');
  UPDATE "User" SET "currentDsaTopicId" = 't', "currentSubjectId" = 'ls' WHERE id = 'u';
  INSERT INTO "RoutineBlock" (id,"userId","startLocal","endLocal",title,category,weekdays,"updatedAt") VALUES ('rb','u','08:00','09:00','Practice','DSA','{1,2,3}',now());
  INSERT INTO "DailyPlan" (id,"userId",date,"updatedAt") VALUES ('dp','u','2026-10-21',now());
  INSERT INTO "TimeBlock" (id,"dailyPlanId",title,category,"plannedStart","plannedEnd","updatedAt") VALUES ('tb','dp','Practice','DSA','2026-10-21T12:00:00Z','2026-10-21T13:00:00Z',now());
  INSERT INTO "ActualSession" (id,"userId",category,"startedAt") VALUES ('as','u','DSA','2026-10-21T12:00:00Z');
  INSERT INTO "DailyCheckIn" (id,"userId","dailyPlanId","completedAt","updatedAt") VALUES ('ci','u','dp',now(),now());
  INSERT INTO "JobApplication" (id,"userId",company,role,"updatedAt") VALUES ('ja','u','Stripe','SDE II',now());
  INSERT INTO "InterviewRound" (id,"userId","applicationId",title,"scheduledStart",timezone,"updatedAt") VALUES ('ir','u','ja','Coding','2026-10-22T15:00:00Z','America/Toronto',now());
  INSERT INTO "InterviewPrepItem" (id,"userId","roundId",title,"updatedAt") VALUES ('pi','u','ir','Rate limiter',now());
  INSERT INTO "JobActivity" (id,"userId","applicationId",type,"occurredAt") VALUES ('jac','u','ja','CREATED',now());
  INSERT INTO "Resource" (id,"userId",title,url,"jobApplicationId","updatedAt") VALUES ('re','u','Posting','https://example.com/job','ja',now());
  INSERT INTO "Roadmap" (id,"userId",title,"goalId","updatedAt") VALUES ('rm','u','DSA patterns','g',now());
  INSERT INTO "RoadmapItem" (id,"userId","roadmapId",section,title,"dsaTopicId","updatedAt") VALUES ('ri','u','rm','Patterns','Sliding window','t',now());
  INSERT INTO "QuickNote" (id,"userId",body) VALUES ('qn','u','Call back');
  INSERT INTO "WeeklyReview" (id,"userId","weekStart","updatedAt") VALUES ('wr','u','2026-10-19',now());
  INSERT INTO "WeeklyPriority" (id,"userId","reviewId",title,ordering,"goalId","updatedAt") VALUES ('wp','u','wr','Finish trees',0,'g',now());
  INSERT INTO "NotificationLog" (id,"userId",type,title,body,"scheduledFor","dedupeKey") VALUES ('nl','u','DAILY_PROGRESS','t','b',now(),'k');
  INSERT INTO "CalendarSyncConflict" (id,"userId","timeBlockId","providerEventId","localSnapshot","remoteSnapshot","detectedAt") VALUES ('cs','u','tb','ev','{}','{}',now());
`;

describe.skipIf(!url)('scripts/reset-owner-data.sql', () => {
  async function schemaClient() {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `reset_${randomUUID().replaceAll('-', '')}`;
    await client.query(`SET TimeZone TO 'UTC'`);
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const all = (await readdir('prisma/migrations'))
      .filter((d) => !d.endsWith('.toml'))
      .sort();
    for (const m of all)
      await client.query(
        await readFile(`prisma/migrations/${m}/migration.sql`, 'utf8'),
      );
    return {
      client,
      async close() {
        await client.query('SET search_path TO public');
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await client.end();
      },
    };
  }
  const count = async (client: Client, table: string) =>
    Number(
      (await client.query(`SELECT count(*) FROM "${table}"`)).rows[0].count,
    );

  it('empties every domain table and keeps the owner, devices and connection', async () => {
    const { client, close } = await schemaClient();
    try {
      await client.query(fixture);
      for (const t of domainTables) expect(await count(client, t)).toBe(1);
      await client.query(
        await readFile('scripts/reset-owner-data.sql', 'utf8'),
      );
      for (const t of domainTables) expect(await count(client, t)).toBe(0);
      for (const t of keptTables)
        expect(await count(client, t)).toBeGreaterThanOrEqual(1);
      expect(
        (
          await client.query(
            `SELECT "currentDsaTopicId", "currentSubjectId" FROM "User"`,
          )
        ).rows,
      ).toEqual([{ currentDsaTopicId: null, currentSubjectId: null }]);
      // Re-running on an empty workspace is harmless.
      await client.query(
        await readFile('scripts/reset-owner-data.sql', 'utf8'),
      );
      expect(await count(client, 'User')).toBe(1);
    } finally {
      await close();
    }
  });

  it('refuses when the database does not hold exactly one user', async () => {
    const { client, close } = await schemaClient();
    try {
      await client.query(fixture);
      await client.query(
        `INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('u2','u2@example.com','U2',now())`,
      );
      await expect(
        client.query(await readFile('scripts/reset-owner-data.sql', 'utf8')),
      ).rejects.toThrow('Expected exactly one User row, found 2');
      await client.query('ROLLBACK').catch(() => {});
      for (const t of domainTables) expect(await count(client, t)).toBe(1);
    } finally {
      await close();
    }
  });
});
