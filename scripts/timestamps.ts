import 'dotenv/config';
import {
  auditTimestamps,
  Refusal,
  repairTimestamps,
} from './lib/timestamp-integrity';
import { describeDatabase } from '../src/lib/database';

/**
 * pnpm timestamps:audit                         read-only report
 * pnpm timestamps:repair [--dry-run]            full rehearsal, rolled back (default)
 * pnpm timestamps:repair --apply --confirm=<db> commit repair + ledger record
 *   --legacy-zone=America/Toronto  (or LEGACY_TIMESTAMP_TIMEZONE)
 *   --force-zone    legacy zone differs from the server's current default
 *   --allow-repeat  developer override of the double-repair guard
 */
const [command, ...args] = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const url = process.env.DATABASE_URL;

async function main() {
  if (!url) throw new Refusal('DATABASE_URL is required.');
  const legacyZone =
    value('legacy-zone') ?? process.env.LEGACY_TIMESTAMP_TIMEZONE;
  console.log(`Target database: ${describeDatabase(url)}`);
  if (command === 'audit') {
    const r = await auditTimestamps(url, legacyZone || null);
    console.log(`\nDATABASE SESSION
  Server default TimeZone:      ${r.serverTimeZone}${r.serverTimeZone === 'UTC' ? ' (UTC)' : ' (non-UTC)'}
  Application session TimeZone: ${r.appSessionTimeZone}
  Legacy zone assumed:          ${r.legacyZone ?? 'none'}
  Repair ledger:                ${r.ledger ? `applied ${r.ledger.performedAt.toISOString()}` : 'no repair recorded'}

POTENTIALLY AFFECTED DATA (non-null timestamptz values)`);
    const tables = [...new Set(r.counts.map((c) => c.table))];
    for (const t of tables) {
      const cols = r.counts.filter((c) => c.table === t);
      console.log(
        `  ${t}: ${cols.reduce((n, c) => n + c.nonNull, 0)}  (${cols.map((c) => `${c.column} ${c.nonNull}`).join(', ')})`,
      );
    }
    console.log(`  Total: ${r.affected}`);
    if (r.legacyZone)
      console.log(`  DST-ambiguous (±1h, spring-forward gap): ${r.ambiguous}`);
    console.log('\nREPRESENTATIVE VALUES (IDs and instants only)');
    for (const s of r.samples)
      console.log(
        `  ${s.table}.${s.column} ${s.id}: stored ${s.stored}${s.ifRepaired ? ` → if repaired ${s.ifRepaired}` : ''}`,
      );
    console.log(
      `\nUNAFFECTED DATE COLUMNS (calendar labels, never repaired)\n  ${r.dateColumns
        .map((t) => t.columns.map((c) => `${t.table}.${c}`).join(', '))
        .join(', ')}`,
    );
    console.log(`\nASSESSMENT\n${r.notes.map((n) => `  - ${n}`).join('\n')}`);
    console.log('\nNo changes were made.');
    return;
  }
  if (command === 'repair') {
    if (flag('apply') && flag('dry-run'))
      throw new Refusal('Choose either --dry-run or --apply.');
    if (!legacyZone)
      throw new Refusal(
        'Set LEGACY_TIMESTAMP_TIMEZONE or --legacy-zone to the zone the database ran in before WI-005.1.',
      );
    const apply = flag('apply');
    console.log(
      apply
        ? 'APPLY: this rewrites timestamptz values. Confirm you have a verified backup (pg_dump); a git tag is not a database backup.'
        : 'DRY RUN (default): the repair runs inside a transaction and is rolled back.',
    );
    const r = await repairTimestamps(url, {
      legacyZone,
      apply,
      confirm: value('confirm'),
      forceZone: flag('force-zone'),
      allowRepeat: flag('allow-repeat'),
    });
    console.log(
      `\nLegacy zone: ${r.legacyZone} (server default ${r.serverTimeZone})`,
    );
    console.log('Rows updated per table:');
    for (const [t, n] of Object.entries(r.updatedRows))
      console.log(`  ${t}: ${n}`);
    console.log(
      `Non-null values before/after: ${r.columnCounts.reduce((n, c) => n + c.nonNull, 0)} (unchanged)`,
    );
    console.log(
      `DST-ambiguous rows (kept at the non-gap reading): ${r.ambiguousRows}`,
    );
    console.log(`Integrity after repair: ${JSON.stringify(r.integrity)}`);
    console.log(
      r.applied
        ? '\nCommitted. Ledger record written; a second run will be refused.'
        : '\nRolled back. Nothing was changed. Re-run with --apply --confirm=<database> to commit.',
    );
    return;
  }
  throw new Refusal('Usage: timestamps.ts audit|repair [options]');
}
main().catch((error) => {
  console.error(error instanceof Refusal ? `Refused: ${error.message}` : error);
  process.exit(1);
});
