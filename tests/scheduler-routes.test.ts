import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

/**
 * The two scheduler routes (WI-145): a calendar run where every connection failed is recorded
 * as a failure, and each daily job beside the reminders runs even when one before it throws.
 */
const runs: { name: string; ok: boolean }[] = [];
vi.mock('@/server/jobs', () => ({
  recordRun: async (name: string, work: () => Promise<unknown>) => {
    try {
      const out = await work();
      runs.push({ name, ok: true });
      return out;
    } catch (e) {
      runs.push({ name, ok: false });
      throw e;
    }
  },
}));
const outcomes: { ok: boolean; code?: string }[] = [];
vi.mock('@/server/db', () => ({
  db: () => ({
    calendarConnection: {
      findMany: async () => outcomes.map((_, i) => ({ user: { id: `u${i}` } })),
    },
  }),
}));
vi.mock('@/features/calendar/service', () => ({
  defaultDeps: () => ({}),
  syncCalendar: async (u: { id: string }) => outcomes[Number(u.id.slice(1))],
}));
const daily = {
  provider: vi.fn(),
  prune: vi.fn(),
  learn: vi.fn(),
  retention: vi.fn(),
};
vi.mock('@/features/notifications/service', () => ({
  processNotifications: async () => ({ candidates: 0 }),
}));
vi.mock('@/features/push/service', () => ({
  deliverPending: async () => ({}),
}));
vi.mock('@/features/agent/lines', () => ({
  writeRumiLines: async () => ({ written: 0 }),
}));
vi.mock('@/features/ai/service', () => ({
  dailyProviderCheck: () => daily.provider(),
}));
vi.mock('@/features/agent/memory-service', () => ({
  pruneMemories: () => daily.prune(),
}));
vi.mock('@/features/nudges/learn-service', () => ({
  learnNudgeTimes: () => daily.learn(),
}));
vi.mock('@/features/notifications/retention', () => ({
  dailyRetention: () => daily.retention(),
}));

beforeEach(() => {
  runs.length = 0;
  outcomes.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('POST /api/calendar/sync', () => {
  it('records a run where every connection failed as a failure, still answering 200', async () => {
    const { POST } = await import('../src/app/api/calendar/sync/route');
    outcomes.push({ ok: false, code: 'auth' });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ synced: 0, failed: 1, busy: 0 });
    expect(runs).toEqual([{ name: 'calendar-sync', ok: false }]);
  });
  it('keeps a run with a success, a busy lease or no connection as a success', async () => {
    const { POST } = await import('../src/app/api/calendar/sync/route');
    for (const set of [
      [{ ok: true }, { ok: false, code: 'auth' }],
      [{ ok: false, code: 'busy' }],
      [],
    ]) {
      runs.length = 0;
      outcomes.length = 0;
      outcomes.push(...set);
      expect((await POST()).status).toBe(200);
      expect(runs).toEqual([{ name: 'calendar-sync', ok: true }]);
    }
  });
});

describe('POST /api/notifications/process', () => {
  it('runs every daily job even when the one before it throws', async () => {
    const { POST } = await import('../src/app/api/notifications/process/route');
    daily.provider.mockRejectedValueOnce(new TypeError('x'));
    daily.learn.mockRejectedValueOnce(new RangeError('y'));
    const res = await POST();
    expect(res.status).toBe(200);
    for (const f of Object.values(daily)) expect(f).toHaveBeenCalledOnce();
    expect(vi.mocked(console.error).mock.calls).toEqual([
      ['[study] daily run failed', 'TypeError'],
      ['[nudges] daily run failed', 'RangeError'],
    ]);
  });
});
