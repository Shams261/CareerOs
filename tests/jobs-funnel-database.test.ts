import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import { funnelSnapshot } from '../src/features/jobs/service';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('the jobs funnel from the records (WI-056)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const user = { id: `funnel-${randomUUID()}`, timezone: 'America/Toronto' },
    other = { id: `funnel-${randomUUID()}`, timezone: 'America/Toronto' };
  // Wednesday 2026-10-28 10:00 Toronto.
  const now = new Date('2026-10-28T14:00:00Z');

  beforeAll(async () => {
    for (const u of [user, other])
      await prisma.user.create({
        data: {
          id: u.id,
          email: `${u.id}@example.com`,
          name: 'Funnel test',
          timezone: u.timezone,
        },
      });
    const app = (
      userId: string,
      company: string,
      stage: string,
      appliedAt: string | null,
    ) =>
      prisma.jobApplication.create({
        data: {
          userId,
          company,
          role: 'Engineer',
          stage: stage as 'APPLIED',
          appliedAt: appliedAt ? new Date(appliedAt) : null,
        },
      });
    const rejected = await app(user.id, 'Northwind', 'REJECTED', '2026-10-26');
    await prisma.jobActivity.create({
      data: {
        userId: user.id,
        applicationId: rejected.id,
        type: 'STAGE_CHANGED',
        occurredAt: now,
        fromStage: 'APPLIED',
        toStage: 'TECHNICAL',
      },
    });
    const screened = await app(user.id, 'Fabrikam', 'APPLIED', '2026-10-27');
    await prisma.interviewRound.create({
      data: {
        userId: user.id,
        applicationId: screened.id,
        title: 'Recruiter',
        type: 'RECRUITER',
        scheduledStart: now,
        timezone: 'America/Toronto',
      },
    });
    await app(user.id, 'Contoso', 'APPLIED', '2026-10-21');
    await app(user.id, 'TEST Co', 'OFFER', '2026-10-27');
    await app(user.id, 'Saved only', 'SAVED', null);
    await app(other.id, 'Theirs', 'OFFER', '2026-10-27');
  });
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
    await prisma.$disconnect();
  });

  it('counts the owner’s real applications by week, from history and rounds', async () => {
    const f = await funnelSnapshot(user, now);
    expect(f.sent).toBe(3);
    expect(f.weeks.slice(0, 2)).toEqual([
      { monday: '2026-10-26', counts: [2, 2, 1, 0, 0] },
      { monday: '2026-10-19', counts: [1, 0, 0, 0, 0] },
    ]);
    expect(f.all).toEqual([3, 2, 1, 0, 0]);
  });
});
