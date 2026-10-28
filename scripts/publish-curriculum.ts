import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client';
import { createPgAdapter, describeDatabase } from '../src/lib/database';
import { parseDatabaseSsl } from '../src/lib/database-ssl';
import {
  bundleCounts,
  validateBundle,
  type Bundle,
} from '../src/features/curriculum/bundle';

/**
 * pnpm curriculum:publish <bundle.json>
 *
 * Stores the roadmap bundle as the default curriculum (WI-064) in DATABASE_URL. Every new
 * workspace gets it on its first sign-in, and Settings → Restore default curriculum copies back
 * anything missing. Re-running replaces the stored bundle; workspaces keep their own copies.
 * Owner-run; the bundle is the owner's material and never committed.
 */
async function main() {
  const file = process.argv[2];
  const url = process.env.DATABASE_URL;
  if (!file || !url) {
    console.error(
      'Usage: DATABASE_URL=… pnpm curriculum:publish <bundle.json>',
    );
    process.exit(1);
  }
  const bundle = JSON.parse(readFileSync(file, 'utf8')) as Bundle;
  if (bundle.format !== 'silsila-roadmap-bundle' || bundle.version !== 1)
    throw new Error('Not a version 1 Silsila roadmap bundle.');
  const problems = validateBundle(bundle);
  if (problems.length)
    throw new Error('Bundle problems:\n' + problems.join('\n'));
  // The curriculum is never tied to a goal, so a bundle's goal is not stored.
  const payload = { ...bundle, goal: undefined };
  console.log(
    `Publishing ${file} (built ${bundle.builtAt}) to ${describeDatabase(url)}`,
  );
  const prisma = new PrismaClient({
    adapter: createPgAdapter(url, {
      max: 1,
      ssl: parseDatabaseSsl(
        process.env.DATABASE_SSL,
        process.env.DATABASE_SSL_CA,
      ),
    }),
  });
  try {
    const data = {
      builtAt: new Date(bundle.builtAt),
      payload: payload as unknown as Prisma.InputJsonValue,
    };
    await prisma.curriculumBundle.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: { ...data, publishedAt: new Date() },
    });
    console.table(bundleCounts(bundle));
    console.log(
      `Published: ${bundle.roadmaps.length} roadmaps, ${bundle.dsa.problems.length} problems, ${bundle.dsa.topics.length} topics.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
