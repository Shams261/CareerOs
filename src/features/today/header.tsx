import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { DateJump } from '@/components/date-jump';
import { Disclosure } from '@/components/disclosure';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { shiftDay } from '@/features/schedule/domain';
import { BlockForm } from '@/features/schedule/forms';
import { PanelButton } from './panels';
import { UtilityMenu } from './utility-menu';
import type { ReactNode } from 'react';

/**
 * The Today header: heading and date, day navigation, the utilities (Activity, Notes, Add,
 * Review day) and one factual summary line. Narrow screens fold the utilities into More.
 */
export function TodayHeader({
  day,
  today,
  zone,
  bounds,
  summary,
  noteCount,
  reviewed,
  goals,
  utilitiesExtra,
}: {
  day: string;
  today: string;
  zone: string;
  bounds: { start: Date };
  summary: string;
  noteCount: number;
  /** null when the day cannot be reviewed yet (a future date). */
  reviewed: boolean | null;
  goals: { id: string; title: string }[];
  utilitiesExtra?: ReactNode;
}) {
  const isToday = day === today;
  return (
    <header className="today-head">
      <div className="today-head-row">
        <div className="today-title">
          <h1>
            {isToday ? 'Today' : day < today ? 'Past day' : 'Upcoming day'}
          </h1>
          <p className="today-date">
            {formatInTimeZone(bounds.start, zone, 'EEEE, MMMM d')}
          </p>
        </div>
        <nav className="day-nav" aria-label="Day navigation">
          <Link
            className="button secondary"
            href={`/today?date=${shiftDay(day, -1)}`}
            aria-label="Previous day"
            prefetch={false}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Link>
          {!isToday && (
            <Link className="button secondary" href="/today" prefetch={false}>
              Today
            </Link>
          )}
          <Link
            className="button secondary"
            href={`/today?date=${shiftDay(day, 1)}`}
            aria-label="Next day"
            prefetch={false}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
          <DateJump key={day} value={day} path="/today" label="Open a date" />
        </nav>
        <UtilityMenu>
          {isToday && (
            <PanelButton panel="activity" className="button secondary small">
              Activity
            </PanelButton>
          )}
          {isToday && (
            <PanelButton panel="notes" className="button secondary small">
              Notes{noteCount ? ` · ${noteCount}` : ''}
            </PanelButton>
          )}
          {reviewed !== null && (
            <PanelButton panel="review" className="button secondary small">
              {reviewed ? 'Edit review' : 'Review day'}
            </PanelButton>
          )}
          {utilitiesExtra}
        </UtilityMenu>
      </div>
      <p className="today-summary">
        {summary}
        {reviewed && <span className="pill success">Reviewed</span>}
      </p>
      <FeedbackOutlet channel="review" className="mt-2" />
      <Disclosure
        label="Add a block"
        variant="secondary"
        shortcut="add-block"
        draft={`block:${day}`}
        className="today-add"
      >
        <BlockForm day={day} zone={zone} goals={goals} />
      </Disclosure>
    </header>
  );
}
