import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { DateJump } from '@/components/date-jump';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { shiftDay } from '@/features/schedule/domain';
import { PanelButton, PressButton } from './panels';
import { LiveMinutes } from './live-summary';
import { UtilityMenu } from './utility-menu';
import { DailyLine } from './daily-line-card';
import type { DayPart } from './daily-line';

/**
 * The Today header (WI-063, WI-065): the heading with the date and the day arrows, one More menu
 * for the utilities (date, Activity, Notes, Add, Review day, Edit goal), a short cheer line and
 * the day's facts as chips. Close the Day stays outside More in the evening, since it is the
 * day's decision. "Add a block" also lives in the agenda heading.
 */
export function TodayHeader({
  day,
  today,
  zone,
  bounds,
  summary,
  running,
  renderedAt,
  noteCount,
  reviewed,
  closing = false,
  rested = false,
  cheer = '',
  goalChip = null,
  goalAction = null,
  daily = null,
}: {
  day: string;
  today: string;
  zone: string;
  bounds: { start: Date };
  summary: {
    completed: number;
    planned: number;
    plannedMinutes: number;
    recordedMinutes: number;
  };
  running: boolean;
  renderedAt: string;
  noteCount: number;
  /** null when the day cannot be reviewed yet (a future date). */
  reviewed: boolean | null;
  /** Close the Day replaces Review day (WI-029). */
  closing?: boolean;
  /** The owner marked this day as rest (WI-028). */
  rested?: boolean;
  /** One short line under the title that cheers the facts on (WI-065); today only. */
  cheer?: string;
  /** The goal as a chip that opens its panel (WI-065); today only. */
  goalChip?: ReactNode;
  /** Edit goal or Set a goal, kept in More (WI-063). */
  goalAction?: ReactNode;
  /** The greeting and the day's quotation, with the part of the day for the tint (WI-073). */
  daily?: { part: DayPart; name: string | null } | null;
}) {
  const isToday = day === today;
  return (
    <header className={`today-head${isToday ? '' : ' is-other-day'}`}>
      <div className="today-head-row">
        <div className="today-title">
          <h1>
            {isToday ? 'Today' : day < today ? 'Past day' : 'Upcoming day'}
          </h1>
          <span className="today-date">
            <span className="today-date-long">
              {formatInTimeZone(bounds.start, zone, 'EEEE, d MMMM')}
            </span>
            {/* One header row on a phone (WI-049): the short date. */}
            <span className="today-date-short" aria-hidden="true">
              {formatInTimeZone(bounds.start, zone, 'EEE d MMM')}
            </span>
          </span>
          <nav className="day-nav" aria-label="Day navigation">
            <Link
              className="button secondary small day-nav-step"
              href={`/today?date=${shiftDay(day, -1)}`}
              aria-label="Previous day"
              prefetch={false}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </Link>
            <Link
              className="button secondary small day-nav-step"
              href={`/today?date=${shiftDay(day, 1)}`}
              aria-label="Next day"
              prefetch={false}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
            {!isToday && (
              <Link
                className="button secondary small"
                href="/today"
                prefetch={false}
              >
                Today
              </Link>
            )}
          </nav>
        </div>
        {closing && reviewed === false && (
          <PanelButton panel="review" className="button secondary small">
            Close the day
          </PanelButton>
        )}
        <UtilityMenu>
          <span className="today-util-date">
            <DateJump key={day} value={day} path="/today" label="Open a date" />
          </span>
          {isToday && (
            <PanelButton panel="activity" className="link-button today-util">
              Activity <ArrowUpRight size={14} aria-hidden="true" />
            </PanelButton>
          )}
          {isToday && (
            <PanelButton panel="notes" className="link-button today-util">
              Notes{noteCount ? ` · ${noteCount}` : ''}
            </PanelButton>
          )}
          <PressButton press="add-block" className="button secondary">
            <Plus size={14} aria-hidden="true" /> Add
          </PressButton>
          {reviewed !== null && !(closing && reviewed === false) && (
            <PanelButton panel="review" className="button secondary">
              {reviewed ? 'Edit review' : 'Review day'}
            </PanelButton>
          )}
          {goalAction}
        </UtilityMenu>
      </div>
      {/* The band (WI-075): the greeting large, the quotation and a clock, today only. */}
      {isToday && daily && (
        <DailyLine day={day} part={daily.part} name={daily.name} zone={zone} />
      )}
      {/* The facts as three chips, with one short line that cheers them on (WI-065). */}
      {cheer && <p className="today-cheer">{cheer}</p>}
      <ul className="plain-list today-chips" aria-label="The day in numbers">
        <li className="today-chip">
          <span className="today-chip-label">
            {isToday ? 'Focused today' : 'Focused'}
          </span>
          <strong>
            <LiveMinutes
              minutes={summary.recordedMinutes}
              running={running}
              renderedAt={renderedAt}
              day={day}
            />
          </strong>
        </li>
        <li className="today-chip">
          <span className="today-chip-label">
            {isToday ? "Today's plan" : 'Plan'}
          </span>
          <strong>
            {summary.planned
              ? `${summary.completed} of ${summary.planned} block${summary.planned === 1 ? '' : 's'}`
              : 'Nothing planned'}
          </strong>
        </li>
        {goalChip && <li className="today-chip is-goal">{goalChip}</li>}
        {reviewed && (
          <li>
            <span className="pill success">Reviewed</span>
          </li>
        )}
        {rested && (
          <li>
            <span className="pill">Rest day</span>
          </li>
        )}
      </ul>
      <FeedbackOutlet channel="review" className="mt-2" />
    </header>
  );
}
