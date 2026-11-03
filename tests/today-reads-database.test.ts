import { afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import { attentionReminders } from '../src/features/today/reads';
const url = process.env.TEST_DATABASE_URL;

/**
 * Needs attention's reminders (WI-145): Rumi's lines, the afternoon one included, stay on their
 * own card, and a long-unread inbox is one bounded read, newest first.
 */
describe.skipIf(!url)('attentionReminders (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const user = { id: `tr-${randomUUID()}`, timezone: 'America/Toronto' };
  afterAll(async () => {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  });
  it('leaves out every study line and keeps the newest 50', async () => {
    await prisma.user.create({
      data: { ...user, name: 'T', email: `${user.id}@example.com` },
    });
    const now = new Date('2026-11-02T18:00:00Z');
    const row = (type: string, minutesAgo: number, n: number) => ({
      userId: user.id,
      type: type as 'UPCOMING_BLOCK',
      title: 't',
      body: 'b',
      scheduledFor: new Date(+now - minutesAgo * 60000),
      dedupeKey: `${user.id}:${type}:${n}`,
    });
    await prisma.notificationLog.createMany({
      data: [
        ...[
          'STUDY_MORNING',
          'STUDY_MIDDAY',
          'STUDY_EVENING',
          'STUDY_BLOCK',
        ].map((t, i) => row(t, 1, i)),
        ...Array.from({ length: 60 }, (_, i) =>
          row('UPCOMING_BLOCK', i + 2, i),
        ),
      ],
    });
    const rows = await attentionReminders(user, now);
    expect(rows).toHaveLength(50);
    expect(rows.every((r) => r.type === 'UPCOMING_BLOCK')).toBe(true);
    expect(rows[0].dedupeKey).toBe(`${user.id}:UPCOMING_BLOCK:0`);
  });
});
