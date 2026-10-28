/**
 * Imports a roadmap bundle for the single owner. Idempotent: keyed by Roadmap.title,
 * RoadmapItem (roadmapId, slug), DsaTopic.name and DsaProblem (userId, problemUrl). Re-runs
 * update scope, checkpoint, priority, estimate, references, URL, source, template and
 * scenarios; they never touch status, completedAt, askedInInterview, askedNote, attempts or
 * confidence, and write notes only while the item's notes are still empty. Problem items are the
 * exception for status: it follows Practice (`followPractice`, WI-046).
 */
import { Prisma, type PrismaClient } from '../../src/generated/prisma/client';
import type { Bundle } from './roadmap-bundle';
import { validateBundle } from './roadmap-bundle';
import { followPractice } from '../../src/features/roadmap/follow';

export type ImportReport = {
  roadmaps: {
    title: string;
    created: boolean;
    items: { created: number; updated: number; notesKept: number };
  }[];
  topics: { created: number; updated: number };
  problems: { created: number; updated: number };
  /** Problem items whose status was brought in step with Practice. */
  problemItemsFollowed: number;
};

export async function importBundle(
  prisma: PrismaClient,
  bundle: Bundle,
  /** Tests pass the owner; the CLI resolves the single User row. */
  options: { userId?: string } = {},
): Promise<ImportReport> {
  if (bundle.format !== 'silsila-roadmap-bundle' || bundle.version !== 1)
    throw new Error('Not a version 1 Silsila roadmap bundle.');
  const problems = validateBundle(bundle);
  if (problems.length)
    throw new Error('Bundle problems:\n' + problems.join('\n'));
  let userId = options.userId;
  if (!userId) {
    const users = await prisma.user.findMany({ select: { id: true } });
    if (users.length !== 1)
      throw new Error(
        `Expected exactly one User row, found ${users.length}. Refusing to import.`,
      );
    userId = users[0].id;
  }
  const report: ImportReport = {
    roadmaps: [],
    topics: { created: 0, updated: 0 },
    problems: { created: 0, updated: 0 },
    problemItemsFollowed: 0,
  };
  return prisma.$transaction(
    async (tx) => {
      // No goal (WI-064): the curriculum has nothing to do with the owner's goals; a bundle's
      // `goal` is ignored and existing goal links stay as the owner set them.
      // DSA topics and problems first so items can link to them.
      const topicIds = new Map<string, string>();
      for (const t of bundle.dsa.topics) {
        const existing = await tx.dsaTopic.findUnique({
          where: { name: t.name },
        });
        const row = existing
          ? await tx.dsaTopic.update({
              where: { id: existing.id },
              data: {
                description: t.description ?? existing.description,
                ordering: t.ordering,
              },
            })
          : await tx.dsaTopic.create({
              data: {
                name: t.name,
                description: t.description ?? null,
                ordering: t.ordering,
              },
            });
        report.topics[existing ? 'updated' : 'created'] += 1;
        topicIds.set(t.name, row.id);
      }
      const problemIds = new Map<string, string>();
      for (const p of bundle.dsa.problems) {
        const existing = await tx.dsaProblem.findFirst({
          where: { userId, problemUrl: p.problemUrl },
        });
        const data = {
          title: p.title,
          platform: 'LeetCode',
          difficulty: p.difficulty,
          topicId: topicIds.get(p.topic)!,
        };
        const row = existing
          ? await tx.dsaProblem.update({
              where: { id: existing.id },
              // Owner notes on a problem are theirs once written.
              data: {
                ...data,
                notes: existing.notes?.trim()
                  ? existing.notes
                  : (p.notes ?? null),
              },
            })
          : await tx.dsaProblem.create({
              data: {
                ...data,
                userId,
                problemUrl: p.problemUrl,
                notes: p.notes ?? null,
              },
            });
        report.problems[existing ? 'updated' : 'created'] += 1;
        problemIds.set(p.problemUrl, row.id);
      }
      let ordering = await tx.roadmap.count({ where: { userId } });
      for (const r of bundle.roadmaps) {
        const existing = await tx.roadmap.findFirst({
          where: { userId, title: r.title },
        });
        const data = {
          description: r.description ?? null,
          promptTemplate: r.promptTemplate ?? null,
          scenarios: r.scenarios
            ? (r.scenarios as Prisma.InputJsonValue)
            : Prisma.DbNull,
        };
        const roadmap = existing
          ? await tx.roadmap.update({
              where: { id: existing.id },
              data: { ...data, curriculum: true },
            })
          : await tx.roadmap.create({
              data: {
                ...data,
                userId,
                title: r.title,
                curriculum: true,
                ordering: ordering++,
                // Grill Me may use imported study roadmaps; the behavioural one is the owner's
                // own material (WI-031). An existing roadmap keeps the owner's choice.
                studyAi: r.title !== 'Behavioural and resume',
              },
            });
        const counts = { created: 0, updated: 0, notesKept: 0 };
        let itemOrdering = 0;
        for (const s of r.sections)
          for (const i of s.items) {
            const item = {
              section: s.name,
              kind: i.kind,
              title: i.title,
              priority: i.priority,
              estimateMinutes: i.estimateMinutes ?? null,
              scope: i.scope ?? null,
              checkpoint: i.checkpoint ?? null,
              references: i.references?.length
                ? (i.references as Prisma.InputJsonValue)
                : Prisma.DbNull,
              url: i.url ?? null,
              sourceRef: i.sourceRef ?? null,
              ordering: itemOrdering++,
              dsaTopicId: i.dsaTopic
                ? (topicIds.get(i.dsaTopic) ?? null)
                : null,
              dsaProblemId: i.problemUrl
                ? (problemIds.get(i.problemUrl) ?? null)
                : null,
            };
            const found = await tx.roadmapItem.findUnique({
              where: {
                roadmapId_slug: { roadmapId: roadmap.id, slug: i.slug },
              },
            });
            if (found) {
              const keepNotes = !!found.notes?.trim();
              if (keepNotes && i.notes) counts.notesKept += 1;
              await tx.roadmapItem.update({
                where: { id: found.id },
                data: {
                  ...item,
                  notes: keepNotes ? found.notes : (i.notes ?? null),
                },
              });
              counts.updated += 1;
            } else {
              await tx.roadmapItem.create({
                data: {
                  ...item,
                  userId,
                  roadmapId: roadmap.id,
                  slug: i.slug,
                  notes: i.notes ?? null,
                },
              });
              counts.created += 1;
            }
          }
        report.roadmaps.push({
          title: r.title,
          created: !existing,
          items: counts,
        });
      }
      // Problem items take their status from Practice (WI-046, ADR-025); this is derived, never
      // a mark the owner wrote, so a re-run may set it.
      report.problemItemsFollowed = await followPractice(tx, userId);
      return report;
    },
    { timeout: 600000, maxWait: 30000 },
  );
}
