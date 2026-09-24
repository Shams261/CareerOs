import { Client } from 'pg';
import { describeDatabase, utcConnectionString } from '../../src/lib/database';

/**
 * Legacy timestamp audit/repair (ADR-009).
 *
 * Before WI-005.1, @prisma/adapter-pg sent each instant as its UTC wall clock W without an offset,
 * and PostgreSQL read W in the session TimeZone L. The stored instant S is therefore
 * "W as a local time in L". Recovering the intended instant T (= W as UTC) is exact per row and
 * DST-aware:  T = (S AT TIME ZONE L) AT TIME ZONE 'UTC'.
 *
 * Exception: if W fell in L's spring-forward gap, PostgreSQL moved it forward one hour, so a
 * recovered local hour just after the gap is ambiguous by one hour. Such rows are counted, not
 * guessed.
 */
export const REPAIR_ID = 'timestamp-repair:legacy-session-zone:v1';
const EXCLUDED_TABLES = ['_prisma_migrations', 'MaintenanceRecord'];
const UTC_ALIASES = new Set([
  'UTC',
  'ETC/UTC',
  'GMT',
  'ETC/GMT',
  'UCT',
  'ETC/UCT',
  'ZULU',
  'ETC/ZULU',
  'UNIVERSAL',
  'ETC/UNIVERSAL',
  'GMT0',
  'ETC/GMT0',
]);
/** Start/end pairs whose ordering must survive a repair. */
export const INTEGRITY_PAIRS = [
  { table: 'ActualSession', start: 'startedAt', end: 'endedAt' },
  { table: 'TimeBlock', start: 'plannedStart', end: 'plannedEnd' },
  { table: 'InterviewRound', start: 'scheduledStart', end: 'scheduledEnd' },
] as const;

export class Refusal extends Error {}
const ident = (id: string) => `"${id.replaceAll('"', '""')}"`;
const corrected = (col: string) =>
  `((${ident(col)} AT TIME ZONE $1) AT TIME ZONE 'UTC')`;
const ambiguous = (col: string) => {
  const local = `(${ident(col)} AT TIME ZONE $1)`;
  return `(((${local} - interval '1 hour') AT TIME ZONE $1) AT TIME ZONE $1) <> (${local} - interval '1 hour')`;
};

async function connect(url: string, pinned: boolean) {
  const client = new Client({
    connectionString: pinned ? utcConnectionString(url) : url,
  });
  await client.connect();
  return client;
}
async function showTimeZone(client: Client) {
  return (await client.query<{ TimeZone: string }>('SHOW TimeZone')).rows[0]
    .TimeZone;
}

export type TableColumns = { table: string; columns: string[] };
async function columnsOfType(client: Client, type: string) {
  const rows = (
    await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND data_type = $1 AND NOT (table_name = ANY($2))
       ORDER BY table_name, ordinal_position`,
      [type, EXCLUDED_TABLES],
    )
  ).rows;
  const byTable = new Map<string, string[]>();
  for (const r of rows)
    byTable.set(r.table_name, [
      ...(byTable.get(r.table_name) ?? []),
      r.column_name,
    ]);
  return [...byTable].map(([table, columns]) => ({ table, columns }));
}
export const instantColumns = (c: Client) =>
  columnsOfType(c, 'timestamp with time zone');
export const dateColumns = (c: Client) => columnsOfType(c, 'date');

async function ledgerTableExists(client: Client) {
  return (
    await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'MaintenanceRecord'`,
    )
  ).rowCount!;
}
async function ledgerRecord(client: Client) {
  if (!(await ledgerTableExists(client))) return null;
  return (
    (
      await client.query<{ performedAt: Date; details: unknown }>(
        `SELECT "performedAt", details FROM "MaintenanceRecord" WHERE id = $1`,
        [REPAIR_ID],
      )
    ).rows[0] ?? null
  );
}
async function validateZone(client: Client, zone: string) {
  if (UTC_ALIASES.has(zone.toUpperCase()))
    throw new Refusal(
      'A UTC legacy zone means stored instants were already correct; nothing to repair.',
    );
  const known = await client.query(
    'SELECT 1 FROM pg_timezone_names WHERE name = $1',
    [zone],
  );
  if (!known.rowCount) throw new Refusal(`Unknown IANA time zone: ${zone}`);
}

