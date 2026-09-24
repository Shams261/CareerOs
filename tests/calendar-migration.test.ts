import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20260926090000_google_calendar';
describe.skipIf(!url)('WI-005.1 to WI-006 upgrade', () => {
  it('adds calendar sync state without changing existing schedule data or inventing mappings', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `cal_upgrade_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "DailyPlan" (id,"userId",date,"updatedAt") VALUES ('p','u','2026-09-25',now());
        INSERT INTO "TimeBlock" (id,"dailyPlanId",title,category,"plannedStart","plannedEnd",status,"routineKey","occurrenceDate","updatedAt")
          VALUES ('b','p','DSA','DSA','2026-09-25T11:30:00Z','2026-09-25T13:00:00Z','PLANNED','r','2026-09-25','2026-09-24T12:00:00Z');
        INSERT INTO "JobApplication" (id,"userId",company,role,"updatedAt") VALUES ('a','u','Acme','Eng',now());
        INSERT INTO "InterviewRound" (id,"userId","applicationId",title,"scheduledStart",timezone,"updatedAt")
          VALUES ('r1','u','a','Screen','2026-09-28T18:00:00Z','America/Toronto',now());`);
      const cols =
        '"plannedStart","plannedEnd",status,"routineKey","occurrenceDate","updatedAt","externalCalendarEventId"';
      const before = (await client.query(`SELECT ${cols} FROM "TimeBlock"`))
        .rows;
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect(
        (await client.query(`SELECT ${cols} FROM "TimeBlock"`)).rows,
      ).toEqual(before);
      expect(
        (
          await client.query(
            `SELECT "calendarSyncStatus","calendarSyncedHash","calendarSyncAttempts","interviewRoundId" FROM "TimeBlock"`,
          )
        ).rows,
      ).toEqual([
        {
          calendarSyncStatus: 'NOT_SYNCED',
          calendarSyncedHash: null,
          calendarSyncAttempts: 0,
          interviewRoundId: null,
        },
      ]);
      for (const t of [
        'CalendarConnection',
        'CalendarWatchChannel',
        'CalendarSyncConflict',
      ])
        expect((await client.query(`SELECT 1 FROM "${t}"`)).rowCount).toBe(0);
      expect(
        (await client.query(`SELECT 1 FROM "InterviewRound" WHERE id='r1'`))
          .rowCount,
      ).toBe(1);
      await expect(
        client.query(`UPDATE "TimeBlock" SET "calendarSyncAttempts" = -1`),
      ).rejects.toThrow();
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
