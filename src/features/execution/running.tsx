import Link from 'next/link';
import { db, owner } from '@/server/db';
import { ActionForm } from '@/components/action-form';
import {
  executionAction,
  stopUnlinkedAction,
} from '@/features/schedule/actions';
import { LiveLeft, LiveTimer } from './live';
import { focusTarget } from './focus-domain';
import { PipHost } from './pip';
import { categoryGroup } from '@/features/review/domain';
import { Button } from '@/components/ui/button';

/** The running session, shown in the shell on every page so it is never lost. */
export async function RunningNow() {
  const user = await owner();
  const running = await db().actualSession.findFirst({
    where: { userId: user.id, endedAt: null },
    include: {
      task: {
        select: { id: true, title: true, plannedStart: true, plannedEnd: true },
      },
    },
  });
  // The pop-out window lives here, in the shell, so it outlives the Focus page (WI-066).
  if (!running) return <PipHost runningId={null} />;
  // The same clock as Today and Focus: time left to the block's target, else time since.
  const target = running.task
    ? focusTarget({
        startedAt: running.startedAt,
        plannedStart: running.task.plannedStart,
        plannedEnd: running.task.plannedEnd,
      })
    : null;
  return (
    <>
      <PipHost runningId={running.id} />
      <section className="running-now" aria-label="Running session">
        <p className="eyebrow">Running</p>
        <Link prefetch={false} className="running-title" href="/today">
          {running.task?.title ?? categoryGroup(running.category)}
        </Link>
        {target ? (
          <LiveLeft target={target.toISOString()} />
        ) : (
          <LiveTimer startedAt={running.startedAt.toISOString()} />
        )}
        <Link className="link running-focus" href="/focus" prefetch={false}>
          Focus
        </Link>
        {running.task ? (
          <ActionForm
            action={executionAction}
            label="Pause the running session"
          >
            <input type="hidden" name="id" value={running.task.id} />
            <Button className="secondary" name="action" value="stop">
              Pause
            </Button>
          </ActionForm>
        ) : (
          <ActionForm
            action={stopUnlinkedAction}
            label="Stop the running session"
          >
            <input type="hidden" name="id" value={running.id} />
            <Button className="secondary">Stop</Button>
          </ActionForm>
        )}
      </section>
    </>
  );
}
