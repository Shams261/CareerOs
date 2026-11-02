import 'server-only';
import { db } from '@/server/db';
import type { ScheduleUser } from '@/server/lock';

/** A Learn topic with its subject, parent, resources and history (WI-129, moved from the page). */
export const topicPage = (user: ScheduleUser, id: string) =>
  db().learningTopic.findFirst({
    where: { id, userId: user.id },
    include: {
      subject: true,
      parent: true,
      resources: { where: { userId: user.id } },
      activities: {
        where: { userId: user.id },
        orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
        take: 100,
      },
    },
  });

/** The topics beside it in its subject. */
export const topicSiblings = (user: ScheduleUser, subjectId: string) =>
  db().learningTopic.findMany({
    where: { userId: user.id, subjectId },
    orderBy: { ordering: 'asc' },
  });
