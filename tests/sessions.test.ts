import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
import { deviceLabel } from '../src/lib/user-agent';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
vi.mock('../src/server/db', () => ({ db: () => client.value }));
import {
  activeSessions,
  createSession,
  resolveSession,
  revokeOtherSessions,
  revokeSession,
} from '../src/server/session';

describe('device names for the Sessions list (WI-057)', () => {
  it('says the browser and the platform, nothing more', () => {
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const mac =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
    const edge = `${mac} Edg/141.0.0.0`;
    const android =
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
    const firefox =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';
    expect(deviceLabel(iphone)).toBe('Safari on iPhone');
    expect(deviceLabel(mac)).toBe('Chrome on macOS');
    expect(deviceLabel(edge)).toBe('Edge on macOS');
    expect(deviceLabel(android)).toBe('Chrome on Android');
    expect(deviceLabel(firefox)).toBe('Firefox on Windows');
    expect(deviceLabel('curl/8.0')).toBe('Unknown device');
    expect(deviceLabel(null)).toBe('Unknown device');
  });
});

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('Sessions in Settings (WI-057)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const owner = `sessions-${randomUUID()}`,
    other = `sessions-${randomUUID()}`;
  const now = new Date('2026-10-28T14:00:00Z');
  beforeAll(async () => {
    Object.assign(process.env, {
      OWNER_EMAIL: `${owner}@example.com`,
      DATABASE_URL: url,
      CRON_SECRET: 's'.repeat(40),
    });
    for (const id of [owner, other])
      await prisma.user.create({
        data: { id, email: `${id}@example.com`, name: 'S' },
      });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } });
    await prisma.$disconnect();
  });

  it('lists live sessions with this one marked, and signs out only the others', async () => {
    const here = await createSession(owner, 'Chrome on Mac', now);
    const phone = await createSession(owner, 'iPhone', new Date(+now + 60_000));
    const theirs = await createSession(other, 'Theirs', now);
    const old = await createSession(owner, 'Old', new Date('2026-01-01'));
    const current = await resolveSession(here, now);
    const list = await activeSessions(owner, current!.id, now);
    // The expired one is left out; the newest activity comes first.
    expect(list.map((s) => [s.userAgent, s.current])).toEqual([
      ['iPhone', false],
      ['Chrome on Mac', true],
    ]);
    expect(await revokeOtherSessions(owner, current!.id, now)).toBe(2);
    expect(await resolveSession(here, now)).not.toBeNull();
    expect(await resolveSession(phone, now)).toBeNull();
    expect(await resolveSession(old, now)).toBeNull();
    // Another user's session is never touched.
    const row = await prisma.session.findFirstOrThrow({
      where: { userId: other },
    });
    expect(row.revokedAt).toBeNull();
    void theirs;
  });

  it('keeps a resolved session for a minute, and a sign-out ends it at once (WI-061)', async () => {
    process.env.SNAPSHOT_CACHE = 'on';
    try {
      const token = await createSession(owner, 'Cached', now);
      const first = await resolveSession(token, now);
      // Changed behind the app's back: the cached copy answers without a read.
      await prisma.session.update({
        where: { id: first!.id },
        data: { revokedAt: now },
      });
      expect((await resolveSession(token, now))?.id).toBe(first!.id);
      await prisma.session.update({
        where: { id: first!.id },
        data: { revokedAt: null },
      });
      // Signing out goes through the app, which drops every cached session.
      await revokeSession(token, now);
      expect(await resolveSession(token, now)).toBeNull();
      // An unknown token is never kept, so made-up cookies cannot grow the cache (WI-062).
      const cache = (
        globalThis as unknown as { silsilaSessions: Map<string, unknown> }
      ).silsilaSessions;
      const before = cache.size;
      expect(await resolveSession('x'.repeat(43), now)).toBeNull();
      expect(cache.size).toBe(before);
    } finally {
      delete process.env.SNAPSHOT_CACHE;
    }
  });
});
