import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { E2E_DATABASE_URL } from '../e2e/env';

/**
 * pnpm test:e2e prepares its own database (WI-052): drops and recreates the one named by
 * E2E_DATABASE_URL, then applies every migration. It refuses any database whose name does
 * not end in `_e2e`, so it can never touch a personal or production database.
 */
const url = new URL(E2E_DATABASE_URL);
const name = decodeURIComponent(url.pathname.slice(1));
if (!/^[a-z0-9_]+_e2e$/.test(name))
  throw new Error(
    `Refusing: the e2e database name must end in _e2e (got ${name}).`,
  );
const admin = new URL(url);
admin.pathname = '/postgres';

async function main() {
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${name}"`);
  await client.end();
  const migrate = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'inherit',
  });
  if (migrate.status !== 0) process.exit(migrate.status ?? 1);
  console.log(`e2e database ${name} ready.`);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
