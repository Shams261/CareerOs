import { afterAll, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter, utcConnectionString } from '../src/lib/database';
import {
  auditTimestamps,
  Refusal,
  REPAIR_ID,
  repairTimestamps,
} from '../scripts/lib/timestamp-integrity';
import { interviewTime } from '../src/features/jobs/domain';
import { clock } from '../src/lib/time';
vi.mock('server-only', () => ({}));

const url = process.env.TEST_DATABASE_URL;
const JAN = new Date('2026-01-15T14:00:00Z'); // Toronto EST (UTC-5)
const JUL = new Date('2026-07-15T14:00:00Z'); // Toronto EDT (UTC-4)
const FALL_BACK = new Date('2026-11-01T01:30:00Z'); // wall clock in Toronto's repeated hour
const SPRING_GAP = new Date('2026-03-08T02:30:00Z'); // wall clock in Toronto's skipped hour
const minutes = (n: number, d: Date) => new Date(+d + n * 60000);

describe('utcConnectionString', () => {
  it('pins UTC and preserves existing startup options', () => {
    expect(
      new URL(
        utcConnectionString('postgresql://u:p@h:5432/db'),
      ).searchParams.get('options'),
    ).toBe('-c TimeZone=UTC');
    const merged = new URL(
      utcConnectionString(
        'postgresql://u:p@h/db?sslmode=require&options=-c%20search_path%3Dapp',
      ),
    );
    expect(merged.searchParams.get('options')).toBe(
      '-c search_path=app -c TimeZone=UTC',
    );
    expect(merged.searchParams.get('sslmode')).toBe('require');
  });
});

