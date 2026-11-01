import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261102000000_rumi_memory_persona';
describe.skipIf(!url)('WI-100 Rumi memory and persona upgrade', () => {
  it('keeps existing lines as the owner’s preferences, adds the setting and the style', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `rumi_mem_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "AgentMemory" (id,"userId",text) VALUES ('m','u','Rest day is Saturday');
        INSERT INTO "AiSetting" ("userId","updatedAt") VALUES ('u',now());`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      expect(
        (
          await client.query(
            `SELECT m.kind::text, m.source::text, m."expiresAt", m."messageId", a."rumiStyle" FROM "AgentMemory" m, "AiSetting" a`,
          )
        ).rows,
      ).toEqual([
        {
          kind: 'PREFERENCE',
          source: 'OWNER',
          expiresAt: null,
          messageId: null,
          rumiStyle: 'firm',
        },
      ]);
      await client.query(
        `INSERT INTO "AgentSetting" ("userId","updatedAt") VALUES ('u',now())`,
      );
      expect(
        (
          await client.query(
            `SELECT "memoryEnabled","speakReplies","voiceLang" FROM "AgentSetting"`,
          )
        ).rows,
      ).toEqual([
        { memoryEnabled: true, speakReplies: false, voiceLang: 'en-IN' },
      ]);
      await expect(
        client.query(`SELECT 'AGENT_MEMORY'::"AiFeature"`),
      ).resolves.toBeTruthy();
    } finally {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    }
  });
});
