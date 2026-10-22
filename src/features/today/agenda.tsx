import Link from 'next/link';
import { ArrowRight, Briefcase } from 'lucide-react';
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
import { categoryGroup } from '@/features/review/domain';
import { clock, dayKey, minutes } from '@/lib/time';
import type { ActualSession, TimeBlock } from '@/generated/prisma/client';
import {
  blockResolution,
  formatDuration,
  groupAgenda,
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
};

const sessionLength = (n: number, ended: boolean) =>
  ended && n < 1 ? 'under a minute' : formatDuration(n);
const origin = (b: TimeBlock) =>
  b.routineKey
    ? b.isOverride
      ? 'Changed for this day'
      : 'Routine'
    : 'Added for this day';

/** The day as an open list: a time gutter, Earlier / Now / Later, cancelled blocks apart. */
export function Agenda(props: Props) {
  const { entries, day, today, now } = props;
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
      <h2 id="agenda-heading" className="agenda-heading">
        Agenda
      </h2>
      <FeedbackOutlet channel="blocks" className="mb-3" />
      {!entries.length && (
        <p className="empty">
          {isToday
            ? 'Nothing planned for today.'
            : day < today
              ? 'Nothing was planned for this day.'
              : 'Nothing planned yet.'}{' '}
          <Link className="link" href="/calendar" prefetch={false}>
            Set up routines on Plan <ArrowRight size={14} aria-hidden="true" />
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
              <ol className="plain-list">
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
          <ol className="plain-list">
            {groups.cancelled.map((entry) =>
              entry.kind === 'block' ? (
                <BlockRow key={entry.key} entry={entry} {...props} />
              ) : null,
            )}
          </ol>
        </Disclosure>
      )}
    </section>
  );
}

function RoundRow({ round, zone }: { round: RoundLike; zone: string }) {
  return (
    <li className="agenda-row is-interview">
      <div className="agenda-time">
        <strong>{clock(round.scheduledStart, zone)}</strong>
        {round.scheduledEnd && <span>{clock(round.scheduledEnd, zone)}</span>}
      </div>
      <div className="agenda-body">
        <h3 className="agenda-title">
          <Briefcase size={16} aria-hidden="true" className="category-icon" />
          {round.company} — {round.title}
        </h3>
        <p className="agenda-meta">Interview · not on your schedule</p>
        <div className="agenda-actions">
          <Link
            className="button secondary small"
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
  const recorded = block.sessions.reduce(
    (n, s) => n + minutes(s.startedAt, s.endedAt ?? now),
    0,
  );
  const meta = [
    round ? `${round.company} · Interview` : categoryGroup(block.category),
    origin(block),
    block.sessions.length
      ? `${sessionLength(
          recorded,
          block.sessions.every((s) => s.endedAt),
        )} recorded`
      : null,
    block.skipReason ? `Skipped: ${block.skipReason}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li
      id={`block-${block.id}`}
      className={`agenda-row is-${resolution}${unresolved ? ' is-unresolved' : ''}`}
    >
      <div className="agenda-time">
        <strong>{clock(block.plannedStart, zone)}</strong>
        <span>
          {formatInTimeZone(
            block.plannedEnd,
            zone,
            dayKey(block.plannedEnd, zone) === day ? 'h:mm a' : 'MMM d, h:mm a',
          )}
        </span>
      </div>
      <div className="agenda-body">
        <div className="agenda-head">
          <h3 className="agenda-title">
            {round ? (
              <Briefcase
                size={16}
                aria-hidden="true"
                className="category-icon"
              />
            ) : (
              <CategoryIcon category={block.category} />
            )}
            {block.title}
          </h3>
          <span className={`agenda-status is-${resolution}`}>
            {resolutionText[resolution]}
          </span>
        </div>
        <p className="agenda-meta">{meta}</p>
        <div className="agenda-actions">
          {round && (
            <Link
              className="button secondary small"
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
                className="button secondary small"
              >
                Log time
              </PanelButton>
              <PanelButton
                panel={panelId}
                focus="edit"
                className="button secondary small"
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
          <PanelButton panel={panelId} className="button secondary small">
            Details
          </PanelButton>
        </div>
      </div>
      <SidePanel id={panelId} title={block.title}>
        <p className="muted">
          {clock(block.plannedStart, zone)}–{clock(block.plannedEnd, zone)} ·{' '}
          {meta}
        </p>
        {block.description && <p>{block.description}</p>}
        {block.sessions.length > 0 && (
          <ul className="plain-list panel-sessions">
            {block.sessions.map((s) => (
              <li className="recorded" key={s.id}>
                Recorded {formatInTimeZone(s.startedAt, zone, 'MMM d, h:mm a')}–
                {s.endedAt
                  ? formatInTimeZone(s.endedAt, zone, 'MMM d, h:mm a')
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
    </li>
  );
}
