import { RumiPose } from '@/features/agent/pose';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { dayKey, hhmm, weekdayDate } from '@/lib/time';
import { shiftDay } from '@/lib/day';
import {
  closeWeekLine,
  hasReflection,
  lastReviewLine,
  MAX_PRIORITIES,
} from '../domain';
import {
  CompleteReviewForm,
  PrepareNextWeekForm,
  PriorityForm,
  PriorityList,
} from '../forms';
import { aiConfig } from '@/lib/env';
import { DraftWeekButton } from '@/features/agent/draft-button';
import { nextWeek } from '@/features/agent/draft';
import { AGENT_NAME } from '@/features/agent/constants';
import { shortWeekLabel } from '../labels';
import { Fact } from './parts';
import type { ReviewView } from '../page-data';

/** Step 3, Next week: priorities, the next week card and closing the week (WI-097). */
export function PlanStep({ v }: { v: ReviewView }) {
  const {
    zone,
    today,
    thisWeek,
    monday,
    nextMonday,
    planning,
    w,
    next,
    goals,
    remindersOn,
    priorities,
    lastQuote,
    href,
  } = v;
  return (
    // Priorities and next week on the left; closing the week in the rail (WI-097).
    <div className="today-workspace is-today review-workspace">
      <div className="jobs-main">
        <section className="card" aria-labelledby="priorities-heading">
          <h2 id="priorities-heading">
            Priorities · {shortWeekLabel(nextMonday)}{' '}
            <span className="muted">
              · {priorities.length} of {MAX_PRIORITIES}
            </span>
          </h2>
          <PriorityList priorities={priorities} editable />
          <PriorityForm
            weekStart={monday}
            count={priorities.length}
            goals={goals}
          />
          {!planning && (
            <p className="status-line mt-5">
              <span>
                The week after this one is already planned. Prepare is for the
                coming week.
              </span>
              <Link
                prefetch={false}
                className="link"
                href={href('plan', thisWeek)}
              >
                Open this week&apos;s review{' '}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </p>
          )}
        </section>
        {next && (
          <section className="card" aria-labelledby="next-heading">
            <h2 id="next-heading">Next week · {shortWeekLabel(nextMonday)}</h2>
            {next.jobs.interviews.length > 0 && (
              <ul className="plain-list next-rows">
                {next.jobs.interviews.map((i) => (
                  <li key={i.id} className="next-row">
                    <span className="next-row-when">
                      {weekdayDate(dayKey(i.start, zone))} ·{' '}
                      {hhmm(i.start, zone)}
                    </span>
                    <Link
                      className="link"
                      href={`/jobs/${i.applicationId}#round-${i.id}`}
                      prefetch={false}
                    >
                      Prepare {i.title}
                    </Link>
                    <span className="muted">
                      {i.company}
                      {i.prepTotal
                        ? ` · ${i.prepDone} of ${i.prepTotal} prep done`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {next.jobs.followUps.length > 0 && (
              <ul className="plain-list next-rows">
                {next.jobs.followUps.map((a) => (
                  <li key={a.id} className="next-row">
                    <span className="next-row-when">
                      {weekdayDate(
                        a.nextActionDate!.toISOString().slice(0, 10),
                      )}
                    </span>
                    <Link
                      className="link"
                      href={`/jobs/${a.id}`}
                      prefetch={false}
                    >
                      {a.nextAction ?? 'Follow up'}
                    </Link>
                    <span className="muted">{a.company}</span>
                  </li>
                ))}
              </ul>
            )}
            {/* The facts that matter for planning; the reminders fold in (WI-097). */}
            <dl className="job-facts review-strip">
              <Fact label="Days planned" value={`${next.generatedDays} of 7`} />
              {next.dsa.topic && (
                <Fact label="DSA topic" value={next.dsa.topic} />
              )}
              <Fact label="DSA revisions due" value={next.dsa.revisionsDue} />
              {next.learning.reviewsDue > 0 && (
                <Fact
                  label="Technical reviews due"
                  value={next.learning.reviewsDue}
                />
              )}
              <Fact
                label="Applications needing action"
                value={next.jobs.actionRequired}
              />
              <Fact
                label="Reminders on"
                value={
                  <>
                    {remindersOn.length
                      ? remindersOn.map((r) => r.title).join(', ')
                      : 'None'}{' '}
                    ·{' '}
                    <Link
                      prefetch={false}
                      className="link"
                      href="/settings#notifications-heading"
                    >
                      Change
                    </Link>
                  </>
                }
              />
            </dl>
            <PrepareNextWeekForm monday={next.bounds.monday} />
            {/* WI-107: once the routines are on next week, Rumi drafts around them. */}
            {aiConfig() &&
              // Only the real next week: the draft plans from today.
              nextMonday === nextWeek(today)[0] &&
              (next.generatedDays === 7 ? (
                <DraftWeekButton />
              ) : (
                <p className="prep-note">
                  Prepare next week first; then {AGENT_NAME} can draft the study
                  blocks around your routines.
                </p>
              ))}
          </section>
        )}
      </div>
      <aside className="today-rail" aria-label="Closing the week">
        <section
          className="card rail-card close-week has-corner-pose"
          aria-labelledby="close-heading"
        >
          <RumiPose pose="high-five" size={64} className="corner-pose" />
          <h2 id="close-heading">Close the week</h2>
          <p className="review-rail-line">
            {closeWeekLine({
              completed: !!w.review?.completedAt,
              reflected: hasReflection(w.review),
              priorities: priorities.length,
              generatedDays: next ? next.generatedDays : null,
            })}
          </p>
          <CompleteReviewForm
            weekStart={monday}
            completedAt={w.review?.completedAt ?? null}
          />
        </section>
        {w.lastReview && (
          <section className="card rail-card" aria-labelledby="last-heading">
            <h2 id="last-heading">Last week&apos;s review</h2>
            <p className="review-rail-line">{lastReviewLine(w.lastReview)}</p>
            {lastQuote && <p className="muted review-quote">“{lastQuote}”</p>}
            <Link
              prefetch={false}
              className="link"
              href={href('reflect', shiftDay(monday, -7))}
            >
              Open last week
            </Link>
          </section>
        )}
      </aside>
    </div>
  );
}
