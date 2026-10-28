import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter, describeDatabase } from '../src/lib/database';
import { parseDatabaseSsl } from '../src/lib/database-ssl';
import { importBundle } from './lib/roadmap-import';
import type { Bundle } from './lib/roadmap-bundle';

/**
 * pnpm roadmap:import <bundle.json>
 *
 * Imports a roadmap bundle into DATABASE_URL for the single owner. Safe to re-run: marks,
 * attempts and the owner's notes are never overwritten (see scripts/lib/roadmap-import.ts).
 */
async function main() {
  const file = process.argv[2];
  const url = process.env.DATABASE_URL;
  if (!file || !url) {
    console.error('Usage: DATABASE_URL=… pnpm roadmap:import <bundle.json>');
    process.exit(1);
  }
  const bundle = JSON.parse(readFileSync(file, 'utf8')) as Bundle;
  console.log(
    `Importing ${file} (built ${bundle.builtAt}) into ${describeDatabase(url)}`,
  );
  const prisma = new PrismaClient({
    adapter: createPgAdapter(url, {
      max: 2,
      ssl: parseDatabaseSsl(
        process.env.DATABASE_SSL,
        process.env.DATABASE_SSL_CA,
      ),
    }),
  });
  try {
    const report = await importBundle(prisma, bundle);
    console.table(
      report.roadmaps.map((r) => ({
        roadmap: r.title,
        roadmap_created: r.created,
        items_created: r.items.created,
        items_updated: r.items.updated,
        notes_kept: r.items.notesKept,
      })),
    );
    console.log(
      `DSA topics: ${report.topics.created} created, ${report.topics.updated} updated · problems: ${report.problems.created} created, ${report.problems.updated} updated · problem items in step with Practice: ${report.problemItemsFollowed}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
