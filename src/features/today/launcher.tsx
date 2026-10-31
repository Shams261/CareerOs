import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { LiveCountdown, LiveTimer } from '@/features/execution/live';
import {
  focusWindow,
  intentionOf,
  pausedLeft,
  recordedBefore,
} from '@/features/execution/focus-domain';
import { clock } from '@/features/execution/ring';
import { stopUnlinkedAction } from '@/features/schedule/actions';
import { ExecutionControls } from '@/features/schedule/forms';
import { categoryGroup } from '@/features/review/domain';
import { letGoDayAction } from './actions';

import type { TimeBlock } from '@/generated/prisma/client';
import { blockTitle, hhmm, type LauncherState, type RoundLike } from './domain';
import {
  blockResolution,
  recordedMinutes,
  recordedText,
  type BlockLike,
} from '@/features/schedule/row';
import { PanelButton, PressButton } from './panels';

const startsIn = (d: Date, now: Date) => {
  const m = Math.max(1, Math.round((+d - +now) / 60000));
  return m < 60
    ? `${m} min`
    : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
};

/**
 * The compact focus launcher: one surface, one primary action on the right, the timer
 * above it while a session runs. Its child order never changes between states so a save
 * re-renders it in place.
 */
export function Launcher({
  state,
  blocks,
  rounds,
  zone,
  now,
  closing = false,
  closed = false,
  closedLine = '',
  quiet = null,
}: {
  state: LauncherState;
  blocks: TimeBlock[];
  rounds: RoundLike[];
  zone: string;
  now: Date;
  /** From the stop time, the end of the day is Close the day (WI-029). */
  closing?: boolean;
  /** The day was closed or reviewed. */
  closed?: boolean;
  /** The closed day's facts ("3 blocks completed · 1 min recorded · 1h 40m planned"). */
  closedLine?: string;
  /** Yesterday's blocks when none of them was recorded: the launcher says so (WI-059). */
  quiet?: { day: string; planned: number; recorded: number } | null;
}) {
  const full = (id: string) => blocks.find((b) => b.id === id) ?? null;
  const roundOf = (block: { interviewRoundId: string | null } | null) =>
    block?.interviewRoundId
      ? (rounds.find((r) => r.id === block.interviewRoundId) ?? null)
      : null;
  // A quiet yesterday (the facts line already states it) keeps its blocks one link from being
  // let go (WI-059). Until WI-092 the link sat under a "For today" pick; the pick is gone.
  const letGo = quiet ? (
    <ActionForm
      action={letGoDayAction}
      label="Let go of yesterday's blocks"
      broadcast="blocks"
      className="launcher-letgo"
    >
      <input type="hidden" name="day" value={quiet.day} />
      <Button variant="link">Let go of yesterday&apos;s blocks</Button>
    </ActionForm>
  ) : null;
  let eyebrow = '',
    title = '',
    context: React.ReactNode = null,
    action: React.ReactNode = null,
    next: React.ReactNode = null,
    timer: React.ReactNode = null;
  const prepLink = (round: RoundLike) => (
    <Link
      className="link"
      href={`/jobs/${round.applicationId}#round-${round.id}`}
      prefetch={false}
    >
      Open prep{round.openPrep ? ` (${round.openPrep} open)` : ''}{' '}
      <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );
  if (state.kind === 'running') {
    const block = state.block ? full(state.block.id) : null;
    const round = roundOf(block);
    eyebrow = `In session · Since ${hhmm(state.session.startedAt, zone)}`;
    title = block
      ? blockTitle(block, round)
      : (state.session.title ?? categoryGroup(state.session.category));
    const intention = intentionOf(state.session.notes);
    context = (
      <>
        {round
          ? `${round.company} · Interview`
          : block
            ? categoryGroup(block.category)
            : categoryGroup(state.session.category)}
        {round && <> · {prepLink(round)}</>}
        {intention && <span className="launcher-intention">“{intention}”</span>}
      </>
    );
    // Like Focus (WI-060): time left to the block's target, continuing from the time
    // recorded before a pause (WI-068), else time since the start.
    const ring = block
      ? focusWindow({
          startedAt: state.session.startedAt,
          plannedStart: block.plannedStart,
          plannedEnd: block.plannedEnd,
          doneBefore: recordedBefore(
            (block as unknown as BlockLike).sessions.filter((s) => s.endedAt),
          ),
        })
      : null;
    timer = ring ? (
      <LiveCountdown
        startedAt={ring.start.toISOString()}
        target={ring.target.toISOString()}
      />
    ) : (
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
        primaryOnly
      />
    ) : (
      <ActionForm action={stopUnlinkedAction} toast>
        <input type="hidden" name="id" value={state.session.id} />
        <Button>Stop session</Button>
      </ActionForm>
    );
    const after = blocks
      .filter(
        (b) =>
          ['PLANNED', 'IN_PROGRESS'].includes(b.status) &&
          b.id !== block?.id &&
          b.plannedStart > now,
      )
      .sort((a, b) => +a.plannedStart - +b.plannedStart)[0];
    if (after)
      next = `Next: ${blockTitle(after, roundOf(after))} · ${hhmm(after.plannedStart, zone)}`;
  } else if (state.kind === 'current' || state.kind === 'next') {
    const block = full(state.block.id)!;
    const round = roundOf(block);
    // Paused (WI-067): time recorded, no session running; the card says how far it got.
    const withSessions = block as unknown as BlockLike;
    const paused = blockResolution(withSessions, now) === 'paused';
    eyebrow = paused
      ? `Paused · ${recordedText(recordedMinutes(withSessions, now))} so far`
      : `${state.kind === 'current' ? 'Now' : 'Up next'} · ${hhmm(block.plannedStart, zone)}–${hhmm(block.plannedEnd, zone)}`;
    title = blockTitle(block, round);
    // The kind is left out when it only repeats the title ("DSA" under "DSA", WI-058).
    const kind = round
      ? `${round.company} · Interview`
      : categoryGroup(block.category);
    // A paused block says what is left of it, never "Starts in" (WI-068).
    const left = paused
      ? pausedLeft(
          block.plannedStart,
          block.plannedEnd,
          recordedBefore(withSessions.sessions),
        )
      : 0;
    const facts = [
      round || kind.toLowerCase() !== title.toLowerCase() ? kind : null,
      !paused && state.kind === 'next'
        ? `Starts in ${startsIn(block.plannedStart, now)}`
        : null,
      paused || state.kind !== 'next'
        ? `Until ${hhmm(block.plannedEnd, zone)}`
        : null,
    ].filter(Boolean);
    context = (
      <>
        {facts.join(' · ')}
        {round && <> · {prepLink(round)}</>}
      </>
    );
    action = (
      <ExecutionControls
        block={block}
        current
        launcher
        primaryOnly
        resume={paused}
      />
    );
    // The time left, held, in the running countdown's place (WI-070).
    if (paused) {
      const total = +block.plannedEnd - +block.plannedStart;
      const fraction = total > 0 ? Math.min(1, 1 - left / total) : 1;
      timer = (
        <div className="live-countdown is-paused">
          <time className="live-timer launcher-timer">
            {left > 0 ? clock(left) : 'Time is up'}
          </time>
          <span className="live-countdown-of">
            {left > 0
              ? `left of ${Math.round(total / 60_000)} min`
              : `${Math.round(total / 60_000)} min`}
          </span>
          <span
            className="live-countdown-bar"
            role="progressbar"
            aria-label="Session time used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraction * 100)}
          >
            <i style={{ width: `${fraction * 100}%` }} />
          </span>
        </div>
      );
    }
    if (state.kind === 'current' && state.next)
      next = `Next: ${state.next.title} · ${hhmm(state.next.plannedStart, zone)}`;
  } else if (closing && (state.kind === 'reconcile' || state.kind === 'done')) {
    const open = state.kind === 'reconcile' ? state.blocks.length : 0;
    eyebrow = 'End of the day';
    title = 'Close the day';
    context = open
      ? `${open} block${open === 1 ? '' : 's'} without a decision yet`
      : 'Every block has a decision';
    action = (
      <PanelButton panel="review" className="button">
        Close the day
      </PanelButton>
    );
  } else if (state.kind === 'reconcile') {
    eyebrow = 'Earlier today';
    title = 'Update earlier blocks';
    context = `${state.blocks.length} block${state.blocks.length === 1 ? '' : 's'} without a decision yet`;
    action = (
      <a className="button" href={`#block-${state.blocks[0].id}`}>
        Update earlier blocks
      </a>
    );
    next = letGo;
  } else if (closed && state.kind === 'done') {
    // The day is reviewed: its facts, the review one link away, and room for a late block.
    eyebrow = 'Day closed';
    title = 'The day is closed';
    context = closedLine || 'Every block has a decision.';
    next = (
      <PanelButton panel="review" className="link-button">
        Edit review
      </PanelButton>
    );
    action = <PressButton press="add-block">Add a block</PressButton>;
  } else {
    eyebrow = 'Nothing more planned';
    title = 'That is the plan for today';
    context = 'Add a block if something comes up; the review is in the header.';
    action = <PressButton press="add-block">Add a block</PressButton>;
    next = letGo;
  }
  const live = state.kind === 'running';
  return (
    <section
      className={`launcher${live ? ' is-live' : ''}`}
      aria-label="Current focus"
    >
      <div className="launcher-main">
        <p className="eyebrow launcher-eyebrow">
          <span className="launcher-dot" aria-hidden="true" />
          {eyebrow}
        </p>
        <h2>{title}</h2>
        <p className="launcher-meta">{context}</p>
        <p className="launcher-next">{next}</p>
      </div>
      <div className="launcher-side">
        {timer}
        <div className="launcher-action">{action}</div>
      </div>
    </section>
  );
}
