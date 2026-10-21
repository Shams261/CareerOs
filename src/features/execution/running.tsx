import Link from 'next/link';
import { db, owner } from '@/server/db';
import { ActionForm } from '@/components/action-form';
import {
  executionAction,
  stopUnlinkedAction,
} from '@/features/schedule/actions';
import { LiveTimer } from './live';

/** The running session, shown in the shell on every page so it is never lost. */
export async function RunningNow() {
  const user = await owner();
  const running = await db().actualSession.findFirst({
    where: { userId: user.id, endedAt: null },
    include: { task: { select: { id: true, title: true } } },
  });
  if (!running) return null;
  return (
    <aside className="running-now" aria-label="Running session">
      <p className="eyebrow">Running</p>
      <Link className="running-title" href="/today">
        {running.task?.title ?? running.category}
      </Link>
      <LiveTimer startedAt={running.startedAt.toISOString()} />
      {running.task ? (
        <ActionForm action={executionAction} label="Stop the running session">
          <input type="hidden" name="id" value={running.task.id} />
          <button className="button secondary" name="action" value="stop">
            Stop
          </button>
        </ActionForm>
      ) : (
        <ActionForm
          action={stopUnlinkedAction}
          label="Stop the running session"
        >
          <input type="hidden" name="id" value={running.id} />
          <button className="button secondary">Stop</button>
        </ActionForm>
      )}
    </aside>
  );
}
