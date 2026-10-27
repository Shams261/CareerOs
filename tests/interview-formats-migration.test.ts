import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261028090000_interview_formats';
describe.skipIf(!url)('WI-047 interview formats upgrade', () => {
  it('adds the four round types, a round AI policy and application formats to existing rows', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `formats_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "JobApplication" (id,"userId",company,role,"updatedAt") VALUES ('a','u','Northwind','Engineer',now());
        INSERT INTO "InterviewRound" (id,"userId","applicationId",title,type,"scheduledStart",timezone,"updatedAt")
          VALUES ('r','u','a','Coding','CODING',now(),'America/Toronto',now());`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      // Existing rows read as before: no formats, AI policy not known.
      expect(
        (
          await client.query(
            `SELECT a.formats, r."aiPolicy" AS ai FROM "JobApplication" a JOIN "InterviewRound" r ON r."applicationId" = a.id`,
          )
        ).rows,
      ).toEqual([{ formats: '{}', ai: 'UNKNOWN' }]);
      await client.query(`
        UPDATE "JobApplication" SET formats = ARRAY['CODE_REVIEW','AI_ASSISTED']::"InterviewType"[] WHERE id = 'a';
        INSERT INTO "InterviewRound" (id,"userId","applicationId",title,type,"aiPolicy","scheduledStart",timezone,"updatedAt")
          VALUES ('r2','u','a','Bug squash','DEBUGGING','NOT_ALLOWED',now(),'America/Toronto',now());`);
      expect(
        (
          await client.query(
            `SELECT type, "aiPolicy" AS ai FROM "InterviewRound" WHERE id = 'r2'`,
          )
        ).rows,
      ).toEqual([{ type: 'DEBUGGING', ai: 'NOT_ALLOWED' }]);
      await expect(
        client.query(
          `UPDATE "InterviewRound" SET "aiPolicy" = 'SOMETIMES' WHERE id = 'r'`,
        ),
      ).rejects.toThrow();
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
