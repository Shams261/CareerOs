import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter, describeDatabase } from '../src/lib/database';
import { isTestNamed } from '../src/lib/test-data';

/**
 * pnpm data:check — read-only. Lists records whose names read as test or UAT data
 * (`src/lib/test-data.ts`) so they can be cleaned up before Study Nudges or AI use any
 * record. Prints model names, counts and ids only, never the names themselves.
 * Exits 1 when anything matches, 0 when the data is clean.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required.');
  process.exit(2);
}
const db = new PrismaClient({ adapter: createPgAdapter(url) });

type Row = { id: string; names: (string | null)[] };
const checks: [string, () => Promise<Row[]>][] = [
  [
    'Goal',
    async () =>
      (await db.goal.findMany({ select: { id: true, title: true } })).map(
        (r) => ({ id: r.id, names: [r.title] }),
      ),
  ],
  [
    'RoutineBlock',
    async () =>
      (
        await db.routineBlock.findMany({ select: { id: true, title: true } })
      ).map((r) => ({ id: r.id, names: [r.title] })),
  ],
  [
    'TimeBlock (today and later)',
    async () =>
      (
        await db.timeBlock.findMany({
          where: { plannedEnd: { gte: new Date(Date.now() - 86400000) } },
          select: { id: true, title: true },
        })
      ).map((r) => ({ id: r.id, names: [r.title] })),
  ],
  [
    'Roadmap',
    async () =>
      (await db.roadmap.findMany({ select: { id: true, title: true } })).map(
        (r) => ({ id: r.id, names: [r.title] }),
      ),
  ],
  [
    // Imported curriculum items (with a slug) are the owner's study material, not test entries.
    'RoadmapItem (added by hand)',
    async () =>
      (
        await db.roadmapItem.findMany({
          where: { slug: null },
          select: { id: true, title: true, section: true },
        })
      ).map((r) => ({ id: r.id, names: [r.title, r.section] })),
  ],
  [
    'DsaProblem',
    async () =>
      (await db.dsaProblem.findMany({ select: { id: true, title: true } })).map(
        (r) => ({ id: r.id, names: [r.title] }),
      ),
  ],
  [
    'JobApplication',
    async () =>
      (
        await db.jobApplication.findMany({
          select: { id: true, company: true, role: true },
        })
      ).map((r) => ({ id: r.id, names: [r.company, r.role] })),
  ],
  [
    'InterviewRound',
    async () =>
      (
        await db.interviewRound.findMany({ select: { id: true, title: true } })
      ).map((r) => ({ id: r.id, names: [r.title] })),
  ],
  [
    'QuickNote (open)',
    async () =>
      (
        await db.quickNote.findMany({
          where: { doneAt: null },
          select: { id: true, body: true },
        })
      ).map((r) => ({ id: r.id, names: [r.body] })),
  ],
];

async function main() {
  console.log(`Checking ${describeDatabase(url!)} (read-only)`);
  let total = 0;
  for (const [model, load] of checks) {
    const hits = (await load()).filter((r) => isTestNamed(...r.names));
    total += hits.length;
    console.log(
      `${model}: ${hits.length}${hits.length ? ` · ${hits.map((h) => h.id).join(', ')}` : ''}`,
    );
  }
  console.log(
    total
      ? `${total} test-named record(s). Clean them up in the app before enabling nudges or AI.`
      : 'Clean: no test-named records.',
  );
  process.exitCode = total ? 1 : 0;
}

main()
  .catch((error) => {
    console.error(
      'data:check failed:',
      error instanceof Error ? error.name : 'Unknown',
    );
    process.exitCode = 2;
  })
  .finally(() => db.$disconnect());
