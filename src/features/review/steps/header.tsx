import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageShortcuts } from '@/components/shortcuts';
import { UtilityMenu } from '@/components/utility-menu';
import { shiftDay } from '@/lib/day';
import { reviewSummaryLine } from '../domain';
import { STEPS, shortWeekLabel, weekLabel } from '../labels';
import type { ReviewView } from '../page-data';

/** The page head: the week, its navigation, Details and Look back, and the steps. */
export function ReviewHeader({ v }: { v: ReviewView }) {
  const {
    thisWeek,
    monday,
    nextMonday,
    step,
    s,
    hasNext,
    status,
    weekWord,
    href,
  } = v;
  return (
    <>
      <PageShortcuts
        shortcuts={[]}
        prev={href(step, shiftDay(monday, -7))}
        next={hasNext ? href(step, nextMonday) : undefined}
      />
      <header className="today-head is-review">
        <div className="today-head-row">
          <div className="today-title">
            <h1>Weekly review</h1>
            <span className="today-date" aria-label={weekLabel(monday)}>
              {shortWeekLabel(monday)}
            </span>
            <nav className="day-nav" aria-label="Week navigation">
              <Link
                className="button secondary small day-nav-step"
                href={href(step, shiftDay(monday, -7))}
                aria-label="Earlier week"
                prefetch={false}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </Link>
              {/* Earlier / Later, so the stepper's Next week keeps its name to itself. */}
              {hasNext && (
                <Link
                  className="button secondary small day-nav-step"
                  href={href(step, nextMonday)}
                  aria-label="Later week"
                  prefetch={false}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              )}
              {monday !== thisWeek && (
                <Link
                  className="button secondary small"
                  href={href(step, thisWeek)}
                  prefetch={false}
                >
                  This week
                </Link>
              )}
            </nav>
          </div>
          <UtilityMenu>
            <Link
              className="link-button today-util"
              href={href('details')}
              aria-current={step === 'details' ? 'page' : undefined}
              prefetch={false}
            >
              Details
            </Link>
            <Link
              className="link-button today-util"
              href="/review/look-back"
              prefetch={false}
            >
              Look back
            </Link>
          </UtilityMenu>
        </div>
        <p className="today-summary">
          {/* One span: the summary is a flex row and would wrap at every text node. */}
          <span>
            <span className="review-week-phone">
              {shortWeekLabel(monday)} ·{' '}
            </span>
            {weekWord} · {reviewSummaryLine(status, s.totals, s.focus.actual)}
          </span>
        </p>
      </header>
      <nav className="stepper" aria-label="Review steps">
        {STEPS.map(([key, title], i) => (
          <Link
            key={key}
            href={href(key)}
            aria-current={step === key ? 'step' : undefined}
            prefetch={false}
          >
            <span className="step-number" aria-hidden="true">
              {i + 1}
            </span>
            {title}
          </Link>
        ))}
      </nav>
    </>
  );
}
