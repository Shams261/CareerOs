import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
if (
  !process.env.TEST_DATABASE_URL ||
  process.env.TEST_DATABASE_URL !== process.env.DATABASE_URL
)
  throw new Error(
    'Seed verification requires DATABASE_URL = TEST_DATABASE_URL on a disposable database.',
  );
const client = new PrismaClient({
  adapter: createPgAdapter(process.env.TEST_DATABASE_URL),
});
const tables = [
  'User',
  'Goal',
  'DailyPlan',
  'TimeBlock',
  'ActualSession',
  'DsaTopic',
  'DsaProblem',
  'DsaAttempt',
  'LearningTopic',
  'LearningSubject',
  'LearningActivity',
  'Resource',
  'JobApplication',
  'JobActivity',
  'InterviewRound',
  'InterviewPrepItem',
  'CalendarConnection',
  'CalendarWatchChannel',
  'CalendarSyncConflict',
  'RoutineBlock',
  'DailyCheckIn',
  'NotificationPreference',
  'NotificationLog',
];
async function snapshot() {
  const rows = [];
  for (const table of tables)
    rows.push(
      await client.$queryRawUnsafe(
        `SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) AS data FROM "${table}" t`,
      ),
    );
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
function seed() {
  const run = spawnSync('pnpm', ['db:seed'], { stdio: 'inherit' });
  if (run.error || run.status !== 0) throw new Error('Seed failed');
}
try {
  seed();
  const first = await snapshot();
  seed();
  if (first !== (await snapshot()))
    throw new Error('Second seed changed persisted records.');
  console.log('Seed idempotency verified across all 23 domain tables.');
} finally {
  await client.$disconnect();
}