describe.skipIf(!url)('database time integrity (ADR-009)', () => {
  const created: string[] = [];
  const clients: { $disconnect(): Promise<void> }[] = [];
  const admin = () => new Client({ connectionString: url });
  async function tempDatabase(zone: string, migrate = true) {
    const name = `careeros_tz_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const c = admin();
    await c.connect();
    await c.query(`CREATE DATABASE ${name}`);
    await c.query(`ALTER DATABASE ${name} SET TimeZone = '${zone}'`);
    await c.end();
    created.push(name);
    const u = new URL(url!);
    u.pathname = `/${name}`;
    const dbUrl = u.toString();
    if (migrate) {
      const m = new Client({ connectionString: dbUrl });
      await m.connect();
      for (const dir of (await readdir('prisma/migrations')).sort())
        if (!dir.endsWith('.toml'))
          await m.query(
            await readFile(`prisma/migrations/${dir}/migration.sql`, 'utf8'),
          );
      await m.end();
    }
    return dbUrl;
  }
  const prisma = (connection: string, pinned = true) => {
    const p = new PrismaClient({
      adapter: pinned
        ? createPgAdapter(connection)
        : new PrismaPg({ connectionString: connection }),
    });
    clients.push(p);
    return p;
  };
  async function raw<T>(connection: string, sql: string) {
    const c = new Client({ connectionString: connection });
    await c.connect();
    try {
      return (await c.query(sql)).rows as T[];
    } finally {
      await c.end();
    }
  }
  const epoch = async (connection: string, sql: string) =>
    (await raw<{ e: number }>(connection, sql)).map(
      (r) => new Date(Number(r.e) * 1000),
    );
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.$disconnect()));
    const c = admin();
    await c.connect();
    for (const name of created)
      await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await c.end();
  });

  it.each(['UTC', 'America/Toronto', 'Asia/Tokyo'])(
    'stores the same real instant when the server default is %s',
    async (zone) => {
      const db = await tempDatabase(zone, false);
      await raw(db, 'CREATE TABLE probe (id int, ts timestamptz)');
      const app = prisma(db);
      const [tz] = await app.$queryRaw<{ TimeZone: string }[]>`SHOW TimeZone`;
      expect(tz.TimeZone).toBe('UTC');
      await app.$executeRaw`INSERT INTO probe VALUES (1, ${JAN}), (2, ${JUL})`;
      // Independent unpinned reader, in the server's own zone, sees exact instants.
      expect(
        await epoch(
          db,
          'SELECT extract(epoch FROM ts) AS e FROM probe ORDER BY id',
        ),
      ).toEqual([JAN, JUL]);
      const back = await app.$queryRaw<
        { ts: Date }[]
      >`SELECT ts FROM probe ORDER BY id`;
      expect(back.map((r) => r.ts)).toEqual([JAN, JUL]);
      if (zone !== 'UTC') {
        // Root cause: the unpinned adapter stores the UTC wall clock as local time.
        const legacy = prisma(db, false);
        await legacy.$executeRaw`INSERT INTO probe VALUES (3, ${JAN}), (4, ${JUL})`;
        const [jan, jul] = await epoch(
          db,
          'SELECT extract(epoch FROM ts) AS e FROM probe WHERE id > 2 ORDER BY id',
        );
        expect(+jan - +JAN).not.toBe(0);
        expect(+jul - +JUL).not.toBe(0);
      }
    },
  );

  it('audits, dry-runs, repairs DST-correctly, re-reads exactly and refuses a second repair', async () => {
    const db = await tempDatabase('America/Toronto');
    // 1. Old application behaviour: unpinned adapter, Toronto server session.
    const legacy = prisma(db, false);
    const user = await legacy.user.create({
      data: {
        email: `tz-${randomUUID()}@example.com`,
        name: 'Legacy',
        timezone: 'America/Toronto',
      },
    });
    const plan = await legacy.dailyPlan.create({
      data: { userId: user.id, date: new Date('2026-01-15') },
    });
    const block = await legacy.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title: 'DSA',
        category: 'DSA',
        plannedStart: JAN,
        plannedEnd: minutes(90, JAN),
        occurrenceDate: new Date('2026-01-15'),
      },
    });
    const sessions = await Promise.all(
      [JAN, JUL, FALL_BACK, SPRING_GAP].map((start) =>
        legacy.actualSession.create({
          data: {
            userId: user.id,
            category: 'DSA',
            startedAt: start,
            endedAt: minutes(90, start),
          },
        }),
      ),
    );
    const app = await legacy.jobApplication.create({
      data: {
        userId: user.id,
        company: 'Fixture Co',
        role: 'Engineer',
        stage: 'TECHNICAL',
        appliedAt: new Date('2026-07-10'),
        nextActionDate: new Date('2026-07-20'),
      },
    });
    const round = await legacy.interviewRound.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        title: 'System Design',
        type: 'SYSTEM_DESIGN',
        scheduledStart: JUL,
        scheduledEnd: minutes(60, JUL),
        timezone: 'America/Toronto',
      },
    });
    await legacy.jobActivity.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        type: 'INTERVIEW_SCHEDULED',
        occurredAt: JAN,
        newStart: JUL,
        interviewRoundId: round.id,
      },
    });
    // The legacy app reads its own values back "correctly"...
    expect(
      (
        await legacy.actualSession.findUniqueOrThrow({
          where: { id: sessions[0].id },
        })
      ).startedAt,
    ).toEqual(JAN);
    // ...but the stored instants are shifted by the DST-dependent Toronto offset.
    const sessionSql = (id: string) =>
      `SELECT extract(epoch FROM "startedAt") AS e FROM "ActualSession" WHERE id='${id}'`;
    expect(await epoch(db, sessionSql(sessions[0].id))).toEqual([
      new Date('2026-01-15T19:00:00Z'),
    ]);
    expect(await epoch(db, sessionSql(sessions[1].id))).toEqual([
      new Date('2026-07-15T18:00:00Z'),
    ]);
    // A UTC-pinned reader sees the shift: data must be repaired before the new app writes anything.
    const pinned = prisma(db);
    expect(
      (
        await pinned.actualSession.findUniqueOrThrow({
          where: { id: sessions[0].id },
        })
      ).startedAt,
    ).toEqual(new Date('2026-01-15T19:00:00Z'));

    const snapshot = () =>
      raw<Record<string, unknown>>(
        db,
        `SELECT s.id, extract(epoch FROM s."startedAt") AS s, extract(epoch FROM s."endedAt") AS e,
           extract(epoch FROM s."createdAt") AS c FROM "ActualSession" s ORDER BY id`,
      );
    const dates = () =>
      raw(
        db,
        `SELECT "appliedAt"::text, "nextActionDate"::text, (SELECT date::text FROM "DailyPlan" LIMIT 1) AS plan,
           (SELECT "occurrenceDate"::text FROM "TimeBlock" LIMIT 1) AS occ FROM "JobApplication"`,
      );
    const beforeDates = await dates();
    const beforeSnapshot = await snapshot();

    // 2. Audit: read-only, IDs/timestamps only.
    const audit = await auditTimestamps(db);
    expect(audit).toMatchObject({
      serverTimeZone: 'America/Toronto',
      appSessionTimeZone: 'UTC',
      legacyZone: 'America/Toronto',
      ledger: null,
    });
    expect(audit.affected).toBeGreaterThan(20);
    expect(audit.ambiguous).toBeGreaterThanOrEqual(1);
    for (const s of audit.samples)
      expect(Object.keys(s).sort()).toEqual([
        'column',
        'id',
        'ifRepaired',
        'stored',
        'table',
      ]);
    expect(audit.dateColumns.map((t) => t.table)).toContain('JobApplication');
    expect(await snapshot()).toEqual(beforeSnapshot);

    // 3. Dry run changes nothing and writes no ledger.
    const dry = await repairTimestamps(db, {
      legacyZone: 'America/Toronto',
      apply: false,
    });
    expect(dry.applied).toBe(false);
    expect(dry.updatedRows.ActualSession).toBe(4);
    expect(await snapshot()).toEqual(beforeSnapshot);
    expect(await raw(db, `SELECT 1 FROM "MaintenanceRecord"`)).toHaveLength(0);

    // 4. Guards.
    await expect(
      repairTimestamps(db, { legacyZone: 'America/Toronto', apply: true }),
    ).rejects.toThrow(Refusal);
    await expect(
      repairTimestamps(db, { legacyZone: 'Asia/Tokyo', apply: false }),
    ).rejects.toThrow('force-zone');

    // 5. Apply.
    const name = new URL(db).pathname.slice(1);
    const applied = await repairTimestamps(db, {
      legacyZone: 'America/Toronto',
      apply: true,
      confirm: name,
    });
    expect(applied.applied).toBe(true);
    expect(applied.integrity).toEqual({
      'ActualSession.endedAt < startedAt': 0,
      'TimeBlock.plannedEnd < plannedStart': 0,
      'InterviewRound.scheduledEnd < scheduledStart': 0,
    });
    const starts = await epoch(
      db,
      `SELECT extract(epoch FROM "startedAt") AS e FROM "ActualSession" ORDER BY "startedAt"`,
    );
    // January (EST) and July (EDT) recovered exactly; fall-back hour exact.
    expect(starts).toContainEqual(JAN);
    expect(starts).toContainEqual(JUL);
    expect(starts).toContainEqual(FALL_BACK);
    // Spring-forward gap: recovered one hour late and counted as ambiguous.
    expect(starts).toContainEqual(minutes(60, SPRING_GAP));
    expect(applied.ambiguousRows).toBeGreaterThanOrEqual(1);
    const durations = await raw<{ m: string }>(
      db,
      `SELECT extract(epoch FROM "endedAt" - "startedAt")/60 AS m FROM "ActualSession" WHERE "startedAt" <> '${minutes(60, SPRING_GAP).toISOString()}'`,
    );
    expect(durations.map((d) => Number(d.m))).toEqual([90, 90, 90]);
    expect(await dates()).toEqual(beforeDates);

    // 6. The UTC-pinned application reads exact instants and renders owner-local times.
    const r = await pinned.interviewRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect([r.scheduledStart, r.scheduledEnd]).toEqual([JUL, minutes(60, JUL)]);
    expect(interviewTime(r, 'America/Toronto')).toBe(
      'Wed, Jul 15 · 10:00 AM–11:00 AM',
    );
    const b = await pinned.timeBlock.findUniqueOrThrow({
      where: { id: block.id },
    });
    expect(clock(b.plannedStart, 'America/Toronto')).toBe('9:00 AM');
    const activity = await pinned.jobActivity.findFirstOrThrow({
      where: { applicationId: app.id },
    });
    expect([activity.occurredAt, activity.newStart]).toEqual([JAN, JUL]);

    // 7. Startup check: session UTC, server non-UTC, repair recorded → no warning.
    Object.assign(process.env, {
      DATABASE_URL: db,
      OWNER_EMAIL: 'owner@example.com',
      APP_PASSWORD: 'x'.repeat(16),
      CRON_SECRET: 'y'.repeat(32),
    });
    const {
      db: appDb,
      sessionTimeZone,
      verifyDatabaseTime,
    } = await import('../src/server/db');
    clients.push(appDb());
    expect(await sessionTimeZone()).toBe('UTC');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await verifyDatabaseTime();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();

    // 8. Second repair is refused; the data is untouched.
    const afterFirst = await snapshot();
    await expect(
      repairTimestamps(db, {
        legacyZone: 'America/Toronto',
        apply: true,
        confirm: name,
      }),
    ).rejects.toThrow('already ran');
    expect(await snapshot()).toEqual(afterFirst);
    expect(
      await raw(
        db,
        `SELECT id FROM "MaintenanceRecord" WHERE id = '${REPAIR_ID}'`,
      ),
    ).toHaveLength(1);
  });

  it('never repairs a UTC database by accident', async () => {
    const db = await tempDatabase('UTC');
    const app = prisma(db);
    const user = await app.user.create({
      data: { email: `utc-${randomUUID()}@example.com`, name: 'Fresh' },
    });
    await app.actualSession.create({
      data: {
        userId: user.id,
        category: 'DSA',
        startedAt: JAN,
        endedAt: minutes(30, JAN),
      },
    });
    const audit = await auditTimestamps(db);
    expect(audit.legacyZone).toBeNull();
    expect(audit.notes.join(' ')).toMatch(/server default is UTC/);
    await expect(
      repairTimestamps(db, { legacyZone: 'America/Toronto', apply: false }),
    ).rejects.toThrow('force-zone');
    await expect(
      repairTimestamps(db, {
        legacyZone: 'UTC',
        apply: false,
        forceZone: true,
      }),
    ).rejects.toThrow('nothing to repair');
    expect(
      await epoch(
        db,
        `SELECT extract(epoch FROM "startedAt") AS e FROM "ActualSession"`,
      ),
    ).toEqual([JAN]);
  });

  it('rolls back a repair that would break start/end ordering', async () => {
    const db = await tempDatabase('America/Toronto');
    const app = prisma(db, false);
    const user = await app.user.create({
      data: { email: `order-${randomUUID()}@example.com`, name: 'Order' },
    });
    // A row written by SQL itself (not shifted) spanning the fall-back hour: repair would invert it.
    await raw(
      db,
      `INSERT INTO "ActualSession" (id, "userId", category, "startedAt", "endedAt")
       VALUES ('sql-written', '${user.id}', 'DSA', '2026-11-01T05:45:00Z', '2026-11-01T06:15:00Z')`,
    );
    const before = await raw(
      db,
      `SELECT "startedAt", "endedAt" FROM "ActualSession"`,
    );
    const name = new URL(db).pathname.slice(1);
    const run = () =>
      repairTimestamps(db, {
        legacyZone: 'America/Toronto',
        apply: true,
        confirm: name,
      });
    const unchanged = async () => {
      expect(
        await raw(db, `SELECT "startedAt", "endedAt" FROM "ActualSession"`),
      ).toEqual(before);
      expect(await raw(db, `SELECT 1 FROM "MaintenanceRecord"`)).toHaveLength(
        0,
      );
    };
    // Layer 1: the database's own CHECK (session_order) aborts the transaction.
    await expect(run()).rejects.toThrow('session_order');
    await unchanged();
    // Layer 2: without that constraint, the tool's integrity comparison refuses.
    await raw(db, `ALTER TABLE "ActualSession" DROP CONSTRAINT session_order`);
    await expect(run()).rejects.toThrow('Integrity check failed');
    await unchanged();
  });

  it('has no RoutineBlock.weekdays default; writers must supply 1–7 weekdays', async () => {
    const rows = await raw<{ column_default: string | null }>(
      url!,
      `SELECT column_default FROM information_schema.columns WHERE table_name='RoutineBlock' AND column_name='weekdays'`,
    );
    expect(rows).toEqual([{ column_default: null }]);
  });
});
