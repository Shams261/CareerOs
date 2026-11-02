import 'server-only';
import { ownedApplication } from './owned';
import { db } from '@/server/db';
import { locked, type ScheduleUser } from '@/server/lock';
import type { Prisma } from '@/generated/prisma/client';
import {
  formatPractice,
  formatSources,
  formatsInput,
  loopFormats,
  type Format,
  type FormatItem,
} from './formats';

/** Interview formats on an application and the owner's material for each (WI-047, WI-132). */
/** The formats this company's loop uses, as the owner ticked them (WI-047). */
export async function saveFormats(user: ScheduleUser, raw: unknown) {
  const { id, formats } = formatsInput.parse(raw);
  return locked(user.id, async (tx) => {
    const app = await ownedApplication(tx, user.id, id);
    return tx.jobApplication.update({
      where: { id: app.id },
      data: { formats: [...new Set(formats)] },
    });
  });
}

/**
 * The owner's roadmap items that any of these formats points at (guides and drill sets), in
 * one query, leaving out archived roadmaps. Shared by the loop card and the weekly mix.
 */
export async function formatItems(
  user: ScheduleUser,
  formats: Format[],
): Promise<FormatItem[]> {
  if (!formats.length) return [];
  const { guides, drills } = formatSources([...new Set(formats)]);
  const OR: Prisma.RoadmapItemWhereInput[] = [
    ...guides.map((g) => ({ slug: g.slug, roadmap: { title: g.roadmap } })),
    ...drills.map((d) =>
      d.p0Problems
        ? {
            roadmap: { title: d.roadmap },
            priority: 1,
            dsaProblemId: { not: null },
          }
        : d.companySection
          ? {
              roadmap: { title: d.roadmap },
              section: { startsWith: 'Company: ' },
            }
          : {
              roadmap: { title: d.roadmap },
              ...(d.section ? { section: d.section } : {}),
              ...(d.slugPrefix ? { slug: { startsWith: d.slugPrefix } } : {}),
            },
    ),
  ];
  const rows = await db().roadmapItem.findMany({
    where: { userId: user.id, roadmap: { archivedAt: null }, OR },
    select: {
      id: true,
      roadmapId: true,
      section: true,
      slug: true,
      title: true,
      status: true,
      priority: true,
      ordering: true,
      dsaProblemId: true,
      completedAt: true,
      roadmap: { select: { title: true } },
    },
  });
  return rows.map(({ roadmap, ...i }) => ({
    ...i,
    roadmapTitle: roadmap.title,
  }));
}

/**
 * Practise for this loop (WI-047): each format of the application and its upcoming rounds,
 * with the guide item and the next item to work on from the owner's own roadmaps. One query.
 */
export async function loopPractice(
  user: ScheduleUser,
  app: {
    company: string;
    formats: readonly string[];
    rounds: {
      type: string;
      aiPolicy: string;
      status: string;
      scheduledStart: Date;
    }[];
  },
  now = new Date(),
) {
  const loop = loopFormats(app.formats, app.rounds, now);
  if (!loop.length) return [];
  const items = await formatItems(
    user,
    loop.map((l) => l.format),
  );
  return loop.map((l) => ({
    ...l,
    ...formatPractice(l.format, items, app.company),
  }));
}
