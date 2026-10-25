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
import { markNotificationOpened } from '../src/features/notifications/service';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('notification opened stamp (R3)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  let owner: { id: string };
  let other: { id: string };
  beforeEach(async () => {
    const make = (tag: string) =>
      prisma.user.create({
        data: {
          id: `${tag}-${randomUUID()}`,
          email: `${tag}-${randomUUID()}@example.com`,
          name: tag,
        },
      });
    owner = await make('opened');
    other = await make('stranger');
  });
  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, other.id] } },
    });
  });
  afterAll(() => prisma.$disconnect());

  it('stamps openedAt once and only for the owner', async () => {
    const n = await prisma.notificationLog.create({
      data: {
        userId: owner.id,
        type: 'DAILY_PROGRESS',
        title: 'Ready to review your day?',
        body: 'Ready to review your day?',
        scheduledFor: new Date('2026-10-25T21:00Z'),
        dedupeKey: `${owner.id}:DAILY_PROGRESS:day:2026-10-25`,
      },
    });
    expect(await markNotificationOpened(other.id, n.id)).toBe(false);
    expect(
      (await prisma.notificationLog.findUniqueOrThrow({ where: { id: n.id } }))
        .openedAt,
    ).toBeNull();
    const first = new Date('2026-10-25T21:05Z');
    expect(await markNotificationOpened(owner.id, n.id, first)).toBe(true);
    expect(
      await markNotificationOpened(
        owner.id,
        n.id,
        new Date('2026-10-25T22:00Z'),
      ),
    ).toBe(false);
    expect(
      (await prisma.notificationLog.findUniqueOrThrow({ where: { id: n.id } }))
        .openedAt,
    ).toEqual(first);
    expect(await markNotificationOpened(owner.id, 'missing')).toBe(false);
  });
});
