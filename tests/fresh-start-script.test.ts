import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { isTestNamed } from '../src/lib/test-data';
const url = process.env.TEST_DATABASE_URL;

/** A workspace with real-looking curriculum, activity, set-up and test-named records. */
const fixture = `
  INSERT INTO "User" (id,email,name,"updatedAt","dayPrint") VALUES ('u','u@example.com','U',now(),true);
  INSERT INTO "Session" (id,"userId","tokenHash","createdAt","expiresAt","lastSeenAt") VALUES ('s','u','h',now(),now() + interval '1 day',now());
  INSERT INTO "PushSubscription" (id,"userId",endpoint,p256dh,auth) VALUES ('p','u','https://push.example.com/1','k','a');
  INSERT INTO "NotificationPreference" (id,"userId",type) VALUES ('np','u','DAILY_PROGRESS');
  INSERT INTO "CalendarConnection" (id,"userId","updatedAt") VALUES ('cc','u',now());
  INSERT INTO "StudyNudgeSetting" (id,"userId","morningEnabled","updatedAt") VALUES ('sn','u',true,now());
  INSERT INTO "AiSetting" ("userId","updatedAt") VALUES ('u',now());
  INSERT INTO "AiUsage" (id,"userId",feature,model,provider,"costMicros") VALUES ('au','u','GRILL_ITEM','m','p',500);
  INSERT INTO "JobRun" (name) VALUES ('notifications');
  INSERT INTO "Goal" (id,"userId",title,category,"updatedAt") VALUES ('g','u','Offer from a product company','Career',now()), ('gt','u','TEST goal','Career',now());
  INSERT INTO "DsaTopic" (id,name,"updatedAt") VALUES ('t','Arrays & Hashing',now()), ('tt','TEST Arrays (delete me)',now());
  INSERT INTO "DsaProblem" (id,"userId",title,platform,"problemUrl",difficulty,"topicId",confidence,"attemptsCount","nextRevisionAt","lastAttemptedAt","notes","updatedAt")
    VALUES ('pr','u','Two Sum','LeetCode','https://leetcode.com/problems/two-sum/','EASY','t','YELLOW',2,'2026-10-25',now(),'from the import',now()),
           ('prt','u','UAT Test – Problem 01','LeetCode','https://leetcode.com/problems/x/','EASY','tt','RED',0,null,null,null,now());
  INSERT INTO "DsaAttempt" (id,"userId","problemId","requestId","attemptedAt","confidenceAfter","solvedIndependently") VALUES ('at','u','pr','r1',now(),'YELLOW','PARTIAL');
  UPDATE "User" SET "currentDsaTopicId" = 'tt' WHERE id = 'u';
  INSERT INTO "LearningSubject" (id,"userId",name,"updatedAt") VALUES ('ls','u','PostgreSQL',now());
  INSERT INTO "LearningTopic" (id,"subjectId","userId",title,understanding,"updatedAt") VALUES ('lt','ls','u','Indexes',2,now());
  INSERT INTO "LearningActivity" (id,"userId","topicId","requestId","activityType","performedAt","statusBefore","statusAfter") VALUES ('la','u','lt','r2','LEARN',now(),'NOT_STARTED','LEARNING');
  INSERT INTO "RoutineBlock" (id,"userId","startLocal","endLocal",title,category,weekdays,"updatedAt") VALUES ('rb','u','07:30','09:00','TEST Routine (delete me)','DSA','{1,2,3}',now());
  INSERT INTO "DailyPlan" (id,"userId",date,"updatedAt") VALUES ('dp','u','2026-10-27',now());
  INSERT INTO "TimeBlock" (id,"dailyPlanId",title,category,"plannedStart","plannedEnd","routineKey","updatedAt") VALUES ('tb','dp','TEST Routine (delete me)','DSA','2026-10-27T11:30:00Z','2026-10-27T13:00:00Z','rb',now());
  INSERT INTO "ActualSession" (id,"userId",category,"startedAt","taskId") VALUES ('as','u','DSA','2026-10-27T11:30:00Z','tb');
  INSERT INTO "DailyCheckIn" (id,"userId","dailyPlanId","completedAt","updatedAt") VALUES ('ci','u','dp',now(),now());
  INSERT INTO "JobApplication" (id,"userId",company,role,"updatedAt") VALUES ('ja','u','TEST Company (delete me)','Engineer',now());
  INSERT INTO "InterviewRound" (id,"userId","applicationId",title,"scheduledStart",timezone,"updatedAt") VALUES ('ir','u','ja','Recruiter','2026-10-22T15:00:00Z','America/Toronto',now());
  INSERT INTO "InterviewPrepItem" (id,"userId","roundId",title,"updatedAt") VALUES ('pi','u','ir','Questions',now());
  INSERT INTO "JobActivity" (id,"userId","applicationId",type,"occurredAt") VALUES ('jac','u','ja','CREATED',now());
  INSERT INTO "InterviewPrepDoc" (id,"userId","applicationId",company,role,queries,content,sources) VALUES ('pd','u','ja','TEST','E',ARRAY['q'],'{}','[]');
  INSERT INTO "Roadmap" (id,"userId",title,"goalId","studyAi","updatedAt") VALUES ('rm','u','DSA patterns','g',true,now()), ('rmt','u','UAT Test – Roadmap 01 – 2026-10-22','g',false,now());
  INSERT INTO "RoadmapItem" (id,"userId","roadmapId",section,title,status,"completedAt","nextRevisionAt","revisionStage","askedInInterview","askedNote",notes,scope,checkpoint,slug,"updatedAt")
    VALUES ('ri','u','rm','Arrays & Hashing','1. Two Sum','DONE',now(),'2026-10-30',1,true,'Northwind','my note','Easy · pattern','Solved on my own','two-sum',now()),
           ('rit','u','rm','Arrays & Hashing','TEST item','NOT_STARTED',null,null,0,false,null,null,null,null,null,now()),
           ('ru','u','rmt','Section','Everything done','DONE',now(),null,0,false,null,null,null,null,null,now());
  INSERT INTO "RevisionCard" (id,"userId","roadmapItemId",question,points) VALUES ('rc','u','ri','Why a hash map?','{a,b,c}');
  INSERT INTO "QuickNote" (id,"userId",body) VALUES ('qn','u','Call back');
  INSERT INTO "WeeklyReview" (id,"userId","weekStart","updatedAt") VALUES ('wr','u','2026-10-19',now());
  INSERT INTO "WeeklyPriority" (id,"userId","reviewId",title,ordering,"updatedAt") VALUES ('wp','u','wr','Finish trees',0,now());
  INSERT INTO "NotificationLog" (id,"userId",type,title,body,"scheduledFor","dedupeKey") VALUES ('nl','u','DAILY_PROGRESS','t','b',now(),'k');
  INSERT INTO "CalendarSyncConflict" (id,"userId","timeBlockId","providerEventId","localSnapshot","remoteSnapshot","detectedAt") VALUES ('cs','u','tb','ev','{}','{}',now());
  INSERT INTO "AgentConversation" (id,"userId",title,"updatedAt") VALUES ('ac','u','What did I study?',now());
  INSERT INTO "AgentMessage" (id,"conversationId","userId",role,content) VALUES ('am','ac','u','USER','What did I study?');
  INSERT INTO "AgentMemory" (id,"userId",text) VALUES ('mem','u','Rest day is Saturday');
  INSERT INTO "NoticedAnswer" (id,"userId",key,kind,"hiddenUntil","updatedAt") VALUES ('na','u','idle:dsa','idle','2026-11-03',now());
`;