async function columnCounts(
  client: Client,
  tables: TableColumns[],
  zone: string | null,
) {
  const out: {
    table: string;
    column: string;
    nonNull: number;
    ambiguous: number | null;
  }[] = [];
  for (const { table, columns } of tables)
    for (const column of columns) {
      const row = (
        await client.query<{ n: string; a: string | null }>(
          `SELECT count(${ident(column)}) AS n, ${
            zone ? `count(*) FILTER (WHERE ${ambiguous(column)})` : 'NULL'
          } AS a FROM ${ident(table)}`,
          zone ? [zone] : [],
        )
      ).rows[0];
      out.push({
        table,
        column,
        nonNull: Number(row.n),
        ambiguous: row.a === null ? null : Number(row.a),
      });
    }
  return out;
}
async function integrityViolations(client: Client, tables: TableColumns[]) {
  const result: Record<string, number> = {};
  for (const p of INTEGRITY_PAIRS) {
    const t = tables.find((x) => x.table === p.table);
    if (!t || !t.columns.includes(p.start) || !t.columns.includes(p.end))
      continue;
    result[`${p.table}.${p.end} < ${p.start}`] = Number(
      (
        await client.query<{ n: string }>(
          `SELECT count(*) AS n FROM ${ident(p.table)} WHERE ${ident(p.end)} < ${ident(p.start)}`,
        )
      ).rows[0].n,
    );
  }
  return result;
}

export type AuditReport = Awaited<ReturnType<typeof auditTimestamps>>;
/** Read-only. Reports session zones, ledger state, affected-column counts and ID/timestamp samples. */
export async function auditTimestamps(url: string, legacyZone?: string | null) {
  const raw = await connect(url, false);
  const app = await connect(url, true);
  try {
    const serverTimeZone = await showTimeZone(raw);
    const appSessionTimeZone = await showTimeZone(app);
    const zone =
      legacyZone ??
      (UTC_ALIASES.has(serverTimeZone.toUpperCase()) ? null : serverTimeZone);
    if (zone) await validateZone(app, zone);
    const tables = await instantColumns(app);
    const counts = await columnCounts(app, tables, zone);
    const samples: {
      table: string;
      id: string;
      column: string;
      stored: string;
      ifRepaired: string | null;
    }[] = [];
    for (const { table, columns } of tables) {
      const column = columns.find(
        (c) => counts.find((x) => x.table === table && x.column === c)!.nonNull,
      );
      if (!column) continue;
      const rows = (
        await app.query<{ id: string; stored: Date; fixed: Date | null }>(
          `SELECT id::text AS id, ${ident(column)} AS stored, ${
            zone ? corrected(column) : 'NULL'
          } AS fixed FROM ${ident(table)} WHERE ${ident(column)} IS NOT NULL ORDER BY ${ident(column)} DESC LIMIT 2`,
          zone ? [zone] : [],
        )
      ).rows;
      for (const r of rows)
        samples.push({
          table,
          id: r.id,
          column,
          stored: r.stored.toISOString(),
          ifRepaired: r.fixed?.toISOString() ?? null,
        });
    }
    // Recently written createdAt values stored in the future are direct evidence of a shift.
    let futureCreated = 0;
    for (const { table, columns } of tables)
      if (columns.includes('createdAt'))
        futureCreated += Number(
          (
            await app.query<{ n: string }>(
              `SELECT count(*) AS n FROM ${ident(table)} WHERE "createdAt" > now() + interval '1 minute'`,
            )
          ).rows[0].n,
        );
    const ledger = await ledgerRecord(app);
    const affected = counts.reduce((n, c) => n + c.nonNull, 0);
    const notes: string[] = [];
    if (appSessionTimeZone !== 'UTC')
      notes.push(
        'ERROR: the application session is not UTC. Fix the connection before doing anything else.',
      );
    if (ledger)
      notes.push(
        `Repair ${REPAIR_ID} was already applied at ${ledger.performedAt.toISOString()}. Do not repair again.`,
      );
    else if (!zone)
      notes.push(
        'The server default is UTC, so values written by earlier CareerOS versions through this server are correct. Repair only if this database previously ran with another TimeZone (for example, restored from a local non-UTC server).',
      );
    else {
      if (futureCreated)
        notes.push(
          `Evidence: ${futureCreated} createdAt value(s) lie in the future, which is how a shift appears for recent writes.`,
        );
      notes.push(
        `Earlier CareerOS versions wrote instants in ${zone} sessions, so app-written timestamptz values are likely shifted by that zone's offset (DST-dependent).`,
        'A value alone cannot prove a row was affected: rows written by SQL itself (migration backfills, manual SQL) were not shifted and would be moved by a repair.',
        'Stop the app and take a database backup before repairing. A git tag is not a backup.',
      );
    }
    return {
      target: describeDatabase(url),
      serverTimeZone,
      appSessionTimeZone,
      legacyZone: zone,
      ledger,
      counts,
      affected,
      futureCreated,
      ambiguous: counts.reduce((n, c) => n + (c.ambiguous ?? 0), 0),
      samples,
      dateColumns: await dateColumns(app),
      notes,
    };
  } finally {
    await raw.end();
    await app.end();
  }
}

