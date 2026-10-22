import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { LiveTimer } from '@/features/execution/live';
import { stopUnlinkedAction } from '@/features/schedule/actions';
import { ExecutionControls } from '@/features/schedule/forms';
import { categoryGroup } from '@/features/review/domain';
import { clock } from '@/lib/time';
import type { TimeBlock } from '@/generated/prisma/client';
import type { LauncherState, RoundLike } from './domain';
import { PressButton } from './panels';

const startsIn = (d: Date, now: Date) => {
  const m = Math.max(1, Math.round((+d - +now) / 60000));
  return m < 60
    ? `${m} min`
    : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
};

/**
 * The compact focus launcher: one surface, one primary action. Its child order never
 * changes between states so a save re-renders it in place.
 */
export function Launcher({
  state,
  blocks,
  rounds,
  zone,
  now,
}: {
  state: LauncherState;
  blocks: TimeBlock[];
  rounds: RoundLike[];
  zone: string;
  now: Date;
}) {
  const full = (id: string) => blocks.find((b) => b.id === id) ?? null;
  const roundOf = (block: { interviewRoundId: string | null } | null) =>
    block?.interviewRoundId
      ? (rounds.find((r) => r.id === block.interviewRoundId) ?? null)
      : null;
  let eyebrow = '',
    title = '',
    context: React.ReactNode = null,
    action: React.ReactNode = null,
    next: React.ReactNode = null;
  if (state.kind === 'running') {
    const block = state.block ? full(state.block.id) : null;
    eyebrow = `In session · Since ${clock(state.session.startedAt, zone)}`;
    title =
      state.session.title ??
      block?.title ??
      categoryGroup(state.session.category);
    context = (
      <LiveTimer
        startedAt={state.session.startedAt.toISOString()}
        className="launcher-timer"
      />
    );
    action = block ? (
      <ExecutionControls
        block={{ ...block, status: 'IN_PROGRESS' }}
        current
        launcher
        more
      />
    ) : (
      <ActionForm action={stopUnlinkedAction}>
        <input type="hidden" name="id" value={state.session.id} />
        <Button>Stop session</Button>
      </ActionForm>
    );
  } else if (state.kind === 'current' || state.kind === 'next') {
    const block = full(state.block.id)!;
    const round = roundOf(block);
    eyebrow = `${state.kind === 'current' ? 'Now' : 'Next'} · ${clock(block.plannedStart, zone)}–${clock(block.plannedEnd, zone)}`;
    title = block.title;
    context = (
      <>
        {round ? `${round.company} · Interview` : categoryGroup(block.category)}
        {state.kind === 'next' &&
          ` · Starts in ${startsIn(block.plannedStart, now)}`}
        {round && (
          <>
            {' · '}
            <Link
              className="link"
              href={`/jobs/${round.applicationId}#round-${round.id}`}
              prefetch={false}
            >
              Open prep{round.openPrep ? ` (${round.openPrep} open)` : ''}
            </Link>
          </>
        )}
      </>
    );
    action = <ExecutionControls block={block} current launcher more />;
    if (state.kind === 'current' && state.next)
      next = `Next: ${state.next.title} at ${clock(state.next.plannedStart, zone)}`;
  } else if (state.kind === 'reconcile') {
    eyebrow = 'Earlier today';
    title = 'Update earlier blocks';
    context = `${state.blocks.length} block${state.blocks.length === 1 ? '' : 's'} without a decision yet`;
    action = (
      <a className="button" href={`#block-${state.blocks[0].id}`}>
        Update earlier blocks
      </a>
    );
  } else {
    eyebrow = 'Nothing more planned';
    title = 'That is the plan for today';
    context = 'Add a block if something comes up; the review is in the header.';
    action = <PressButton press="add-block">Add a block</PressButton>;
  }
  return (
    <section
      className={`launcher${state.kind === 'running' ? ' is-live' : ''}`}
      aria-label="Current focus"
    >
      <div className="launcher-main">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="launcher-meta">{context}</p>
        <p className="launcher-next">{next}</p>
      </div>
      <div className="launcher-action">{action}</div>
    </section>
  );
}
