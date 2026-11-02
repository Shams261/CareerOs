import { Suspense } from 'react';
import { FirstRunToday } from '@/features/today/first-run';
import { CalendarAttention } from '@/features/calendar/panel';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { PageShortcuts } from '@/components/shortcuts';
import { owner } from '@/server/db';
import { shiftDay } from '@/lib/day';
import { CategoryOptions } from '@/features/schedule/forms';
import { ExecutionRefresh } from '@/features/execution/refresh';
import { quietYesterday, summaryLine } from '@/features/today/domain';
import { Launcher } from '@/features/today/launcher';
import { Agenda } from '@/features/today/agenda';
import { NudgeCard } from '@/features/nudges/card';
import { DayPrintCard } from '@/features/day-print/print';
import { todayPage } from '@/features/today/page-data';
import { TodayHead } from '@/features/today/sections/head';
import { GoalPanel } from '@/features/today/sections/goal-panel';
import { TodayRail } from '@/features/today/sections/rail';
import { DayPanels } from '@/features/today/sections/day-panels';

export const metadata = { title: 'Today' };

/**
 * Today as an agenda (WI-020): a compact launcher, the day as an open list, one bounded
 * "needs attention" list, and the review, activity and notes behind panels opened on demand.
 * Its reads come from one loader (WI-128); the streamed parts keep their own Suspense.
 */
export default async function Today({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const v = await todayPage(await owner(), await searchParams, new Date());
  const { user, now, day, today, isToday, state, facts } = v;
  return (
    <>
      <ExecutionRefresh />
      <PageShortcuts
        shortcuts={[
          { key: 'n', label: 'Add a block', press: 'add-block' },
          { key: 's', label: 'Start the current block', press: 'start' },
          { key: 't', label: 'Go to today', href: '/today' },
        ]}
        prev={`/today?date=${shiftDay(day, -1)}`}
        next={`/today?date=${shiftDay(day, 1)}`}
      />
      <CategoryOptions />
      {v.firstRun ? (
        <FirstRunToday
          user={user}
          day={day}
          bounds={v.bounds}
          goals={v.goals}
          name={user.name}
        />
      ) : (
        <>
          <TodayHead v={v} />
          {isToday && <GoalPanel v={v} />}
          {v.generationError && (
            <p role="alert" className="form-message mb-5">
              This week could not be planned: {v.generationError}. Check your
              routines on Plan.
            </p>
          )}
          {/* Outside the card: the answer stays visible after the card closes. */}
          {isToday && <FeedbackOutlet channel="nudge" className="mb-4" />}
          {v.nudge && (
            <NudgeCard nudge={v.nudge} day={day} block={v.nudgeBlock} />
          )}
          {/* The Day Print (WI-033): a closed day's records as a picture, unless removed.
              Today's sits in the rail (WI-082); a past day's leads the column. */}
          <FeedbackOutlet channel="day-print" className="mb-4" />
          {v.closedPrint && !isToday && (
            <DayPrintCard
              model={v.closedPrint}
              day={day}
              isToday={isToday}
              ask={user.dayPrint == null}
            />
          )}
          <Suspense fallback={null}>
            <CalendarAttention user={user} />
          </Suspense>
          <div className={`today-workspace${isToday ? ' is-today' : ''}`}>
            {state && (
              <Launcher
                state={state}
                blocks={v.blocks}
                rounds={v.rounds}
                zone={user.timezone}
                now={now}
                closing={v.closing}
                closed={v.reviewed}
                closedLine={summaryLine(v.summary)}
                quiet={
                  facts?.yesterday && quietYesterday(facts)
                    ? { ...facts.yesterday, day: v.yesterday }
                    : null
                }
              />
            )}
            <Agenda
              entries={v.entries}
              blocks={v.blocks}
              day={day}
              today={today}
              zone={user.timezone}
              now={now}
              goals={v.goals}
              launcherBlockId={v.launcherBlockId}
              hasRoutines={v.routines > 0}
            />
            {isToday && <TodayRail v={v} />}
          </div>
          <DayPanels v={v} />
        </>
      )}
    </>
  );
}
