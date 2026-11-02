import { RumiPose } from '@/features/agent/pose';
import Link from 'next/link';
import { ArrowRight, Briefcase } from 'lucide-react';
import { CategoryIcon } from '@/components/category-icon';
import { hhmm } from '@/lib/time';
import { BlockRowShell } from '@/features/schedule/block-row';
import {
  blockResolution,
  blockTitle,
  resolutionText,
  rowMeta,
} from '@/features/schedule/row';
import { formatMinutes } from '../domain';
import { WeekSummary } from '@/features/agent/summary-card';
import { weekday } from '../labels';
import type { ReviewView } from '../page-data';

/** Step 1, The week: planned against recorded per day, the week in short, what is left to decide. */
export function WeekStep({ v }: { v: ReviewView }) {
  const {
    now,
    zone,
    monday,
    w,
    s,
    habitLine,
    summaryShown,
    summary,
    weekEmpty,
    href,
  } = v;
  return (
    <>
      {weekEmpty && (
        // An empty week says what to do and what this step will show (WI-059).
        <section className="card setup-card" aria-labelledby="week-heading">
          <RumiPose pose="sitting" size={104} className="setup-pose" />
          <p className="eyebrow">Start here</p>
          <h2 id="week-heading">Nothing planned this week</h2>
          <p>
            Once blocks are planned, this shows planned against recorded time
            for each day, and what is left to decide.
          </p>
          <div className="actions">
            <Link className="button" href="/calendar" prefetch={false}>
              Plan this week <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <Link
              prefetch={false}
              className="button secondary"
              href={href('reflect')}
            >
              Reflect anyway
            </Link>
          </div>
        </section>
      )}
      {!weekEmpty && (
        <>
          <section className="card" aria-labelledby="week-heading">
            <h2 id="week-heading">Planned versus done</h2>
            {/* One facts line instead of a third copy of the bar (WI-097). */}
            <p className="status-line review-facts">
              <strong>{formatMinutes(s.focus.actual)} focused</strong> of{' '}
              {formatMinutes(s.focus.planned)} planned
            </p>
            <div
              className="week-chart mt-4"
              role="img"
              aria-label={`Planned and recorded minutes per day: ${s.days
                .map(
                  (d) =>
                    `${weekday(d.day)} ${formatMinutes(d.planned)} planned, ${formatMinutes(d.actual)} recorded`,
                )
                .join('; ')}`}
            >
              {s.days.map((d) => {
                const top = Math.max(
                  1,
                  ...s.days.map((x) => Math.max(x.planned, x.actual)),
                );
                const pct = (n: number) => `${Math.round((n / top) * 100)}%`;
                return (
                  <div
                    className={`week-col${d.day === w.today ? ' is-today' : ''}`}
                    key={d.day}
                    title={`${weekday(d.day)}: ${formatMinutes(d.planned)} planned · ${formatMinutes(d.actual)} recorded`}
                  >
                    <div className="week-bars">
                      <span
                        className="week-bar-p"
                        style={{ height: pct(d.planned) }}
                      />
                      <span
                        className="week-bar-a"
                        style={{ height: pct(d.actual) }}
                      />
                    </div>
                    <span className="week-col-label">{weekday(d.day)}</span>
                  </div>
                );
              })}
            </div>
            <p className="status-line">
              <span className="legend legend-p">Planned</span>
              <span className="legend legend-a">Recorded</span>
            </p>
            {habitLine && <p className="review-patterns">{habitLine}</p>}
            {/* A summary, not the week again (WI-054): what is left to decide, then a
                way to every day. */}
            {/* WI-110: Rumi's two sentences above the summary, on a press. */}
            {summaryShown && <WeekSummary monday={monday} />}
            <section
              className="review-summary"
              aria-labelledby="summary-heading"
            >
              <h3 id="summary-heading">
                The week in short{' '}
                <span className="muted">· {summary.line}</span>
              </h3>
              {s.rows.length > 0 && (
                <ul className="plain-list review-kinds">
                  {s.rows.map((r) => (
                    <li key={r.label}>
                      <span>{r.label}</span>
                      <span className="muted">
                        {formatMinutes(r.actual)} recorded of{' '}
                        {formatMinutes(r.planned)} planned
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {summary.open.length > 0 && (
                <>
                  <h4>Still to decide</h4>
                  <ol className="plain-list agenda-rows">
                    {summary.open.map(({ day, item: b }) => {
                      const resolution = blockResolution(b, now);
                      return (
                        <BlockRowShell
                          key={b.id}
                          resolution={resolution}
                          time={hhmm(b.plannedStart, zone)}
                          icon={
                            b.interviewRoundId ? (
                              <Briefcase
                                size={16}
                                aria-hidden="true"
                                className="category-icon"
                              />
                            ) : (
                              <CategoryIcon category={b.category} size={16} />
                            )
                          }
                          title={
                            <Link href={`/today?date=${day}`} prefetch={false}>
                              {blockTitle(b, null)}
                            </Link>
                          }
                          meta={`${weekday(day)} · ${rowMeta(b, null, now, zone)}`}
                          status={resolutionText[resolution]}
                        />
                      );
                    })}
                  </ol>
                  {summary.more > 0 && (
                    <p className="muted">And {summary.more} more.</p>
                  )}
                </>
              )}
            </section>
            <div className="step-foot">
              <Link
                className="button secondary"
                href={`/calendar?date=${monday}`}
                prefetch={false}
              >
                See every day on Plan
              </Link>
              <Link prefetch={false} className="button" href={href('reflect')}>
                Next: Reflect <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </section>
        </>
      )}
    </>
  );
}
