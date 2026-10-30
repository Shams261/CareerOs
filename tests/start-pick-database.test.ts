import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import { startPick } from '../src/features/for-today/service';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('Start 20 min over the day (WI-080 fix)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const user = { id: `pick-${randomUUID()}`, timezone: 'America/Toronto' };
  const now = new Date('2026-10-29T21:45:30Z');
  const at = (iso: string) => new Date(iso);
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: user.id,
        email: `${user.id}@example.com`,
        name: 'Pick test',
        timezone: user.timezone,
      },
    });
  });
  afterAll(async () => {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  });
  const block = async (title: string, status: 'COMPLETED' | 'PLANNED') => {
    const day = await prisma.dailyPlan.upsert({
      where: { userId_date: { userId: user.id, date: new Date('2026-10-29') } },
      create: { userId: user.id, date: new Date('2026-10-29') },
      update: {},
    });
    return prisma.timeBlock.create({
      data: {
        dailyPlanId: day.id,
        title,
        category: 'DSA',
        status,
        completedAt: status === 'COMPLETED' ? at('2026-10-29T21:40:00Z') : null,
        plannedStart: at('2026-10-29T21:30:00Z'),
        plannedEnd: at('2026-10-29T22:00:00Z'),
      },
    });
  };

  it('goes over a done block’s slot', async () => {
    await block('UAT check: rings', 'COMPLETED');
    const saved = await startPick(
      user,
      { title: 'Contains Duplicate', category: 'DSA' },
      now,
    );
    expect(saved.created).toBe(true);
    const made = await prisma.timeBlock.findUniqueOrThrow({
      where: { id: saved.id },
    });
    expect(made.plannedStart.toISOString()).toBe('2026-10-29T21:46:00.000Z');
  });

  it('refuses a block still planned over that time, by name', async () => {
    await block('Graphs: BFS practice', 'PLANNED');
    await expect(
      startPick(user, { title: 'Two Sum', category: 'DSA' }, now),
    ).rejects.toThrow(
      'Graphs: BFS practice is planned for 17:30–18:00. Start that block, or move it first.',
    );
  });
});