export type RepairOptions = {
  legacyZone: string;
  apply: boolean;
  /** Must equal current_database() when applying. */
  confirm?: string;
  /** Allow a legacy zone different from the server's current default. */
  forceZone?: boolean;
  /** Developer override: run even though the ledger records a completed repair. */
  allowRepeat?: boolean;
};
/**
 * Dry-run by default: performs the full repair inside a transaction, verifies integrity, then rolls
 * back. With apply + confirm it commits and writes the ledger record in the same transaction.
 */
export async function repairTimestamps(url: string, opts: RepairOptions) {
  const raw = await connect(url, false);
  const serverTimeZone = await showTimeZone(raw);
  await raw.end();
  const client = await connect(url, true);
  try {
    if ((await showTimeZone(client)) !== 'UTC')
      throw new Refusal('Application session is not UTC; refusing to repair.');
    await validateZone(client, opts.legacyZone);
    if (serverTimeZone !== opts.legacyZone && !opts.forceZone)
      throw new Refusal(
        `The server default TimeZone is ${serverTimeZone}, not ${opts.legacyZone}. Pass --force-zone only if this database previously ran with ${opts.legacyZone}.`,
      );
    const database = (
      await client.query<{ db: string }>('SELECT current_database() AS db')
    ).rows[0].db;
    if (opts.apply && opts.confirm !== database)
      throw new Refusal(
        `Applying requires --confirm=${database} (the current database name).`,
      );
    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        REPAIR_ID,
      ]);
      const prior = await ledgerRecord(client);
      if (prior && !opts.allowRepeat)
        throw new Refusal(
          `Repair ${REPAIR_ID} already ran at ${prior.performedAt.toISOString()}. Running it again would shift correct instants.`,
        );
      const tables = await instantColumns(client);
      if (!tables.length)
        throw new Refusal('No timestamptz columns found; wrong database?');
      const before = await columnCounts(client, tables, opts.legacyZone);
      const violationsBefore = await integrityViolations(client, tables);
      const updated: Record<string, number> = {};
      for (const { table, columns } of tables) {
        // One statement per table so CHECK constraints spanning columns see consistent values.
        const result = await client.query(
          `UPDATE ${ident(table)} SET ${columns
            .map((c) => `${ident(c)} = ${corrected(c)}`)
            .join(
              ', ',
            )} WHERE ${columns.map((c) => `${ident(c)} IS NOT NULL`).join(' OR ')}`,
          [opts.legacyZone],
        );
        updated[table] = result.rowCount ?? 0;
      }
      const after = await columnCounts(client, tables, null);
      const violationsAfter = await integrityViolations(client, tables);
      for (const [pair, n] of Object.entries(violationsAfter))
        if (n > (violationsBefore[pair] ?? 0))
          throw new Refusal(
            `Integrity check failed: ${pair} would rise from ${violationsBefore[pair] ?? 0} to ${n}. Nothing was changed.`,
          );
      for (const b of before) {
        const a = after.find(
          (x) => x.table === b.table && x.column === b.column,
        )!;
        if (a.nonNull !== b.nonNull)
          throw new Refusal(
            `Row count changed for ${b.table}.${b.column}; nothing was changed.`,
          );
      }
      const summary = {
        database,
        legacyZone: opts.legacyZone,
        serverTimeZone,
        updatedRows: updated,
        columnCounts: before.map(({ table, column, nonNull }) => ({
          table,
          column,
          nonNull,
        })),
        ambiguousRows: before.reduce((n, c) => n + (c.ambiguous ?? 0), 0),
        integrity: violationsAfter,
      };
      if (opts.apply) {
        // Same DDL as migration 20260925090100 so the repair can run before pending migrations.
        await client.query(`CREATE TABLE IF NOT EXISTS "MaintenanceRecord" (
          "id" TEXT NOT NULL, "performedAt" TIMESTAMPTZ(3) NOT NULL, "details" JSONB NOT NULL,
          CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id"))`);
        await client.query(
          `INSERT INTO "MaintenanceRecord" (id, "performedAt", details) VALUES ($1, now(), $2)
           ON CONFLICT (id) DO UPDATE SET "performedAt" = now(), details = EXCLUDED.details`,
          [REPAIR_ID, JSON.stringify(summary)],
        );
        await client.query('COMMIT');
      } else await client.query('ROLLBACK');
      return { applied: opts.apply, ...summary };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  } finally {
    await client.end();
  }
}
