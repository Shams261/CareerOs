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
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import { searchCommands, todayCommands } from '../src/features/command/service';
import { localInstant } from '../src/lib/time';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const day = '2026-10-27';
const at = (t: string) => localInstant(day, t, zone);

describe.skipIf(!url)('Command bar (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const users: { id: string; timezone: string }[] = [];
  const person = async () => {
    const id = `cmd-${randomUUID()}`;
    const u = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'Cmd', timezone: zone },
    });
    users.push(u);
    return u;
  };
  let user: { id: string; timezone: string };
  beforeEach(async () => {
    user = await person();
  });
  afterEach(async () => {
    while (users.length)
      await prisma.user.delete({ where: { id: users.pop()!.id } });
  });
  afterAll(() => prisma.$disconnect());

  it("lists the day's blocks still to do, then review and add", async () => {
    const plan = await prisma.dailyPlan.create({
      data: { userId: user.id, date: new Date(day) },
    });
    const block = (
      title: string,
      from: string,
      to: string,
      status = 'PLANNED',
    ) =>
      prisma.timeBlock.create({
        data: {
          dailyPlanId: plan.id,
          title,
          category: 'DSA',
          plannedStart: at(from),
          plannedEnd: at(to),
          status: status as 'PLANNED' | 'COMPLETED',
          completedAt: status === 'COMPLETED' ? at(to) : null,
        },
      });
    await block('Earlier drill', '07:00', '08:00');
    await block('Done already', '10:00', '11:00', 'COMPLETED');
    const later = await block('Graphs', '18:00', '19:00');
    const today = await todayCommands(user, at('12:00'));
    expect(today.map((c) => `${c.verb}|${c.title}|${c.meta ?? ''}`)).toEqual([
      'Start focus|Graphs|18:00–19:00',
      'Review day||',
      'Add a block||',
    ]);
    expect(today[0].href).toBe(`/focus?block=${later.id}`);
    expect(today[1]).toMatchObject({ href: '/today', panel: 'review' });
    // From the stop time (21:30 by default) the review is Close the day.
    expect((await todayCommands(user, at('22:00')))[0].verb).toBe(
      'Close the day',
    );
    // A running session comes first, instead of the blocks.
    await prisma.actualSession.create({
      data: {
        userId: user.id,
        taskId: later.id,
        category: 'DSA',
        startedAt: at('11:50'),
      },
    });
    expect((await todayCommands(user, at('12:00')))[0]).toMatchObject({
      verb: 'Back to focus',
      title: 'Graphs',
      href: '/focus',
    });
  });

  it("finds only the owner's items, problems and applications", async () => {
    const other = await person();
    const roadmap = async (userId: string) =>
      prisma.roadmap.create({
        data: { userId, title: 'System design', studyAi: true },
      });
    const mine = await roadmap(user.id);
    const theirs = await roadmap(other.id);
    const item = await prisma.roadmapItem.create({
      data: {
        userId: user.id,
        roadmapId: mine.id,
        section: 'Building blocks',
        title: 'Rate limiter',
      },
    });
    await prisma.roadmapItem.create({
      data: {
        userId: other.id,
        roadmapId: theirs.id,
        section: 'Building blocks',
        title: 'Rate limiter (theirs)',
      },
    });
    const topic = await prisma.dsaTopic.upsert({
      where: { name: 'Sliding Window' },
      create: { name: 'Sliding Window' },
      update: {},
    });
    await prisma.dsaProblem.create({
      data: {
        userId: user.id,
        title: 'Rate of fruit baskets',
        platform: 'LeetCode',
        problemUrl: 'https://leetcode.com/problems/fruit-into-baskets/',
        difficulty: 'MEDIUM',
        topicId: topic.id,
      },
    });
    await prisma.jobApplication.create({
      data: {
        userId: user.id,
        company: 'Northwind Labs',
        role: 'Rate platform engineer',
        stage: 'RECRUITER_SCREEN',
      },
    });
    const key = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const found = await searchCommands(user, 'rate', at('12:00'));
      expect(
        found.map((c) => `${c.group}|${c.verb}|${c.title}|${c.meta}`),
      ).toEqual([
        'Roadmap|Open|Rate limiter|System design · Building blocks',
        'Practice|Open|Rate of fruit baskets|Medium · Sliding Window',
        'Jobs|Open|Northwind Labs|Rate platform engineer · Recruiter screen',
      ]);
      expect(found[0].href).toBe(
        `/roadmap/${mine.id}?section=Building%20blocks#item-${item.id}`,
      );
      // With AI configured and the roadmap allowing it, the item also offers Grill me.
      process.env.OPENROUTER_API_KEY = `sk-or-v1-${'a'.repeat(40)}`;
      const withAi = await searchCommands(user, 'grill rate', at('12:00'));
      expect(withAi[0]).toMatchObject({
        verb: 'Grill me',
        title: 'Rate limiter',
        explicit: true,
        press: `#item-${item.id} [data-grill-open]`,
      });
      expect(await searchCommands(user, 'x', at('12:00'))).toEqual([]);
    } finally {
      if (key) process.env.OPENROUTER_API_KEY = key;
      else delete process.env.OPENROUTER_API_KEY;
    }
  });
});
