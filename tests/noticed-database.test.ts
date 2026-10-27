import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import { answerNoticed, noticedFor } from '../src/features/noticed/service';
import { localInstant } from '../src/lib/time';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const today = '2026-10-27';
const now = localInstant(today, '09:00', zone);
const at = (d: string, t: string) => localInstant(d, t, zone);

describe.skipIf(!url)('Rumi noticed (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  let user: { id: string; timezone: string };
  beforeEach(async () => {
    const id = `noticed-${randomUUID()}`;
    user = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'N', timezone: zone },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });
  afterAll(() => prisma.$disconnect());

  const session = (d: string, category: string) =>
    prisma.actualSession.create({
      data: {
        userId: user.id,
        category,
        startedAt: at(d, '07:00'),
        endedAt: at(d, '08:00'),
      },
    });

  it('reads the owner’s study and interviews, skips test records, and hides answered cards', async () => {
    await session('2026-10-26', 'DSA');
    await session('2026-10-20', 'Technical');
    await session('2026-10-15', 'GYM');
    const app = await prisma.jobApplication.create({
      data: { userId: user.id, company: 'Northwind', role: 'Engineer' },
    });
    const round = await prisma.interviewRound.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        title: 'System design',
        type: 'SYSTEM_DESIGN',
        scheduledStart: at('2026-10-29', '15:00'),
        timezone: zone,
      },
    });
    await prisma.interviewPrepItem.create({
      data: { userId: user.id, roundId: round.id, title: 'Caching' },
    });
    const test = await prisma.jobApplication.create({
      data: { userId: user.id, company: 'TEST company', role: 'Engineer' },
    });
    const testRound = await prisma.interviewRound.create({
      data: {
        userId: user.id,
        applicationId: test.id,
        title: 'Coding',
        type: 'CODING',
        scheduledStart: at('2026-10-28', '15:00'),
        timezone: zone,
      },
    });
    await prisma.interviewPrepItem.create({
      data: { userId: user.id, roundId: testRound.id, title: 'Prep' },
    });
    const cards = await noticedFor(user, now);
    expect(cards.map((c) => c.key)).toEqual([
      `interview:${round.id}`,
      'idle:technical',
    ]);
    expect(cards[1].title).toBe('No Technical recorded in 7 days');

    await answerNoticed(
      user,
      { key: 'idle:technical', kind: 'idle', acted: false },
      now,
    );
    await answerNoticed(
      user,
      { key: `interview:${round.id}`, kind: 'interview', acted: true },
      now,
    );
    expect(await noticedFor(user, now)).toEqual([]);
    const rows = await prisma.noticedAnswer.findMany({
      where: { userId: user.id },
      orderBy: { key: 'asc' },
    });
    expect(
      rows.map((r) => [
        r.kind,
        !!r.actedAt,
        !!r.dismissedAt,
        r.hiddenUntil.toISOString().slice(0, 10),
      ]),
    ).toEqual([
      ['idle', false, true, '2026-11-03'],
      ['interview', true, false, '2026-10-30'],
    ]);
    // A week later the dismissed card may return.
    expect(
      (await noticedFor(user, at('2026-11-04', '09:00'))).map((c) => c.key),
    ).toContain('idle:technical');
  });

  it('uses the owner’s own study categories and nobody else’s records', async () => {
    await prisma.studyNudgeSetting.create({
      data: { userId: user.id, studyCategories: ['DSA', 'Backend'] },
    });
    await session('2026-10-26', 'DSA');
    await session('2026-10-26', 'Technical');
    await session('2026-10-18', 'Backend');
    const otherId = `noticed-other-${randomUUID()}`;
    const other = await prisma.user.create({
      data: {
        id: otherId,
        email: `${otherId}@example.com`,
        name: 'O',
        timezone: zone,
      },
    });
    try {
      await prisma.actualSession.create({
        data: {
          userId: other.id,
          category: 'Backend',
          startedAt: at('2026-10-26', '07:00'),
          endedAt: at('2026-10-26', '08:00'),
        },
      });
      expect((await noticedFor(user, now)).map((c) => c.title)).toEqual([
        'No Backend recorded in 9 days',
      ]);
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });
});

const target = '20261027180000_rumi_noticed';
describe.skipIf(!url)('WI-043 noticed answers upgrade', () => {
  it('adds answers with a known kind, one per card and owner', async () => {
    const pg = new Client({ connectionString: url });
    await pg.connect();
    const schema = `noticed_${randomUUID().replaceAll('-', '')}`;
    try {
      await pg.query(`SET TimeZone TO 'UTC'`);
      await pg.query(`CREATE SCHEMA "${schema}"`);
      await pg.query(`SET search_path TO "${schema}"`);
      const all = (await readdir('prisma/migrations'))
        .filter((d) => !d.endsWith('.toml'))
        .sort();
      expect(all).toContain(target);
      for (const m of all.slice(0, all.indexOf(target)))
        await pg.query(
          await readFile(`prisma/migrations/${m}/migration.sql`, 'utf8'),
        );
      await pg.query(
        `INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('u','u@example.com','U',now())`,
      );
      await pg.query(
        await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      );
      await pg.query(
        `INSERT INTO "NoticedAnswer" (id,"userId",key,kind,"hiddenUntil","dismissedAt","updatedAt") VALUES ('a','u','idle:dsa','idle','2026-11-03',now(),now())`,
      );
      await expect(
        pg.query(
          `INSERT INTO "NoticedAnswer" (id,"userId",key,kind,"hiddenUntil","updatedAt") VALUES ('b','u','idle:dsa','idle','2026-11-03',now())`,
        ),
      ).rejects.toThrow();
      await expect(
        pg.query(
          `INSERT INTO "NoticedAnswer" (id,"userId",key,kind,"hiddenUntil","updatedAt") VALUES ('c','u','x:y','mood','2026-11-03',now())`,
        ),
      ).rejects.toThrow();
      await pg.query(`DELETE FROM "User" WHERE id = 'u'`);
      expect(
        (await pg.query(`SELECT count(*)::int AS n FROM "NoticedAnswer"`))
          .rows[0].n,
      ).toBe(0);
    } finally {
      await pg.query('SET search_path TO public');
      await pg.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pg.end();
    }
  });
});
