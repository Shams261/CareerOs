import Link from 'next/link';
import { db, owner } from '@/server/db';
import { ActionForm } from '@/components/action-form';
import {
  executionAction,
  stopUnlinkedAction,
} from '@/features/schedule/actions';
import { LiveTimer } from './live';
import { categoryGroup } from '@/features/review/domain';
import { Button } from '@/components/ui/button';

/** The running session, shown in the shell on every page so it is never lost. */
export async function RunningNow() {
  const user = await owner();
  const running = await db().actualSession.findFirst({
    where: { userId: user.id, endedAt: null },
    include: { task: { select: { id: true, title: true } } },
  });
  if (!running) return null;
  return (
    <section className="running-now" aria-label="Running session">
      <p className="eyebrow">Running</p>
      <Link prefetch={false} className="running-title" href="/today">
        {running.task?.title ?? categoryGroup(running.category)}
      </Link>
      <LiveTimer startedAt={running.startedAt.toISOString()} />
      <Link className="link running-focus" href="/focus" prefetch={false}>
        Focus
      </Link>
      {running.task ? (
        <ActionForm action={executionAction} label="Stop the running session">
          <input type="hidden" name="id" value={running.task.id} />
          <Button className="secondary" name="action" value="stop">
            Stop
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
  );
}
