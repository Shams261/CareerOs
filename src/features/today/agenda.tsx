import Link from 'next/link';
import { ArrowRight, Briefcase, ChevronRight } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { Disclosure } from '@/components/disclosure';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { CategoryIcon } from '@/components/category-icon';
import { ResourceLink } from '@/components/resource-link';
import {
  BlockForm,
  ExecutionControls,
  ManualSessionForm,
} from '@/features/schedule/forms';
import { BlockRowShell } from '@/features/schedule/block-row';
import { rowMeta } from '@/features/schedule/row';
import { categoryGroup } from '@/features/review/domain';
import { dayKey, minutes } from '@/lib/time';
import type { ActualSession, TimeBlock } from '@/generated/prisma/client';
import {
  blockResolution,
  blockTitle,
  formatDuration,
  groupAgenda,
  hhmm,
  resolutionText,
  type AgendaEntry,
  type RoundLike,
} from './domain';
import { PanelButton, SidePanel } from './panels';

type Block = TimeBlock & { sessions: ActualSession[] };
type Props = {
  entries: AgendaEntry[];
  blocks: Block[];
  day: string;
  today: string;
  zone: string;
  now: Date;
  goals: { id: string; title: string }[];
  /** The block the launcher already offers Start or Stop for. */
  launcherBlockId: string | null;
  /** Whether the owner has routines; the empty day then points at the plan, not at setup. */
  hasRoutines?: boolean;
};

const sessionLength = (n: number, ended: boolean) =>
  ended && n < 1 ? 'under a minute' : formatDuration(n);
const origin = (b: TimeBlock) =>
  b.routineKey
    ? b.isOverride
      ? 'Changed for this day'
      : 'Routine'
    : 'Added for this day';

/** The day as an open list with a timeline rail: Earlier / Now / Later, cancelled apart. */
export function Agenda(props: Props) {
  const { entries, day, today, now, zone, goals } = props;
  const isToday = day === today;
  const groups = groupAgenda(entries, now, isToday);
  const sections: [string, AgendaEntry[]][] = isToday
    ? [
        ['Earlier', groups.earlier],
        ['Now', groups.now],
        ['Later', groups.later],
      ]
    : [['', groups.later]];
  return (
    <section className="agenda" aria-labelledby="agenda-heading">
      <div className="agenda-head">
        <h2 id="agenda-heading" className="agenda-heading">
          Your day
        </h2>
        <Disclosure
          label="Add a block"
          variant="link"
          shortcut="add-block"
          draft={`block:${day}`}
          className="agenda-add"
        >
          <BlockForm day={day} zone={zone} goals={goals} />
        </Disclosure>
      </div>
      <FeedbackOutlet channel="blocks" className="mb-3" />
      {!entries.length && (
        <p className="empty">
          {isToday
            ? 'Nothing planned for today.'
            : day < today
              ? 'Nothing was planned for this day.'
              : 'Nothing planned yet.'}{' '}
          <Link className="link" href="/calendar" prefetch={false}>
            {props.hasRoutines
              ? 'Open the week on Plan'
              : 'Set up routines on Plan'}{' '}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </p>
      )}
      <ol className="plain-list agenda-list">
        {sections.map(([label, list]) =>
          list.length ? (
            <li key={label || 'all'} className="agenda-group">
              {label && (
                <p
                  className={`agenda-label${label === 'Now' ? ' is-now' : ''}`}
                >
                  {label}
                </p>
              )}
              <ol className="plain-list agenda-rows">
                {list.map((entry) =>
                  entry.kind === 'block' ? (
                    <BlockRow key={entry.key} entry={entry} {...props} />
                  ) : (
                    <RoundRow
                      key={entry.key}
                      round={entry.round}
                      zone={props.zone}
                    />
                  ),
                )}
              </ol>
            </li>
          ) : null,
        )}
      </ol>
      {groups.cancelled.length > 0 && (
        <Disclosure
          variant="link"
          label={`Cancelled · ${groups.cancelled.length}`}
          className="agenda-cancelled"
        >
          <ol className="plain-list agenda-rows is-cancelled-list">
            {groups.cancelled.map((entry) =>
              entry.kind === 'block' ? (
                <BlockRow key={entry.key} entry={entry} {...props} />
              ) : null,
            )}
          </ol>
        </Disclosure>
      )}
      <p className="agenda-foot">
        <Link className="link" href="/calendar" prefetch={false}>
          View full schedule <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </p>
    </section>
  );
}

