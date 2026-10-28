import 'server-only';
import { memo } from '@/server/memo';
import { dayKey } from '@/lib/time';
import { locked, type ScheduleUser } from '@/features/schedule/service';
import { executeIn } from '@/features/execution/service';
import { blockResolution } from '@/features/schedule/row';
import { dsaSnapshot } from '@/features/dsa/service';
import { curriculumOrder, revisionQueue } from '@/features/dsa/domain';
import { revisionDue, roadmapList, weekPlan } from '@/features/roadmap/service';
import { formatInTimeZone } from 'date-fns-tz';
import { saveBlock } from '@/features/schedule/editing';
import { forToday, PICK_MINUTES } from './domain';

async function loadPicks(user: ScheduleUser, now: Date) {
  const today = dayKey(now, user.timezone);
  const [practice, due, week, roadmaps] = await Promise.all([
    dsaSnapshot(user),
    revisionDue(user, now),
    weekPlan(user, now),
    roadmapList(user, now),
  ]);
  const live = roadmaps.find((r) => !r.archivedAt && r.next);
  return forToday({
    today,
    problemsDue: revisionQueue(practice.problems, today),
    itemsDue: due,
    interviewRows: week.rows.filter((r) => r.interview),
    continueItem:
      live && live.next
        ? {
            ...live.next,
            roadmapId: live.id,
            roadmapTitle: live.title,
          }
        : null,
    // Curriculum order, so the pick without a current topic is the list's first (WI-060).
    problems: curriculumOrder(practice.problems, practice.topics),
    currentTopicId: practice.currentTopic?.id ?? null,
  });
}

/**
 * The owner's "For today" picks (WI-059), shared by Today's launcher, the Roadmap overview and
 * Practice. Read-only and memoized like the snapshots it reads (ADR-017).
 */
export const forTodayPicks = (user: ScheduleUser, now = new Date()) =>
  memo(user.id, 'for-today', () => loadPicks(user, now));

/**
 * Start 20 min on a pick (WI-059): a 20-minute block added for today from the next whole
 * minute, written like any added block (it refuses an overlap), then Focus opens on it.
 */
export async function startPick(
  user: ScheduleUser,
  pick: { title: string; category: string },
  now = new Date(),
) {
  const start = new Date(Math.ceil(+now / 60_000) * 60_000);
  const end = new Date(+start + PICK_MINUTES * 60_000);
  const at = (d: Date, f: string) => formatInTimeZone(d, user.timezone, f);
  return saveBlock(
    user,
    {
      title: pick.title,
      category: pick.category,
      description: '',
      priority: 2,
      day: at(start, 'yyyy-MM-dd'),
      endDay: at(end, 'yyyy-MM-dd'),
      startLocal: at(start, 'HH:mm'),
      endLocal: at(end, 'HH:mm'),
    },
    false,
  );
}

/**
 * Let go of a past day's blocks that have no record and no decision (WI-059), in one step
 * under the owner lock, the way Close the Day lets one go. Interview blocks are left alone.
 */
export async function letGoDay(
  user: ScheduleUser,
  day: string,
  now = new Date(),
) {
  if (day >= dayKey(now, user.timezone))
    throw new Error('Only a past day can be let go of.');
  return locked(user.id, async (tx) => {
    const plan = await tx.dailyPlan.findUnique({
      where: { userId_date: { userId: user.id, date: new Date(day) } },
      include: { blocks: { include: { sessions: true } } },
    });
    const open = (plan?.blocks ?? []).filter(
      (b) => !b.interviewRoundId && blockResolution(b, now) === 'not-recorded',
    );
    for (const b of open)
      await executeIn(tx, user, b.id, 'skip', 'Let go', now);
    return open.map((b) => b.id);
  });
}
