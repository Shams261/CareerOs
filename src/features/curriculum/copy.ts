// Relative imports only: scripts run this outside Next.js too.
import { Prisma } from '../../generated/prisma/client';
import { followPractice } from '../roadmap/follow';
import type { Bundle, BundleItem } from './bundle';

export type CopyReport = {
  topics: number;
  problems: number;
  roadmaps: number;
  items: number;
  /** Curriculum roadmaps brought back from Archived. */
  unarchived: number;
  /** Curriculum problems shown again after Hide. */
  unhidden: number;
};

/** Grill Me may use the study roadmaps; the behavioural one is the owner's own material (WI-031). */
const STUDY_AI_OFF = new Set(['Behavioural and resume']);

/**
 * Puts the default curriculum into a workspace (WI-064), inside the caller's transaction: only
 * what is missing is created, in a few bulk statements, so a first sign-in and Restore both stay
 * quick across regions. Nothing the owner wrote is touched: marks, attempts, confidence and notes
 * on existing rows stay as they are. A curriculum roadmap that was archived comes back, and so
 * does a curriculum problem that was hidden. No goal is created or linked: the curriculum has
 * nothing to do with the owner's goals.
 */
export async function copyCurriculum(
  tx: Prisma.TransactionClient,
  userId: string,
  bundle: Bundle,
): Promise<CopyReport> {
  const report: CopyReport = {
    topics: 0,
    problems: 0,
    roadmaps: 0,
    items: 0,
    unarchived: 0,
    unhidden: 0,
  };

  // Topics are shared by name (DsaTopic is global).
  const names = bundle.dsa.topics.map((t) => t.name);
  const knownTopics = new Set(
    (
      await tx.dsaTopic.findMany({
        where: { name: { in: names } },
        select: { name: true },
      })
    ).map((t) => t.name),
  );
  const newTopics = bundle.dsa.topics.filter((t) => !knownTopics.has(t.name));
  if (newTopics.length)
    report.topics = (
      await tx.dsaTopic.createMany({
        data: newTopics.map((t) => ({
          name: t.name,
          description: t.description ?? null,
          ordering: t.ordering,
        })),
        skipDuplicates: true,
      })
    ).count;
  const topicIds = new Map(
    (
      await tx.dsaTopic.findMany({
        where: { name: { in: names } },
        select: { id: true, name: true },
      })
    ).map((t) => [t.name, t.id]),
  );

  // Problems are the owner's, keyed by URL.
  const urls = bundle.dsa.problems.map((p) => p.problemUrl);
  const existingProblems = await tx.dsaProblem.findMany({
    where: { userId, problemUrl: { in: urls } },
    select: { id: true, problemUrl: true, hiddenAt: true },
  });
  const knownUrls = new Set(existingProblems.map((p) => p.problemUrl));
  const newProblems = bundle.dsa.problems.filter(
    (p) => !knownUrls.has(p.problemUrl),
  );
  if (newProblems.length)
    report.problems = (
      await tx.dsaProblem.createMany({
        data: newProblems.map((p) => ({
          userId,
          title: p.title,
          platform: 'LeetCode',
          problemUrl: p.problemUrl,
          difficulty: p.difficulty,
          topicId: topicIds.get(p.topic)!,
          notes: p.notes ?? null,
        })),
      })
    ).count;
  const hidden = existingProblems.filter((p) => p.hiddenAt).map((p) => p.id);
  if (hidden.length)
    report.unhidden = (
      await tx.dsaProblem.updateMany({
        where: { id: { in: hidden }, userId },
        data: { hiddenAt: null },
      })
    ).count;
  const problemIds = new Map(
    (
      await tx.dsaProblem.findMany({
        where: { userId, problemUrl: { in: urls } },
        select: { id: true, problemUrl: true },
      })
    ).map((p) => [p.problemUrl, p.id]),
  );

  // Roadmaps by title, marked as curriculum and never tied to a goal.
  const titles = bundle.roadmaps.map((r) => r.title);
  const existingRoadmaps = await tx.roadmap.findMany({
    where: { userId, title: { in: titles } },
    select: { id: true, title: true, curriculum: true, archivedAt: true },
  });
  let ordering = await tx.roadmap.count({ where: { userId } });
  const roadmapIds = new Map<string, string>();
  for (const r of bundle.roadmaps) {
    const found = existingRoadmaps.find((x) => x.title === r.title);
    if (found) {
      if (!found.curriculum || found.archivedAt) {
        await tx.roadmap.update({
          where: { id: found.id },
          data: { curriculum: true, archivedAt: null },
        });
        if (found.archivedAt) report.unarchived += 1;
      }
      roadmapIds.set(r.title, found.id);
      continue;
    }
    const created = await tx.roadmap.create({
      data: {
        userId,
        title: r.title,
        description: r.description ?? null,
        promptTemplate: r.promptTemplate ?? null,
        scenarios: r.scenarios
          ? (r.scenarios as Prisma.InputJsonValue)
          : Prisma.DbNull,
        studyAi: !STUDY_AI_OFF.has(r.title),
        curriculum: true,
        ordering: ordering++,
      },
      select: { id: true },
    });
    roadmapIds.set(r.title, created.id);
    report.roadmaps += 1;
  }

  // Items by (roadmap, slug); only the missing ones are created.
  const existingItems = await tx.roadmapItem.findMany({
    where: { roadmapId: { in: [...roadmapIds.values()] }, slug: { not: null } },
    select: { roadmapId: true, slug: true },
  });
  const knownItems = new Set(
    existingItems.map((i) => `${i.roadmapId}:${i.slug}`),
  );
  const rows: Prisma.RoadmapItemCreateManyInput[] = [];
  for (const r of bundle.roadmaps) {
    const roadmapId = roadmapIds.get(r.title)!;
    let itemOrdering = 0;
    for (const s of r.sections)
      for (const i of s.items) {
        const ordering = itemOrdering++;
        if (knownItems.has(`${roadmapId}:${i.slug}`)) continue;
        rows.push(
          itemRow(i, s.name, ordering, userId, roadmapId, topicIds, problemIds),
        );
      }
  }
  if (rows.length)
    report.items = (await tx.roadmapItem.createMany({ data: rows })).count;

  // Problem items take their status from Practice (WI-046, ADR-025).
  await followPractice(tx, userId);
  return report;
}

function itemRow(
  i: BundleItem,
  section: string,
  ordering: number,
  userId: string,
  roadmapId: string,
  topicIds: Map<string, string>,
  problemIds: Map<string, string>,
): Prisma.RoadmapItemCreateManyInput {
  return {
    userId,
    roadmapId,
    slug: i.slug,
    section,
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
    notes: i.notes ?? null,
    ordering,
    dsaTopicId: i.dsaTopic ? (topicIds.get(i.dsaTopic) ?? null) : null,
    dsaProblemId: i.problemUrl ? (problemIds.get(i.problemUrl) ?? null) : null,
  };
}
