import { spawnSync } from 'node:child_process';

const connection = process.env.TEST_DATABASE_URL;
if (!connection || !/^postgres(ql)?:\/\//.test(connection)) {
  console.error(
    'TEST_DATABASE_URL must point to a migrated disposable PostgreSQL database. Refusing to silently skip integration tests.',
  );
  process.exit(1);
}
// Extra arguments go to Vitest (CI adds --coverage, WI-139).
const result = spawnSync(
  'pnpm',
  ['exec', 'vitest', 'run', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
  },
);
if (result.error)
  console.error('Unable to launch tests:', result.error.message);
process.exit(result.status ?? 1);
