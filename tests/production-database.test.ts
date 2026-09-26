import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  createSession,
  ownerAccount,
  resolveSession,
  revokeSession,
} from '../src/server/session';
import {
  deliverPending,
  saveSubscription,
  removeSubscription,
  type PushSender,
} from '../src/features/push/service';
import { processNotifications } from '../src/features/notifications/service';
import { exportOwnerData } from '../src/server/export';
import { healthCheck, LATEST_MIGRATION } from '../src/server/health';
import { recordRun } from '../src/server/jobs';
import { sha256 } from '../src/lib/token-crypto';
import { localInstant } from '../src/lib/time';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const cfg = {
  publicKey: 'p'.repeat(87),
  privateKey: 'k'.repeat(43),
  subject: 'mailto:owner@example.com',
};
const sub = (n: number) => ({
  endpoint: `https://push.example.com/send/${randomUUID()}-${n}`,
  keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
});

describe.skipIf(!url)('production hardening (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const ownerEmail = `owner-${randomUUID()}@example.com`;
  const user = { id: `prod-${randomUUID()}`, timezone: zone };
  const saved = { ...process.env };
  beforeAll(async () => {
    Object.assign(process.env, {
      OWNER_EMAIL: ownerEmail,
      DATABASE_URL: url,
      CRON_SECRET: 'c'.repeat(40),
    });
    await prisma.user.create({
      data: { ...user, email: ownerEmail, name: 'Owner' },
    });
  });
  afterAll(async () => {
    process.env = saved;
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  it('stores only a hash of session tokens and rejects expired, revoked or non-owner sessions', async () => {
    const now = new Date('2026-09-24T12:00:00Z');
    const token = await createSession(user.id, 'Test agent', now);
    expect(await prisma.session.count({ where: { tokenHash: token } })).toBe(0);
    expect(
      await prisma.session.count({ where: { tokenHash: sha256(token) } }),
    ).toBe(1);
    expect((await resolveSession(token, now))?.user.id).toBe(user.id);
    expect(await resolveSession('not-a-token', now)).toBeNull();
    expect(await resolveSession(undefined, now)).toBeNull();
    expect(
      await resolveSession(token, new Date(+now + 31 * 86400000)),
    ).toBeNull();
    // The allowlist is re-checked on every request: changing OWNER_EMAIL locks old sessions out.
    process.env.OWNER_EMAIL = 'someone-else@example.com';
    expect(await resolveSession(token, now)).toBeNull();
    process.env.OWNER_EMAIL = ownerEmail;
    await revokeSession(token, now);
    expect(await resolveSession(token, now)).toBeNull();
  });

  it('signs in to the existing owner row and never starts a second workspace', async () => {
    expect((await ownerAccount(ownerEmail.toUpperCase())).id).toBe(user.id);
    const before = await prisma.user.count();
    await expect(
      ownerAccount(`typo-${randomUUID()}@example.com`),
    ).rejects.toMatchObject({ code: 'owner_mismatch' });
    expect(await prisma.user.count()).toBe(before);
  });

  it('delivers NotificationLog reminders by push, revokes dead devices and keeps the inbox', async () => {
    const now = new Date('2026-09-24T22:00:00Z');
    const a = await saveSubscription(user, sub(1)),
      b = await saveSubscription(user, sub(2));
    await expect(
      saveSubscription(user, {
        ...sub(3),
        endpoint: 'http://insecure.example.com/x',
      }),
    ).rejects.toThrow();
    const log = await prisma.notificationLog.create({
      data: {
        userId: user.id,
        type: 'DSA_REVISION',
        title: '2 DSA problems due',
        body: '',
        scheduledFor: now,
        dedupeKey: `${user.id}:DSA_REVISION:day:${randomUUID()}`,
      },
    });
    const stale = await prisma.notificationLog.create({
      data: {
        userId: user.id,
        type: 'DSA_REVISION',
        title: 'old',
        body: '',
        scheduledFor: new Date(+now - 3 * 3600000),
        dedupeKey: `${user.id}:x:${randomUUID()}`,
      },
    });
    const calls: string[] = [];
    const sender: PushSender = async (t, payload) => {
      calls.push(payload);
      return t.endpoint === a.endpoint ? 201 : 410;
    };
    const r = await deliverPending(now, sender, cfg);
    expect(r).toMatchObject({ notifications: 1, delivered: 1, revoked: 1 });
    expect(JSON.parse(calls[0])).toEqual({
      title: 'Silsila',
      body: '2 DSA problems due',
      tag: log.id,
      url: '/dsa',
    });
    expect(
      await prisma.pushSubscription.findUniqueOrThrow({ where: { id: b.id } }),
    ).toMatchObject({ revokedAt: now });
    expect(
      await prisma.notificationLog.findUniqueOrThrow({ where: { id: log.id } }),
    ).toMatchObject({ sentAt: now, readAt: null });
    expect(
      (
        await prisma.notificationLog.findUniqueOrThrow({
          where: { id: stale.id },
        })
      ).pushAttempts,
    ).toBe(0);
    // Delivered reminders are not pushed twice.
    await deliverPending(new Date(+now + 60000), sender, cfg);
    expect(calls).toHaveLength(2);
    await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
    await prisma.notificationLog.deleteMany({ where: { userId: user.id } });
  });

  it('bounds transient failures; the inbox record survives when push never succeeds', async () => {
    const now = new Date('2026-09-24T22:00:00Z');
    const s = await saveSubscription(user, sub(4));
    const log = await prisma.notificationLog.create({
      data: {
        userId: user.id,
        type: 'WEEKLY_REVIEW',
        title: 'Your weekly CareerOS review is ready.',
        body: '',
        scheduledFor: now,
        dedupeKey: `${user.id}:WEEKLY_REVIEW:week:${randomUUID()}`,
      },
    });
    let n = 0;
    const down: PushSender = async () => (n++, 503);
    for (let i = 0; i < 5; i++)
      await deliverPending(new Date(+now + i * 60000), down, cfg);
    expect(n).toBe(3); // MAX_PUSH_ATTEMPTS
    expect(
      await prisma.notificationLog.findUniqueOrThrow({ where: { id: log.id } }),
    ).toMatchObject({ sentAt: null, pushAttempts: 3 });
    expect(
      (await prisma.pushSubscription.findUniqueOrThrow({ where: { id: s.id } }))
        .failureCount,
    ).toBe(3);
    await removeSubscription(user, s.endpoint);
    expect(
      (await prisma.pushSubscription.findUniqueOrThrow({ where: { id: s.id } }))
        .revokedAt,
    ).not.toBeNull();
    await prisma.notificationLog.deleteMany({ where: { userId: user.id } });
  });

  it('pushes the evening daily-progress reminder once when the app is closed', async () => {
    const evening = localInstant('2026-09-24', '21:45', zone);
    await prisma.notificationPreference.create({
      data: {
        userId: user.id,
        type: 'DAILY_PROGRESS',
        preferredTime: '21:30',
        timezone: zone,
      },
    });
    const s = await saveSubscription(user, sub(5));
    const sent: string[] = [];
    const sender: PushSender = async (_t, p) => (
      sent.push(JSON.parse(p).body),
      201
    );
    await processNotifications(evening);
    await deliverPending(evening, sender, cfg);
    await processNotifications(new Date(+evening + 60000));
    await deliverPending(new Date(+evening + 60000), sender, cfg);
    expect(sent).toEqual(["You haven't checked today's progress yet."]);
    expect(
      await prisma.notificationLog.count({
        where: { userId: user.id, type: 'DAILY_PROGRESS' },
      }),
    ).toBe(1);
    await removeSubscription(user, s.endpoint);
  });

  it('exports domain data without credentials, push keys or sessions', async () => {
    await prisma.calendarConnection.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        status: 'CONNECTED',
        encryptedRefreshToken: 'v1:SECRET-TOKEN',
        syncToken: 'SYNC-TOKEN-XYZ',
        calendarName: 'CareerOS',
      },
      update: {},
    });
    await saveSubscription(user, {
      ...sub(6),
      keys: { p256dh: 'P'.repeat(87), auth: 'AUTHSECRET' + 'x'.repeat(12) },
    });
    await createSession(user.id, null);
    const data = await exportOwnerData(user.id);
    const json = JSON.stringify(data);
    for (const secret of [
      'SECRET-TOKEN',
      'SYNC-TOKEN-XYZ',
      'AUTHSECRET',
      'encryptedRefreshToken',
      'tokenHash',
      'p256dh',
      'syncToken',
    ])
      expect(json).not.toContain(secret);
    expect(data).toMatchObject({
      format: 'careeros-export',
      user: { email: ownerEmail },
      googleCalendar: { status: 'CONNECTED', calendarName: 'CareerOS' },
    });
  });

  it('reports health without secrets and records job runs', async () => {
    const newest = readdirSync('prisma/migrations')
      .filter((d) => !d.endsWith('.toml'))
      .sort()
      .at(-1);
    expect(LATEST_MIGRATION).toBe(newest);
    expect(await healthCheck()).toEqual({
      ok: true,
      database: 'ok',
      sessionTimeZone: 'UTC',
      schema: 'current',
    });
    await recordRun('test-job', async () => ({ processed: 2 }));
    await expect(
      recordRun('test-job', async () => Promise.reject(new TypeError('boom'))),
    ).rejects.toThrow();
    expect(
      await prisma.jobRun.findUniqueOrThrow({ where: { name: 'test-job' } }),
    ).toMatchObject({
      lastSummary: { processed: 2 },
      lastError: 'TypeError',
    });
    await prisma.jobRun.delete({ where: { name: 'test-job' } });
  });
});
