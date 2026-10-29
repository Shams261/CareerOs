'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { MILESTONE_ORDER, type Milestone } from './home';

const SEEN_KEY = 'silsila-week-milestone';

/**
 * This week on Today's rail (WI-065, ADR-027): blocks done of blocks planned, a thin bar and one
 * line. When the week crosses a milestone since this device last saw it (first block, half,
 * all), the bar and the line celebrate once, quietly; reduced motion shows the same state still.
 * The bar is the one place Silsila draws progress, by the owner's choice; it is never a score.
 */
export function WeekCard({
  week,
  weekKey,
  facts,
}: {
  week: {
    done: number;
    planned: number;
    ratio: number;
    milestone: Milestone;
    line: string;
  };
  /** The week's Monday, so a new week starts from no milestone. */
  weekKey: string;
  /** Yesterday and the week so far as counts (WI-059). */
  facts: string;
}) {
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    let seen: { week: string; milestone: Milestone } | null = null;
    try {
      seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? 'null');
    } catch {
      seen = null;
    }
    const before =
      seen?.week === weekKey ? MILESTONE_ORDER.indexOf(seen.milestone) : 0;
    const now = MILESTONE_ORDER.indexOf(week.milestone);
    try {
      localStorage.setItem(
        SEEN_KEY,
        JSON.stringify({ week: weekKey, milestone: week.milestone }),
      );
    } catch {
      /* storage unavailable: no celebration, the facts still show */
    }
    if (now <= before) return;
    // After paint, so the bar grows from its old width; once per milestone per device.
    const start = setTimeout(() => setCelebrate(true), 50);
    const stop = setTimeout(() => setCelebrate(false), 2400);
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
    };
  }, [week.milestone, weekKey]);
  const percent = Math.round(week.ratio * 100);
  return (
    <section
      className={`card week-card${celebrate ? ' is-celebrating' : ''}`}
      aria-labelledby="week-card-heading"
    >
      <div className="week-card-head">
        <h2 id="week-card-heading">This week</h2>
        <span className="muted">
          {week.planned
            ? `${week.done} of ${week.planned} block${week.planned === 1 ? '' : 's'}`
            : 'Nothing planned'}
        </span>
      </div>
      {week.planned > 0 && (
        <div
          className="week-bar"
          role="progressbar"
          aria-label="Blocks done this week"
          aria-valuemin={0}
          aria-valuemax={week.planned}
          aria-valuenow={week.done}
          aria-valuetext={`${week.done} of ${week.planned} blocks done`}
        >
          <span className="week-bar-fill" style={{ width: `${percent}%` }} />
        </div>
      )}
      <p className="week-line" aria-live="polite">
        {week.line}
      </p>
      {facts && <p className="muted week-facts">{facts}</p>}
      {/* The whole card opens the week on Plan (WI-080). */}
      <Link
        href="/calendar"
        prefetch={false}
        className="link rail-card-link"
        aria-label="Open this week on Plan"
      >
        Plan <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}
