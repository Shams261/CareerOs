import { redirect } from 'next/navigation';
import { owner } from '@/server/db';
import { dayKey, hhmm } from '@/lib/time';
import { FocusView } from '@/features/execution/focus';
import { categoryGroup } from '@/lib/categories';
import { recordedBefore } from '@/features/execution/focus-domain';
import { focusBlock, runningSession } from '@/features/execution/page-data';
export const metadata = { title: 'Focus' };

/**
 * The Focus session (WI-027). `?block=` opens Focus for that block (Begin starts it); without
 * it Focus shows the running session. At most two statements: the running session and a block.
 */
export default async function FocusPage({
  searchParams,
}: {
  searchParams: Promise<{ block?: string; minutes?: string }>;
}) {
  const user = await owner(),
    now = new Date(),
    query = await searchParams;
  const running = await runningSession(user);
  // A session is already running for something else: Focus shows that one (one at a time).
  if (running && query.block && query.block !== running.taskId)
    redirect('/focus');
  const blockId = running ? running.taskId : (query.block ?? null);
  const block = blockId ? await focusBlock(user, blockId) : null;
  if (!running && !block) redirect('/today');
  // "Start 20 min" from a study nudge (WI-028): a short target instead of the planned end.
  const minutes = Number(query.minutes);
  const target =
    Number.isInteger(minutes) && minutes >= 5 && minutes <= 180
      ? minutes
      : null;
  const session = running
    ? {
        id: running.id,
        startedAt: running.startedAt.toISOString(),
        notes: running.notes,
        since: hhmm(running.startedAt, user.timezone),
      }
    : null;
  return (
    <FocusView
      title={block?.title ?? categoryGroup(running!.category)}
      block={
        block && {
          id: block.id,
          title: block.title,
          category: block.category,
          plannedStart: block.plannedStart.toISOString(),
          plannedEnd: block.plannedEnd.toISOString(),
          window: `${hhmm(block.plannedStart, user.timezone)}–${hhmm(block.plannedEnd, user.timezone)}`,
          minutes: target,
          doneBefore: recordedBefore(block.sessions),
          canStart:
            ['PLANNED', 'IN_PROGRESS'].includes(block.status) &&
            block.dailyPlan.date.toISOString().slice(0, 10) ===
              dayKey(now, user.timezone),
        }
      }
      session={session}
      renderedAt={now.toISOString()}
    />
  );
}
