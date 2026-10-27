import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
const target = '20261027120000_ask_rumi';
describe.skipIf(!url)('WI-040 Ask Rumi upgrade', () => {
  it('adds conversations, messages and lines, bounded, beside the existing ledger', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    const schema = `rumi_${randomUUID().replaceAll('-', '')}`;
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
        INSERT INTO "AiUsage" (id,"userId",feature,model,provider,"costMicros") VALUES ('a','u','GRILL_ITEM','m','p',10);`);
      await client.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      await client.query(`
        INSERT INTO "AiUsage" (id,"userId",feature,model,provider,"costMicros") VALUES ('b','u','AGENT_CHAT','m','p',20);
        INSERT INTO "AgentConversation" (id,"userId",title,"updatedAt") VALUES ('c','u','What did I study least?',now());
        INSERT INTO "AgentMessage" (id,"conversationId","userId",role,content) VALUES ('m','c','u','USER','What did I study least?');
        INSERT INTO "AgentMemory" (id,"userId",text) VALUES ('k','u','Rest day is Saturday');`);
      expect(
        (
          await client.query(
            `SELECT feature::text AS f, "costMicros" AS c FROM "AiUsage" ORDER BY id`,
          )
        ).rows,
      ).toEqual([
        { f: 'GRILL_ITEM', c: 10 },
        { f: 'AGENT_CHAT', c: 20 },
      ]);
      await expect(
        client.query(
          `INSERT INTO "AgentMemory" (id,"userId",text) VALUES ('k2','u',repeat('x',201))`,
        ),
      ).rejects.toThrow();
      await expect(
        client.query(
          `INSERT INTO "AgentMessage" (id,"conversationId","userId",role,content) VALUES ('m2','c','u','ASSISTANT','')`,
        ),
      ).rejects.toThrow();
      // Deleting a conversation takes its messages; deleting the owner takes everything.
      await client.query(`DELETE FROM "AgentConversation" WHERE id = 'c'`);
      expect(
        (await client.query(`SELECT count(*)::int AS n FROM "AgentMessage"`))
          .rows[0].n,
      ).toBe(0);
      await client.query(`DELETE FROM "User" WHERE id = 'u'`);
      expect(
        (await client.query(`SELECT count(*)::int AS n FROM "AgentMemory"`))
          .rows[0].n,
      ).toBe(0);
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
