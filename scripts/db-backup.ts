import 'dotenv/config';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describeDatabase } from '../src/lib/database';
import { pgEnv, run } from './lib/pg-tools';

/**
 * pnpm db:backup — custom-format pg_dump of DATABASE_URL into BACKUP_DIR (default ./backups,
 * git-ignored), readable only by the current user. Backups contain personal data: store them
 * encrypted and off the application host. A dump is not proven until `pnpm db:restore:verify`.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required.');
const dir = process.env.BACKUP_DIR ?? 'backups';
mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = join(
  dir,
  `careeros-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`,
);
console.log(`Backing up ${describeDatabase(url)} → ${file}`);
run(
  'pg_dump',
  ['--format=custom', '--no-owner', '--no-acl', '--file', file],
  pgEnv(url),
);
chmodSync(file, 0o600);
const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
console.log(
  `Done: ${(statSync(file).size / 1024).toFixed(1)} KiB, sha256 ${sha}`,
);
console.log('Next: pnpm db:restore:verify ' + file);