function RoundRow({ round, zone }: { round: RoundLike; zone: string }) {
  return (
    <li className="agenda-row is-interview">
      <span className="agenda-time">{hhmm(round.scheduledStart, zone)}</span>
      <span className="agenda-dot" aria-hidden="true" />
      <div className="agenda-body">
        <h3 className="agenda-title">
          <Briefcase size={16} aria-hidden="true" className="category-icon" />
          {round.company} — {round.title}
        </h3>
        <p className="agenda-meta">
          Interview
          {round.scheduledEnd
            ? ` · Until ${hhmm(round.scheduledEnd, zone)}`
            : ''}
          {' · not on your schedule'}
        </p>
      </div>
      <div className="agenda-side">
        <div className="agenda-actions">
          <Link
            className="link-button"
            href={`/jobs/${round.applicationId}#round-${round.id}`}
            prefetch={false}
          >
            Open prep{round.openPrep ? ` (${round.openPrep} open)` : ''}
          </Link>
          {round.meetingUrl && (
            <ResourceLink url={round.meetingUrl}>Meeting link</ResourceLink>
          )}
        </div>
      </div>
    </li>
  );
}

function BlockRow({
  entry,
  blocks,
  day,
  today,
  zone,
  now,
  goals,
  launcherBlockId,
}: Props & { entry: Extract<AgendaEntry, { kind: 'block' }> }) {
  const block = blocks.find((b) => b.id === entry.block.id)!;
  const round = entry.round;
  const resolution = blockResolution(entry.block, now);
  const unresolved =
    resolution === 'not-recorded' || resolution === 'needs-update';
  const panelId = `block:${block.id}`;
  const meta = rowMeta(block, round, now, zone);
  const title = blockTitle(block, round);
  const panelMeta = [
    round ? `${round.company} · Interview` : categoryGroup(block.category),
    origin(block),
  ].join(' · ');
  return (
    <BlockRowShell
      id={`block-${block.id}`}
      resolution={resolution}
      unresolved={unresolved}
      time={
        <>
          {hhmm(block.plannedStart, zone)}
          {dayKey(block.plannedEnd, zone) !== day && (
            <span className="sr-only">
              {' '}
              to {formatInTimeZone(block.plannedEnd, zone, 'MMM d, HH:mm')}
            </span>
          )}
        </>
      }
      icon={
        round ? (
          <Briefcase size={16} aria-hidden="true" className="category-icon" />
        ) : (
          <CategoryIcon category={block.category} size={16} />
        )
      }
      title={title}
      meta={meta}
      status={resolutionText[resolution]}
      side={
        <>
          <div className="agenda-actions">
            {round && (
              <Link
                className="link-button"
                href={`/jobs/${round.applicationId}#round-${round.id}`}
                prefetch={false}
              >
                Open prep{round.openPrep ? ` (${round.openPrep} open)` : ''}
              </Link>
            )}
            {unresolved && (
              <>
                <PanelButton
                  panel={panelId}
                  focus="log"
                  className="link-button"
                >
                  Log time
                </PanelButton>
                <PanelButton
                  panel={panelId}
                  focus="edit"
                  className="link-button"
                >
                  Reschedule
                </PanelButton>
              </>
            )}
            <ExecutionControls
              block={block}
              canStart={day === today}
              hideStart={launcherBlockId === block.id}
              more
            />
          </div>
          <PanelButton
            panel={panelId}
            className="agenda-details"
            aria-label={`Details: ${title}`}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </PanelButton>
        </>
      }
    >
      <SidePanel id={panelId} title={title}>
        <p className="muted">
          {hhmm(block.plannedStart, zone)}–{hhmm(block.plannedEnd, zone)} ·{' '}
          {panelMeta}
        </p>
        {block.description && <p>{block.description}</p>}
        {block.skipReason && (
          <p className="muted">Skipped: {block.skipReason}</p>
        )}
        {block.sessions.length > 0 && (
          <ul className="plain-list panel-sessions">
            {block.sessions.map((s) => (
              <li className="recorded" key={s.id}>
                Recorded {formatInTimeZone(s.startedAt, zone, 'MMM d, HH:mm')}–
                {s.endedAt
                  ? formatInTimeZone(s.endedAt, zone, 'MMM d, HH:mm')
                  : 'running'}{' '}
                ·{' '}
                {sessionLength(
                  minutes(s.startedAt, s.endedAt ?? now),
                  !!s.endedAt,
                )}
                {s.notes ? ` · ${s.notes}` : ''}
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-4" data-panel-focus="log" tabIndex={-1}>
          Log time
        </h3>
        <ManualSessionForm block={block} day={day} zone={zone} />
        <h3 className="mt-5" data-panel-focus="edit" tabIndex={-1}>
          Edit this day
        </h3>
        <BlockForm block={block} day={day} zone={zone} goals={goals} />
      </SidePanel>
    </BlockRowShell>
  );
}
