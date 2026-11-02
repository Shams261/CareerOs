import 'server-only';
import { db } from '@/server/db';
import type { ScheduleUser } from '@/server/lock';

/**
 * Where a prep doc's links point now (WI-129, moved from the page): roadmap items with their
 * week, and problems that still exist. One removed since reads as plain text.
 */
export async function linkedTargets(
  user: ScheduleUser,
  linked: { kind: string; id: string }[],
) {
  const [items, problems] = await Promise.all([
    db().roadmapItem.findMany({
      where: {
        userId: user.id,
        id: { in: linked.filter((l) => l.kind === 'roadmap').map((l) => l.id) },
      },
      select: { id: true, roadmapId: true, section: true },
    }),
    db().dsaProblem.findMany({
      where: {
        userId: user.id,
        id: { in: linked.filter((l) => l.kind === 'problem').map((l) => l.id) },
      },
      select: { id: true },
    }),
  ]);
  return { items, problems };
}
