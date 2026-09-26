import { afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
import { FakeGoogle } from './support/fake-google';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  beginOAuth,
  completeOAuth,
  disconnectCalendar,
  resolveConflict,
  saveExcludedCategories,
  syncCalendar,
  verifyWebhook,
  type CalendarDeps,
} from '../src/features/calendar/service';
import { PROP, managedBlockId } from '../src/features/calendar/domain';
import {
  GoogleApiError,
  type CalendarApi,
} from '../src/features/calendar/google';
import {
  decryptSecret,
  parseEncryptionKey,
  sha256,
} from '../src/lib/token-crypto';
import { localInstant } from '../src/lib/time';
import { generatePlan } from '../src/features/schedule/service';
import {
  addInterviewToSchedule,
  createApplication,
  rescheduleRound,
  scheduleRound,
} from '../src/features/jobs/service';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
// Thursday 2026-09-24, 10:00 Toronto.
const NOW = new Date('2026-09-24T14:00:00Z');
const minutes = (d: Date, n: number) => new Date(+d + n * 60000);

describe.skipIf(!url)(
  'Google Calendar sync (mocked Google, real PostgreSQL)',
  () => {
    const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
    client.value = prisma;
    const users: string[] = [];
    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.$disconnect();
    });

    /** Every API call first obtains an access token, like the real client. */
    const authed = (api: CalendarApi, token: () => Promise<string>) =>
      new Proxy(api, {
        get:
          (target, prop: keyof CalendarApi) =>
          async (...args: unknown[]) => {
            await token();
            return (target[prop] as (...a: unknown[]) => unknown)(...args);
          },
      }) as CalendarApi;
    function makeDeps(
      fake: FakeGoogle,
      over: Partial<CalendarDeps['config']> = {},
    ) {
      let now = NOW;
      const deps: CalendarDeps & { at(d: Date): void } = {
        config: {
          clientId: 'client',
          clientSecret: 'secret',
          redirectUri: 'http://localhost:3000/api/calendar/oauth/callback',
          encryptionKey: Buffer.alloc(32, 3).toString('base64'),
          authUrl: 'x',
          tokenUrl: 'x',
          revokeUrl: 'x',
          apiUrl: 'x',
          ...over,
        },
        oauth: fake.oauth(),
        calendar: (token) => authed(fake.api(), token),
        now: () => now,
        at(d) {
          now = d;
          fake.clock = () => d;
        },
      };
      fake.clock = () => now;
      return deps;
    }
    async function newUser() {
      const user = { id: `cal-${randomUUID()}`, timezone: zone };
      users.push(user.id);
      await prisma.user.create({
        data: { ...user, name: 'Cal', email: `${user.id}@example.com` },
      });
      return user;
    }
    async function connect(
      user: { id: string; timezone: string },
      deps: CalendarDeps,
    ) {
      const { url: authUrl, cookie } = beginOAuth(user, deps);
      const state = new URL(authUrl).searchParams.get('state')!;
      return completeOAuth(user, { code: 'code', state, cookie }, deps);
    }
    async function setup(over: Partial<CalendarDeps['config']> = {}) {
      const fake = new FakeGoogle();
      const deps = makeDeps(fake, over);
      const user = await newUser();
      const conn = await connect(user, deps);
      return { fake, deps, user, calendarId: conn.calendarId! };
    }
    async function block(
      userId: string,
      day: string,
      start: string,
      end: string,
      over: Record<string, unknown> = {},
    ) {
      const plan = await prisma.dailyPlan.upsert({
        where: { userId_date: { userId, date: new Date(day) } },
        create: { userId, date: new Date(day) },
        update: {},
      });
      return prisma.timeBlock.create({
        data: {
          dailyPlanId: plan.id,
          title: 'DSA',
          category: 'DSA',
          plannedStart: localInstant(day, start, zone),
          plannedEnd: localInstant(day, end, zone),
          ...(over.status === 'COMPLETED' ? { completedAt: NOW } : {}),
          ...over,
        },
      });
    }
    const eventFor = (fake: FakeGoogle, calendarId: string, blockId: string) =>
      fake.live(calendarId).filter((e) => managedBlockId(e) === blockId);
    const reload = (id: string) =>
      prisma.timeBlock.findUniqueOrThrow({
        where: { id },
        include: { dailyPlan: true },
      });

    it('connects with validated state, encrypted refresh token and a dedicated calendar', async () => {
      const fake = new FakeGoogle();
      const deps = makeDeps(fake);
      const user = await newUser();
      const { url: authUrl, cookie } = beginOAuth(user, deps);
      expect(cookie).not.toContain(new URL(authUrl).searchParams.get('state')!);
      const state = new URL(authUrl).searchParams.get('state')!;
      const attempt = (over: Record<string, unknown>, d: CalendarDeps = deps) =>
        completeOAuth(user, { code: 'code', state, cookie, ...over }, d);
      await expect(attempt({ state: 'forged' })).rejects.toMatchObject({
        code: 'state_mismatch',
      });
      await expect(attempt({ cookie: 'v1:a:b:c' })).rejects.toMatchObject({
        code: 'state_mismatch',
      });
      await expect(attempt({ error: 'access_denied' })).rejects.toMatchObject({
        code: 'access_denied',
      });
      await expect(
        attempt({}, { ...deps, now: () => minutes(NOW, 11) }),
      ).rejects.toMatchObject({ code: 'state_expired' });
      const other = await newUser();
      await expect(
        completeOAuth(other, { code: 'code', state, cookie }, deps),
      ).rejects.toMatchObject({ code: 'state_mismatch' });
      fake.grantedScope = 'openid email';
      await expect(attempt({})).rejects.toMatchObject({ code: 'scope_denied' });
      expect(fake.revoked).toContain('access-1');
      fake.grantedScope = `openid email https://www.googleapis.com/auth/calendar.app.created`;
      fake.omitRefreshToken = true;
      await expect(attempt({})).rejects.toMatchObject({
        code: 'missing_refresh_token',
      });
      fake.omitRefreshToken = false;
      const conn = await attempt({});
      expect(conn).toMatchObject({
        status: 'CONNECTED',
        accountEmail: 'owner@example.com',
        calendarName: 'Silsila',
        syncToken: null,
      });
      expect(conn.encryptedRefreshToken).not.toContain('refresh-secret');
      expect(
        decryptSecret(
          conn.encryptedRefreshToken!,
          parseEncryptionKey(deps.config.encryptionKey),
        ),
      ).toBe('refresh-secret-1');
      expect([...fake.calendars.values()].map((c) => c.summary)).toEqual([
        'Silsila',
      ]);
      // Reconnect reuses the CareerOS calendar and forces a full reconciliation.
      await prisma.calendarConnection.update({
        where: { id: conn.id },
        data: { syncToken: 'tok-9', status: 'REAUTH_REQUIRED' },
      });
      const again = await connect(user, deps);
      expect(again).toMatchObject({
        calendarId: conn.calendarId,
        syncToken: null,
        status: 'CONNECTED',
      });
      expect(fake.count('createCalendar')).toBe(1);
    });

    it('full sync paginates, persists the token only after the last page, and never touches foreign events', async () => {
      const { fake, deps, user, calendarId } = await setup();
      fake.pageSize = 2;
      const foreign = fake.addForeign(
        calendarId,
        'DSA',
        '2026-09-25T11:30:00Z',
        '2026-09-25T13:00:00Z',
      );
      const foreignEtag = fake
        .events(calendarId)
        .find((e) => e.id === foreign)!.etag;
      const dsa = await block(user.id, '2026-09-25', '07:30', '09:00');
      const gym = await block(user.id, '2026-09-25', '19:30', '20:30', {
        title: 'Gym',
        category: 'GYM',
      });
      const personal = await block(user.id, '2026-09-25', '12:00', '13:00', {
        title: 'Lunch',
        category: 'Personal',
      });
      const cancelled = await block(user.id, '2026-09-26', '07:30', '09:00', {
        status: 'CANCELLED',
      });
      const far = await block(user.id, '2027-02-01', '07:30', '09:00');
      const done = await block(user.id, '2026-09-23', '07:30', '09:00', {
        title: 'Work',
        category: 'WORK',
        status: 'COMPLETED',
      });
      await saveExcludedCategories(user, ['PERSONAL']);
      // Enough events to need several pages on the initial list.
      for (let i = 0; i < 3; i++)
        fake.addForeign(
          calendarId,
          `Other ${i}`,
          '2026-09-27T15:00:00Z',
          '2026-09-27T16:00:00Z',
        );
      fake.hook = (method, args) => {
        if (
          method === 'listEvents' &&
          (args[1] as { pageToken?: string }).pageToken
        ) {
          fake.hook = null;
          throw new GoogleApiError('transient', 503);
        }
      };
      const failed = await syncCalendar(user, deps);
      expect(failed).toMatchObject({ ok: false, code: 'google_unavailable' });
      expect(
        (
          await prisma.calendarConnection.findUniqueOrThrow({
            where: { userId: user.id },
          })
        ).syncToken,
      ).toBeNull();
      expect(fake.count('insertEvent')).toBe(0);
      const ok = await syncCalendar(user, deps);
      expect(ok.ok).toBe(true);
      const conn = await prisma.calendarConnection.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(conn.syncToken).toMatch(/^tok-/);
      expect(conn.lastFullSyncAt).toEqual(NOW);
      for (const b of [dsa, gym, done])
        expect(eventFor(fake, calendarId, b.id)).toHaveLength(1);
      for (const b of [personal, cancelled, far])
        expect(eventFor(fake, calendarId, b.id)).toHaveLength(0);
      const e = eventFor(fake, calendarId, dsa.id)[0];
      expect(e.start?.dateTime).toBe(dsa.plannedStart.toISOString());
      expect(e.extendedProperties?.private?.[PROP.managed]).toBe('1');
      expect(fake.events(calendarId).find((x) => x.id === foreign)!.etag).toBe(
        foreignEtag,
      );
      expect(
        fake.calls.filter(
          (c) => (c.args[1] as string) === foreign && c.method !== 'listEvents',
        ),
      ).toHaveLength(0);
      // A second (incremental) run is a no-op.
      const inserts = fake.count('insertEvent');
      const second = await syncCalendar(user, deps);
      expect(second).toMatchObject({
        ok: true,
        summary: { incremental: 1, creates: 0, patches: 0 },
      });
      expect(fake.count('insertEvent')).toBe(inserts);
    });

    it('applies Google moves, renames and deletions to the dated occurrence only', async () => {
      const { fake, deps, user, calendarId } = await setup();
      const routine = await prisma.routineBlock.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          title: 'DSA',
          category: 'DSA',
          weekdays: [5],
          startLocal: '07:30',
          endLocal: '09:00',
        },
      });
      await generatePlan(user, '2026-09-25');
      const occ = await prisma.timeBlock.findFirstOrThrow({
        where: {
          routineKey: routine.id,
          occurrenceDate: new Date('2026-09-25'),
        },
      });
      await syncCalendar(user, deps);
      const [event] = eventFor(fake, calendarId, occ.id);
      const before = await reload(occ.id);
      // Move 15 minutes later and rename in Google.
      fake.userEdit(calendarId, event.id, {
        summary: 'DSA — graphs',
        start: { dateTime: minutes(occ.plannedStart, 15).toISOString() },
        end: { dateTime: minutes(occ.plannedEnd, 15).toISOString() },
      });
      await syncCalendar(user, deps);
      const moved = await reload(occ.id);
      expect(moved).toMatchObject({
        title: 'DSA — graphs',
        plannedStart: minutes(occ.plannedStart, 15),
        isOverride: true,
        routineKey: routine.id,
        occurrenceDate: new Date('2026-09-25'),
        calendarSyncStatus: 'SYNCED',
      });
      expect(moved.updatedAt > before.updatedAt).toBe(true);
      const r = await prisma.routineBlock.findUniqueOrThrow({
        where: { id: routine.id },
      });
      expect([r.startLocal, r.endLocal, r.title, +r.updatedAt]).toEqual([
        '07:30',
        '09:00',
        'DSA',
        +routine.updatedAt,
      ]);
      // Move to Saturday: the occurrence keeps its identity; regenerating Friday does not recreate it.
      fake.userEdit(calendarId, event.id, {
        start: {
          dateTime: localInstant('2026-09-26', '10:00', zone).toISOString(),
        },
        end: {
          dateTime: localInstant('2026-09-26', '11:00', zone).toISOString(),
        },
      });
      await syncCalendar(user, deps);
      const sat = await reload(occ.id);
      expect(sat.dailyPlan.date).toEqual(new Date('2026-09-26'));
      expect(sat.occurrenceDate).toEqual(new Date('2026-09-25'));
      await generatePlan(user, '2026-09-25');
      expect(
        await prisma.timeBlock.count({
          where: {
            routineKey: routine.id,
            occurrenceDate: new Date('2026-09-25'),
          },
        }),
      ).toBe(1);
      // Deleting in Google cancels the dated occurrence; it is kept, never recreated.
      fake.userDelete(calendarId, event.id);
      await syncCalendar(user, deps);
      expect(await reload(occ.id)).toMatchObject({
        status: 'CANCELLED',
        externalCalendarEventId: null,
      });
      await syncCalendar(user, deps);
      expect(eventFor(fake, calendarId, occ.id)).toHaveLength(0);
      // Deleting a completed block's event keeps the history and detaches it.
      const done = await block(user.id, '2026-09-23', '07:30', '09:00', {
        status: 'COMPLETED',
      });
      await syncCalendar(user, deps);
      fake.userDelete(calendarId, eventFor(fake, calendarId, done.id)[0].id);
      await syncCalendar(user, deps);
      expect(await reload(done.id)).toMatchObject({
        status: 'COMPLETED',
        calendarSyncStatus: 'DETACHED',
      });
      await syncCalendar(user, deps);
      expect(eventFor(fake, calendarId, done.id)).toHaveLength(0);
    });

    it('pushes local edits with If-Match, deletes cancelled blocks, and leaves done/skipped history', async () => {
      const { fake, deps, user, calendarId } = await setup();
      const b = await block(user.id, '2026-09-25', '07:30', '09:00');
      const s = await block(user.id, '2026-09-25', '12:00', '13:00', {
        title: 'Lunch walk',
        category: 'HEALTH',
      });
      await syncCalendar(user, deps);
      const synced = await reload(b.id);
      await prisma.timeBlock.update({
        where: { id: b.id },
        data: {
          title: 'DSA — trees',
          plannedStart: localInstant('2026-09-25', '08:00', zone),
          plannedEnd: localInstant('2026-09-25', '09:30', zone),
        },
      });
      await syncCalendar(user, deps);
      const patch = fake.calls.filter((c) => c.method === 'patchEvent').at(-1)!;
      expect(patch.args[3]).toBe(synced.calendarEtag);
      expect(patch.args[2]).toEqual({
        summary: 'DSA — trees',
        start: {
          dateTime: localInstant('2026-09-25', '08:00', zone).toISOString(),
          timeZone: zone,
        },
        end: {
          dateTime: localInstant('2026-09-25', '09:30', zone).toISOString(),
          timeZone: zone,
        },
      });
      expect(eventFor(fake, calendarId, b.id)[0].summary).toBe('DSA — trees');
      const calls = fake.calls.length;
      await prisma.timeBlock.update({
        where: { id: s.id },
        data: { status: 'SKIPPED' },
      });
      await prisma.timeBlock.update({
        where: { id: b.id },
        data: { status: 'COMPLETED', completedAt: NOW },
      });
      await syncCalendar(user, deps);
      expect(
        fake.calls
          .slice(calls)
          .filter((c) => ['patchEvent', 'deleteEvent'].includes(c.method)),
      ).toHaveLength(0);
      await prisma.timeBlock.update({
        where: { id: s.id },
        data: { status: 'CANCELLED' },
      });
      await syncCalendar(user, deps);
      expect(eventFor(fake, calendarId, s.id)).toHaveLength(0);
      expect(await reload(s.id)).toMatchObject({
        externalCalendarEventId: null,
        calendarSyncStatus: 'NOT_SYNCED',
      });
    });

    it('detects both-sides changes as a conflict and resolves either way', async () => {
      const { fake, deps, user, calendarId } = await setup();
      const b = await block(user.id, '2026-09-25', '21:00', '22:15', {
        title: 'System Design',
        category: 'SYSTEM_DESIGN',
      });
      await syncCalendar(user, deps);
      const eventId = eventFor(fake, calendarId, b.id)[0].id;
      const local = async (
        start: string,
        end: string,
        title = 'System Design',
      ) =>
        prisma.timeBlock.update({
          where: { id: b.id },
          data: {
            title,
            plannedStart: localInstant('2026-09-25', start, zone),
            plannedEnd: localInstant('2026-09-25', end, zone),
          },
        });
      const remote = (start: string, end: string, summary = 'System Design') =>
        fake.userEdit(calendarId, eventId, {
          summary,
          start: {
            dateTime: localInstant('2026-09-25', start, zone).toISOString(),
          },
          end: {
            dateTime: localInstant('2026-09-25', end, zone).toISOString(),
          },
        });
      await local('21:15', '22:30');
      remote('20:30', '21:45');
      const r = await syncCalendar(user, deps);
      expect(r).toMatchObject({ ok: true, summary: { conflicts: 1 } });
      const [conflict] = await prisma.calendarSyncConflict.findMany({
        where: { timeBlockId: b.id },
      });
      expect(conflict.status).toBe('OPEN');
      expect(Object.keys(conflict.localSnapshot as object).sort()).toEqual([
        'cancelled',
        'end',
        'start',
        'title',
      ]);
      expect(conflict.remoteSnapshot).toMatchObject({
        start: localInstant('2026-09-25', '20:30', zone).toISOString(),
      });
      expect((await reload(b.id)).calendarSyncStatus).toBe('CONFLICT');
      // A conflicted block is neither pushed nor pulled until the owner decides.
      const patches = fake.count('patchEvent');
      await syncCalendar(user, deps);
      expect(fake.count('patchEvent')).toBe(patches);
      expect((await reload(b.id)).plannedStart).toEqual(
        localInstant('2026-09-25', '21:15', zone),
      );
      await resolveConflict(user, conflict.id, 'local', deps);
      expect(
        fake.events(calendarId).find((e) => e.id === eventId)!.start?.dateTime,
      ).toBe(localInstant('2026-09-25', '21:15', zone).toISOString());
      expect(
        await prisma.calendarSyncConflict.findUniqueOrThrow({
          where: { id: conflict.id },
        }),
      ).toMatchObject({ status: 'RESOLVED_LOCAL' });
      expect((await reload(b.id)).calendarSyncStatus).toBe('SYNCED');
      await local('21:00', '22:00', 'SD local');
      remote('19:00', '20:00', 'SD remote');
      await syncCalendar(user, deps);
      const second = await prisma.calendarSyncConflict.findFirstOrThrow({
        where: { timeBlockId: b.id, status: 'OPEN' },
      });
      await resolveConflict(user, second.id, 'remote', deps);
      expect(await reload(b.id)).toMatchObject({
        title: 'SD remote',
        plannedStart: localInstant('2026-09-25', '19:00', zone),
        calendarSyncStatus: 'SYNCED',
      });
      await syncCalendar(user, deps);
      expect(
        await prisma.calendarSyncConflict.count({
          where: { timeBlockId: b.id, status: 'OPEN' },
        }),
      ).toBe(0);
    });

    it('recovers from 410 with a full resync, and from lost create responses without duplicates', async () => {
      const { fake, deps, user, calendarId } = await setup();
      const b = await block(user.id, '2026-09-25', '07:30', '09:00');
      await syncCalendar(user, deps);
      fake.expireTokens();
      const r = await syncCalendar(user, deps);
      expect(r).toMatchObject({
        ok: true,
        summary: { tokenExpired: 1, full: 1 },
      });
      expect(eventFor(fake, calendarId, b.id)).toHaveLength(1);
      // Google creates the event but the response is lost (503 after the write) during a full
      // sync, so the next run's push meets the event again via the persisted client ID (409).
      await prisma.calendarConnection.update({
        where: { userId: user.id },
        data: { syncToken: null },
      });
      const c = await block(user.id, '2026-09-26', '07:30', '09:00');
      fake.hook = (m) =>
        m === 'insertEvent' ? ((fake.hook = null), 'after') : undefined;
      await syncCalendar(user, deps);
      const failed = await reload(c.id);
      expect(failed).toMatchObject({
        calendarSyncStatus: 'ERROR',
        calendarSyncError: 'google_unavailable',
        calendarSyncAttempts: 1,
      });
      expect(failed.calendarRetryAt! > NOW).toBe(true);
      expect(eventFor(fake, calendarId, c.id)).toHaveLength(1);
      deps.at(minutes(NOW, 10));
      const retry = await syncCalendar(user, deps);
      expect(retry.summary).toMatchObject({ recoveredCreates: 1, creates: 0 });
      expect(eventFor(fake, calendarId, c.id)).toHaveLength(1);
      expect((await reload(c.id)).calendarSyncStatus).toBe('SYNCED');
      // In an incremental run the same lost response is repaired by that run's pull.
      const d = await block(user.id, '2026-09-27', '07:30', '09:00');
      fake.hook = (m) =>
        m === 'insertEvent' ? ((fake.hook = null), 'after') : undefined;
      const same = await syncCalendar(user, deps);
      expect(same.summary).toMatchObject({ adopted: 1 });
      expect(eventFor(fake, calendarId, d.id)).toHaveLength(1);
      expect((await reload(d.id)).calendarSyncStatus).toBe('SYNCED');
      // Lost local mapping: a full sync adopts the tagged event instead of creating another.
      await prisma.$executeRaw`UPDATE "TimeBlock" SET "externalCalendarEventId" = NULL, "calendarSyncedHash" = NULL WHERE id = ${b.id}`;
      await prisma.calendarConnection.update({
        where: { userId: user.id },
        data: { syncToken: null },
      });
      const full = await syncCalendar(user, deps);
      expect(full.summary).toMatchObject({ adopted: 1, creates: 0 });
      expect(eventFor(fake, calendarId, b.id)).toHaveLength(1);
    });

    it('keeps CareerOS changes when Google fails and converges later; marks revoked access', async () => {
      const { fake, deps, user, calendarId } = await setup();
      const b = await block(user.id, '2026-09-25', '07:30', '09:00');
      await syncCalendar(user, deps);
      await prisma.timeBlock.update({
        where: { id: b.id },
        data: { title: 'Renamed locally' },
      });
      fake.hook = (m) => {
        if (m === 'patchEvent') throw new GoogleApiError('transient', 503);
      };
      const r = await syncCalendar(user, deps);
      expect(r.ok).toBe(true);
      expect(await reload(b.id)).toMatchObject({
        title: 'Renamed locally',
        calendarSyncStatus: 'ERROR',
      });
      fake.hook = null;
      deps.at(minutes(NOW, 10));
      await syncCalendar(user, deps);
      expect(await reload(b.id)).toMatchObject({
        calendarSyncStatus: 'SYNCED',
        calendarSyncAttempts: 0,
      });
      expect(eventFor(fake, calendarId, b.id)[0].summary).toBe(
        'Renamed locally',
      );
      // Revoked refresh token: REAUTH_REQUIRED, CareerOS data untouched, no further syncs.
      fake.refreshRevoked = true;
      deps.at(minutes(NOW, 20));
      expect(await syncCalendar(user, deps)).toMatchObject({
        ok: false,
        code: 'reauth_required',
      });
      expect(
        await prisma.calendarConnection.findUniqueOrThrow({
          where: { userId: user.id },
        }),
      ).toMatchObject({
        status: 'REAUTH_REQUIRED',
        lastSyncError: 'reauth_required',
      });
      expect(await syncCalendar(user, deps)).toMatchObject({
        ok: false,
        code: 'not_connected',
      });
      expect((await reload(b.id)).title).toBe('Renamed locally');
      fake.refreshRevoked = false;
      await connect(user, deps);
      expect((await syncCalendar(user, deps)).ok).toBe(true);
      // A wrong or rotated encryption key fails closed.
      const rotated = {
        ...deps,
        config: {
          ...deps.config,
          encryptionKey: Buffer.alloc(32, 8).toString('base64'),
        },
      };
      expect(await syncCalendar(user, rotated)).toMatchObject({
        ok: false,
        code: 'reauth_required',
      });
    });

    it('serialises concurrent syncs with a lease and never duplicates events', async () => {
      const { fake, deps, user, calendarId } = await setup();
      const blocks = await Promise.all(
        ['07:00', '09:00', '11:00'].map((t) =>
          block(
            user.id,
            '2026-09-25',
            t,
            t.replace(/^(\d\d)/, (h) => String(Number(h) + 1).padStart(2, '0')),
          ),
        ),
      );
      const results = await Promise.all([
        syncCalendar(user, deps),
        syncCalendar(user, deps),
        syncCalendar(user, deps),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(
        results.filter((r) => !r.ok).every((r) => !r.ok && r.code === 'busy'),
      ).toBe(true);
      for (const b of blocks)
        expect(eventFor(fake, calendarId, b.id)).toHaveLength(1);
      expect(
        (
          await prisma.calendarConnection.findUniqueOrThrow({
            where: { userId: user.id },
          })
        ).syncLeaseUntil,
      ).toBeNull();
    });

    it('creates, verifies, renews and stops push channels', async () => {
      const { fake, deps, user } = await setup({
        webhookBaseUrl: 'https://careeros.example.com',
      });
      await syncCalendar(user, deps);
      const [channel] = await prisma.calendarWatchChannel.findMany({
        where: { connection: { userId: user.id } },
      });
      const watch = fake.calls.find((c) => c.method === 'watchEvents')!
        .args[1] as { id: string; address: string; token: string };
      expect(watch.address).toBe(
        'https://careeros.example.com/api/calendar/webhook',
      );
      expect(channel).toMatchObject({
        channelId: watch.id,
        tokenHash: sha256(watch.token),
      });
      expect(channel.tokenHash).not.toBe(watch.token);
      const headers = {
        channelId: watch.id,
        resourceId: channel.resourceId!,
        token: watch.token,
        state: 'exists',
      };
      expect(await verifyWebhook({ ...headers, state: 'sync' }, NOW)).toEqual({
        status: 200,
      });
      expect(await verifyWebhook(headers, NOW)).toEqual({
        status: 200,
        userId: user.id,
      });
      expect(await verifyWebhook(headers, NOW)).toEqual({
        status: 200,
        userId: user.id,
      }); // duplicate delivery
      expect(
        await verifyWebhook({ ...headers, channelId: randomUUID() }, NOW),
      ).toEqual({ status: 404 });
      expect(await verifyWebhook({ ...headers, token: 'guess' }, NOW)).toEqual({
        status: 404,
      });
      expect(
        await verifyWebhook({ ...headers, resourceId: 'other' }, NOW),
      ).toEqual({ status: 404 });
      expect(await verifyWebhook({ ...headers, state: 'weird' }, NOW)).toEqual({
        status: 400,
      });
      expect(await verifyWebhook({ ...headers, token: null }, NOW)).toEqual({
        status: 400,
      });
      expect(
        await verifyWebhook(headers, new Date(+channel.expiration + 1000)),
      ).toEqual({ status: 404 });
      // Within a day of expiry the next sync replaces the channel and stops the old one.
      deps.at(new Date(+channel.expiration - 3600000));
      await syncCalendar(user, deps);
      const channels = await prisma.calendarWatchChannel.findMany({
        where: { connection: { userId: user.id } },
        orderBy: { createdAt: 'asc' },
      });
      expect(channels).toHaveLength(2);
      expect(channels[0].stoppedAt).not.toBeNull();
      expect(fake.channels.get(channels[0].channelId)?.stopped).toBe(true);
      expect(
        await verifyWebhook(headers, new Date(+channel.expiration - 3600000)),
      ).toEqual({ status: 404 });
      await disconnectCalendar(user, { removeCalendar: false }, deps);
      expect(fake.channels.get(channels[1].channelId)?.stopped).toBe(true);
      expect(
        await prisma.calendarWatchChannel.count({
          where: { connection: { userId: user.id }, stoppedAt: null },
        }),
      ).toBe(0);
    });

    it('disconnects without losing CareerOS data; removal deletes only the CareerOS calendar', async () => {
      const { fake, deps, user, calendarId } = await setup();
      const b = await block(user.id, '2026-09-25', '07:30', '09:00');
      await syncCalendar(user, deps);
      await disconnectCalendar(user, { removeCalendar: false }, deps);
      const conn = await prisma.calendarConnection.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(conn).toMatchObject({
        status: 'DISCONNECTED',
        encryptedRefreshToken: null,
        syncToken: null,
        calendarId,
      });
      expect(fake.revoked).toContain('refresh-secret-1');
      expect(eventFor(fake, calendarId, b.id)).toHaveLength(1);
      expect(await reload(b.id)).toMatchObject({
        title: 'DSA',
        status: 'PLANNED',
      });
      expect(await syncCalendar(user, deps)).toMatchObject({
        ok: false,
        code: 'not_connected',
      });
      await connect(user, deps);
      await syncCalendar(user, deps);
      expect(eventFor(fake, calendarId, b.id)).toHaveLength(1);
      await disconnectCalendar(user, { removeCalendar: true }, deps);
      expect(
        fake.calls
          .filter((c) => c.method === 'deleteCalendar')
          .map((c) => c.args[0]),
      ).toEqual([calendarId]);
      expect(await reload(b.id)).toMatchObject({
        externalCalendarEventId: null,
        calendarSyncStatus: 'NOT_SYNCED',
        title: 'DSA',
      });
      expect(
        await prisma.calendarConnection.findUniqueOrThrow({
          where: { userId: user.id },
        }),
      ).toMatchObject({ calendarId: null });
    });

    it('syncs an interview as one linked block that moves with its round', async () => {
      const { fake, deps, user, calendarId } = await setup();
      const app = await createApplication(
        user,
        {
          requestId: randomUUID(),
          company: 'Acme',
          role: 'Engineer',
          stage: 'TECHNICAL',
        },
        NOW,
      );
      const round = await scheduleRound(
        user,
        {
          requestId: randomUUID(),
          applicationId: app.id,
          title: 'System Design',
          type: 'SYSTEM_DESIGN',
          date: '2026-09-28',
          start: '14:00',
          end: '15:00',
          timezone: zone,
        },
        NOW,
      );
      const first = await addInterviewToSchedule(user, round.id);
      expect(await addInterviewToSchedule(user, round.id)).toMatchObject({
        id: first.id,
      });
      expect(first).toMatchObject({
        category: 'INTERVIEW',
        title: 'Acme — System Design',
        plannedStart: round.scheduledStart,
      });
      await syncCalendar(user, deps);
      const [event] = eventFor(fake, calendarId, first.id);
      expect(fake.live(calendarId)).toHaveLength(1);
      fake.userEdit(calendarId, event.id, {
        start: {
          dateTime: localInstant('2026-09-28', '15:00', zone).toISOString(),
        },
        end: {
          dateTime: localInstant('2026-09-28', '16:00', zone).toISOString(),
        },
      });
      await syncCalendar(user, deps);
      expect(
        await prisma.interviewRound.findUniqueOrThrow({
          where: { id: round.id },
        }),
      ).toMatchObject({
        scheduledStart: localInstant('2026-09-28', '15:00', zone),
      });
      expect(
        await prisma.jobActivity.findFirst({
          where: { interviewRoundId: round.id, type: 'INTERVIEW_RESCHEDULED' },
        }),
      ).toMatchObject({ note: 'System Design — moved in Google Calendar' });
      await rescheduleRound(
        user,
        {
          requestId: randomUUID(),
          id: round.id,
          date: '2026-09-29',
          start: '10:00',
          end: '11:00',
          timezone: zone,
        },
        NOW,
      );
      const moved = await reload(first.id);
      expect(moved.plannedStart).toEqual(
        localInstant('2026-09-29', '10:00', zone),
      );
      expect(moved.dailyPlan.date).toEqual(new Date('2026-09-29'));
      await syncCalendar(user, deps);
      expect(eventFor(fake, calendarId, first.id)[0].start?.dateTime).toBe(
        localInstant('2026-09-29', '10:00', zone).toISOString(),
      );
    });

    it('writes sync metadata without bumping TimeBlock.updatedAt', async () => {
      const { deps, user } = await setup();
      const b = await block(user.id, '2026-09-25', '07:30', '09:00');
      await syncCalendar(user, deps);
      const after = await reload(b.id);
      expect(after.calendarSyncStatus).toBe('SYNCED');
      expect(+after.updatedAt).toBe(+b.updatedAt);
    });
  },
);
