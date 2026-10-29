import Link from 'next/link';
import { db, owner } from '@/server/db';
import { ActionForm } from '@/components/action-form';
import {
  executionAction,
  stopUnlinkedAction,
} from '@/features/schedule/actions';
import { hhmm } from '@/lib/time';
import { LiveLeft, LiveTimer } from './live';
import { focusWindow, pausedLeft, recordedBefore } from './focus-domain';
import { clock } from './ring';
import { PipHost, type PipSession } from './pip';
import { TitleClock } from './title-clock';
import { categoryGroup } from '@/features/review/domain';
import { Button } from '@/components/ui/button';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The running or paused session, shown in the shell on every page so it is never lost
 * (WI-068: on Today and Focus too, and a paused block keeps its card with Resume). One
 * statement: the owner's running session, else the one that ended last, with its block and
 * that block's finished sessions.
 */
export async function RunningNow() {
  const user = await owner();
  const now = new Date();
  const latest = await db().actualSession.findFirst({
    where: {
      userId: user.id,
      OR: [{ endedAt: null }, { endedAt: { gte: new Date(+now - DAY_MS) } }],
    },
    orderBy: { endedAt: { sort: 'desc', nulls: 'first' } },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          status: true,
          plannedStart: true,
          plannedEnd: true,
          sessions: {
            where: { endedAt: { not: null } },
            select: { startedAt: true, endedAt: true },
          },
        },
      },
    },
  });
  const task = latest?.task ?? null;
  const running = latest && !latest.endedAt ? latest : null;
  // Paused (WI-067): the last session ended, its block is still planned and its slot open.
  const paused =
    !running && task && task.status === 'PLANNED' && task.plannedEnd > now
      ? task
      : null;
  if (!running && !paused) return <PipHost shown={null} />;
  const done = task ? recordedBefore(task.sessions) : 0;
  if (paused) {
    const left = pausedLeft(paused.plannedStart, paused.plannedEnd, done);
    const total = +paused.plannedEnd - +paused.plannedStart;
    const shown: PipSession = {
      key: paused.id,
      title: paused.title,
      startedAt: latest!.endedAt!.toISOString(),
      target: null,
      since: '',
      paused: { left, total },
    };
    return (
      <>
        <PipHost shown={shown} />
        <section className="running-now is-paused" aria-label="Paused session">
          <p className="eyebrow">Paused</p>
          <Link prefetch={false} className="running-title" href="/today">
            {paused.title}
          </Link>
          <p className="running-left">
            {left > 0 ? `${clock(left)} left` : 'Time is up'}
            <span className="muted">
              {' '}
              · Until {hhmm(paused.plannedEnd, user.timezone)}
            </span>
          </p>
          <ActionForm
            action={executionAction}
            label={`Resume ${paused.title}`}
            broadcast="blocks"
          >
            <input type="hidden" name="id" value={paused.id} />
            <div className="running-actions">
              {/* In place (WI-073): the card turns Running; Focus stays a link away. */}
              <Button name="action" value="start">
                Resume<span className="sr-only">: {paused.title}</span>
              </Button>
              <Button className="secondary" name="action" value="complete">
                Complete<span className="sr-only">: {paused.title}</span>
              </Button>
            </div>
          </ActionForm>
        </section>
      </>
    );
  }
  const session = running!;
  // The same clock as Today and Focus: time left to the block's target, continuing from the
  // time recorded before a pause (WI-068), else time since the start.
  const ring = task
    ? focusWindow({
        startedAt: session.startedAt,
        plannedStart: task.plannedStart,
        plannedEnd: task.plannedEnd,
        doneBefore: done,
      })
    : null;
  const shown: PipSession = {
    key: task?.id ?? session.id,
    title: task?.title ?? categoryGroup(session.category),
    startedAt: (ring?.start ?? session.startedAt).toISOString(),
    target: ring ? ring.target.toISOString() : null,
    since: `since ${hhmm(session.startedAt, user.timezone)}`,
  };
  return (
    <>
      <PipHost shown={shown} />
      {ring && <TitleClock target={ring.target.toISOString()} />}
      <section className="running-now" aria-label="Running session">
        <p className="eyebrow">Running</p>
        <Link prefetch={false} className="running-title" href="/today">
          {shown.title}
        </Link>
        {ring ? (
          <LiveLeft target={ring.target.toISOString()} />
        ) : (
          <LiveTimer startedAt={session.startedAt.toISOString()} />
        )}
        <Link className="link running-focus" href="/focus" prefetch={false}>
          Focus
        </Link>
        {task ? (
          <ActionForm
            action={executionAction}
            label="Pause the running session"
            broadcast="blocks"
          >
            <input type="hidden" name="id" value={task.id} />
            <Button className="secondary" name="action" value="stop">
              Pause<span className="sr-only">: {shown.title}</span>
            </Button>
          </ActionForm>
        ) : (
          <ActionForm
            action={stopUnlinkedAction}
            label="Stop the running session"
          >
            <input type="hidden" name="id" value={session.id} />
            <Button className="secondary">Stop</Button>
          </ActionForm>
        )}
      </section>
    </>
  );
}
