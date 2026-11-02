import 'server-only';
import { db } from '@/server/db';
import type { ScheduleUser } from '@/server/lock';
import { aiState } from '@/features/ai/service';
import { linkOptions } from './service';

/** What a roadmap week reads beside the roadmap itself (WI-129, moved from the page). */
export async function weekPageReads(
  user: ScheduleUser,
  roadmap: { id: string; studyAi: boolean },
) {
  const [links, goals, ai, cards] = await Promise.all([
    linkOptions(user.id),
    db().goal.findMany({
      where: { userId: user.id },
      select: { id: true, title: true },
    }),
    roadmap.studyAi ? aiState(user) : null,
    db().revisionCard.findMany({
      where: { userId: user.id, roadmapItem: { roadmapId: roadmap.id } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        roadmapItemId: true,
        question: true,
        change: true,
        points: true,
      },
    }),
  ]);
  return { links, goals, ai, cards };
}
