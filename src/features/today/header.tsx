import Link from 'next/link';
import { ArrowUpRight, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { DateJump } from '@/components/date-jump';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { shiftDay } from '@/features/schedule/domain';
import { PanelButton, PressButton } from './panels';
import { LiveSummary } from './live-summary';
import { UtilityMenu } from './utility-menu';

/**
 * The Today header: the heading with the date beside it and compact day navigation, the
 * utilities (Activity, Notes, Review day; behind More on narrow screens) and one factual
 * summary line. "Add a block" lives in the agenda heading.
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
  facts = '',
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
  /** Yesterday and the week so far as counts (WI-059); empty when there are none. */
  facts?: string;
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
            <DateJump key={day} value={day} path="/today" label="Open a date" />
          </nav>
        </div>
        <UtilityMenu>
          {/* On a phone the date field moves into More, so the header stays one row. */}
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
          {reviewed !== null && (
            <PanelButton panel="review" className="button secondary">
              {closing
                ? 'Close the day'
                : reviewed
                  ? 'Edit review'
                  : 'Review day'}
            </PanelButton>
          )}
        </UtilityMenu>
      </div>
      <p className="today-summary">
        <LiveSummary {...summary} running={running} renderedAt={renderedAt} />
        {reviewed && <span className="pill success">Reviewed</span>}
        {rested && <span className="pill">Rest day</span>}
      </p>
      {facts && <p className="today-facts">{facts}</p>}
      <FeedbackOutlet channel="review" className="mt-2" />
    </header>
  );
}
