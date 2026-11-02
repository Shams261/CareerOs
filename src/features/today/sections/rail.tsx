import { Suspense } from 'react';
import { SetupRail } from '@/features/setup/rail';
import { DayPrintCard } from '@/features/day-print/print';
import { LivePrint } from '@/features/day-print/live';
import { NudgesOffCard } from '@/features/nudges/off-card';
import { Attention, AttentionSkeleton } from '../attention';
import { AttentionBoundary } from '../attention-boundary';
import type { TodayView } from '../page-data';

/**
 * Today's rail (WI-065; calmer in WI-141, the owner's choice): the day's print or live rings,
 * then Needs attention. This week lives on Plan; the setup card shows here only while three or
 * more steps are left, and the nudges card only while every study nudge is off.
 */
export function TodayRail({ v }: { v: TodayView }) {
  const { user, now, day, rounds, blocks, closedPrint, livePrint } = v;
  return (
    <aside className="today-rail" aria-labelledby="attention-heading">
      {/* Today's rings while the day is open (WI-071), the Day Print once it is
                    closed (WI-082), then what needs attention (WI-065). */}
      {closedPrint && (
        <DayPrintCard
          rail
          model={closedPrint}
          day={day}
          isToday
          ask={user.dayPrint == null}
        />
      )}
      {/* Only once a session has a whole minute on it: a ring to show. */}
      {livePrint && livePrint.rings.length > 0 && (
        <LivePrint day={day} model={livePrint} />
      )}
      {/* A card like This week (WI-079), as the mockup had it. */}
      <section className="card rail-card">
        <AttentionBoundary>
          <Suspense fallback={<AttentionSkeleton />}>
            <Attention
              user={user}
              now={now}
              interviews={rounds}
              blocks={blocks}
            />
          </Suspense>
        </AttentionBoundary>
      </section>
      <Suspense fallback={null}>
        <SetupRail user={user} />
      </Suspense>
      <Suspense fallback={null}>
        <NudgesOffCard user={user} />
      </Suspense>
    </aside>
  );
}
