import { afterAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
vi.mock('../src/server/db', () => ({ db: () => client.value }));
import { jobFreshness } from '../src/server/health';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('job freshness on the health check (WI-051)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reads ok or stale from JobRun and says nothing more', async () => {
    const now = new Date();
    const before = await prisma.jobRun.findUnique({
      where: { name: 'notifications' },
    });
    try {
      await prisma.jobRun.upsert({
        where: { name: 'notifications' },
        create: { name: 'notifications', lastSucceededAt: now },
        update: { lastSucceededAt: now },
      });
      // Other jobs left by other tests may be stale; only reminders are forced here.
      await prisma.jobRun.updateMany({
        where: { name: { in: ['calendar-sync', 'ai-provider-check'] } },
        data: { lastSucceededAt: now },
      });
      expect(await jobFreshness(now)).toBe('ok');
      expect(await jobFreshness(new Date(+now + 20 * 60000))).toBe('stale');
    } finally {
      if (before)
        await prisma.jobRun.update({
          where: { name: 'notifications' },
          data: { lastSucceededAt: before.lastSucceededAt },
        });
      else await prisma.jobRun.delete({ where: { name: 'notifications' } });
    }
  });
});