describe.skipIf(!url)('scripts/fresh-start.sql', () => {
  async function schemaClient() {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `fresh_${randomUUID().replaceAll('-', '')}`;
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
  const script = () => readFile('scripts/fresh-start.sql', 'utf8');

  it('clears what the owner did, keeps the curriculum at zero and the set-up', async () => {
    const { client, close } = await schemaClient();
    try {
      await client.query(fixture);
      await client.query(await script());
      for (const t of [
        'RoutineBlock',
        'DailyPlan',
        'TimeBlock',
        'ActualSession',
        'DailyCheckIn',
        'JobApplication',
        'InterviewRound',
        'InterviewPrepItem',
        'JobActivity',
        'InterviewPrepDoc',
        'DsaAttempt',
        'LearningActivity',
        'RevisionCard',
        'QuickNote',
        'WeeklyReview',
        'WeeklyPriority',
        'NotificationLog',
        'CalendarSyncConflict',
        'AgentConversation',
        'AgentMessage',
        'AgentMemory',
        'NoticedAnswer',
      ])
        expect(await count(client, t), t).toBe(0);
      for (const t of [
        'User',
        'Session',
        'PushSubscription',
        'NotificationPreference',
        'CalendarConnection',
        'StudyNudgeSetting',
        'AiSetting',
        'AiUsage',
        'JobRun',
      ])
        expect(await count(client, t), t).toBe(1);
      // The curriculum stays, test-named parts go, progress is back at zero.
      expect((await client.query(`SELECT title FROM "Roadmap"`)).rows).toEqual([
        { title: 'DSA patterns' },
      ]);
      expect(
        (
          await client.query(
            `SELECT title, status, "completedAt", "nextRevisionAt", "revisionStage", "askedInInterview", "askedNote", notes, scope, checkpoint, slug FROM "RoadmapItem"`,
          )
        ).rows,
      ).toEqual([
        {
          title: '1. Two Sum',
          status: 'NOT_STARTED',
          completedAt: null,
          nextRevisionAt: null,
          revisionStage: 0,
          askedInInterview: false,
          askedNote: null,
          notes: null,
          scope: 'Easy · pattern',
          checkpoint: 'Solved on my own',
          slug: 'two-sum',
        },
      ]);
      expect(
        (
          await client.query(
            `SELECT title, confidence, "attemptsCount", "nextRevisionAt", "lastAttemptedAt", notes FROM "DsaProblem"`,
          )
        ).rows,
      ).toEqual([
        {
          title: 'Two Sum',
          confidence: 'RED',
          attemptsCount: 0,
          nextRevisionAt: null,
          lastAttemptedAt: null,
          notes: 'from the import',
        },
      ]);
      expect((await client.query(`SELECT name FROM "DsaTopic"`)).rows).toEqual([
        { name: 'Arrays & Hashing' },
      ]);
      expect((await client.query(`SELECT title FROM "Goal"`)).rows).toEqual([
        { title: 'Offer from a product company' },
      ]);
      expect(
        (await client.query(`SELECT understanding FROM "LearningTopic"`)).rows,
      ).toEqual([{ understanding: 0 }]);
      expect(
        (
          await client.query(
            `SELECT "currentDsaTopicId", "dayPrint" FROM "User"`,
          )
        ).rows,
      ).toEqual([{ currentDsaTopicId: null, dayPrint: null }]);
      // Running it again on a fresh workspace is harmless.
      await client.query(await script());
      expect(await count(client, 'RoadmapItem')).toBe(1);
    } finally {
      await close();
    }
  });

  it('marks test names exactly as isTestNamed does', async () => {
    const { client, close } = await schemaClient();
    try {
      await client.query(fixture);
      const names = [
        'TEST Routine (delete me)',
        'UAT Test – Lead 01',
        'uat sample',
        'Example Labs (demo)',
        '[test] thing',
        'Test 2',
        'demo',
        'run the failing test first',
        'Testing pyramid',
        'Two Sum',
        'Contest prep',
        'DEMOGRAPHICS',
        'Sample size',
      ];
      // The script's function lives in this session's pg_temp once the script has run.
      await client.query(await script());
      for (const n of names) {
        const r = await client.query(`SELECT pg_temp.is_test($1) AS t`, [n]);
        expect(r.rows[0].t, n).toBe(isTestNamed(n));
      }
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
      await expect(client.query(await script())).rejects.toThrow(
        'Expected exactly one User row, found 2',
      );
      await client.query('ROLLBACK').catch(() => {});
      expect(await count(client, 'RoutineBlock')).toBe(1);
    } finally {
      await close();
    }
  });
});
