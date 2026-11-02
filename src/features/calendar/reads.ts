import 'server-only';
import { db } from '@/server/db';
import { SYNC_WINDOW } from './domain';

/** The blocks inside the sync window, for the Google Calendar panel (WI-130). */
export const syncWindowBlocks = (userId: string, now: Date) =>
  db().timeBlock.findMany({
    where: {
      dailyPlan: { userId },
      plannedEnd: { gte: new Date(+now - SYNC_WINDOW.pastDays * 86400000) },
      plannedStart: {
        lte: new Date(+now + SYNC_WINDOW.futureDays * 86400000),
      },
    },
  });

/** Every category the owner has used on a block, for the categories kept off Google. */
export const blockCategories = (userId: string) =>
  db().timeBlock.findMany({
    where: { dailyPlan: { userId } },
    select: { category: true },
    distinct: ['category'],
  });
