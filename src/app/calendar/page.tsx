import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { Disclosure } from '@/components/disclosure';
import { PageShortcuts } from '@/components/shortcuts';
import { CategoryIcon } from '@/components/category-icon';
import { DateJump } from '@/components/date-jump';
import { getConnection } from '@/features/calendar/service';
import { blockSyncView } from '@/features/calendar/domain';
import { db, owner } from '@/server/db';
import { dayKey, clock, shortDate } from '@/lib/time';
import { generateThroughSunday } from '@/features/schedule/service';
import {
  dateInput,
  executionLabel,
  executionTone,
  weekDays,
  shiftDay,
} from '@/features/schedule/domain';
import { RoutineForm, CategoryOptions } from '@/features/schedule/forms';
import { PrepareNextWeekForm } from '@/features/review/forms';
export const metadata = { title: 'Plan' };

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const label = (day: string, pattern: string) =>
  formatInTimeZone(new Date(`${day}T12:00:00Z`), 'UTC', pattern);
const statusText = {
  CONNECTED: 'connected',
  REAUTH_REQUIRED: 'reconnect required',
  ERROR: 'needs attention',
  DISCONNECTED: 'not connected',
} as const;

export default async function Calendar({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await owner(),
    query = await searchParams,
    now = new Date(),
    today = dayKey(now, user.timezone),
    selected = dateInput.safeParse(query.date).success ? query.date! : today,
    days = weekDays(selected),
    thisWeek = weekDays(today);
  let generationError = '';
  try {
    await generateThroughSunday(user, today);
  } catch (error) {
    generationError =
      error instanceof Error ? error.message : 'Unable to plan this week.';
  }
  const [routines, plans, goals, connection] = await Promise.all([
    db().routineBlock.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    }),
    db().dailyPlan.findMany({
      where: {
        userId: user.id,
        date: { gte: new Date(days[0]), lte: new Date(days[6]) },
      },
      include: { blocks: { orderBy: { plannedStart: 'asc' } } },
    }),
    db().goal.findMany({
      where: { userId: user.id },
      select: { id: true, title: true },
    }),
    getConnection(user.id),
  ]);
  const syncing = connection && connection.status !== 'DISCONNECTED';
  const unplanned = days.some(
    (day) =>
      day > thisWeek[6] &&
      !plans.find((p) => p.date.toISOString().slice(0, 10) === day)
        ?.generatedAt,
  );
  return (
    <>
      <CategoryOptions />
      <PageShortcuts
        shortcuts={[{ key: 'n', label: 'Add routine', press: 'add-routine' }]}
        prev={`/calendar?date=${shiftDay(days[0], -7)}`}
        next={`/calendar?date=${shiftDay(days[0], 7)}`}
      />
      <p className="eyebrow">Plan</p>
      <div className="page-head">
        <h1>
          Week of {label(days[0], 'MMM d')} – {label(days[6], 'MMM d, yyyy')}
        </h1>
        <nav className="day-nav" aria-label="Week navigation">
          <Link
            className="button secondary"
            href={`/calendar?date=${shiftDay(days[0], -7)}`}
            aria-label="Previous week"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Link>
          {days[0] !== thisWeek[0] && (
            <Link className="button secondary" href="/calendar">
              This week
            </Link>
          )}
          <Link
            className="button secondary"
            href={`/calendar?date=${shiftDay(days[0], 7)}`}
            aria-label="Next week"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
          <DateJump
            key={selected}
            value={selected}
            path="/calendar"
            label="Open the week containing a date"
          />
        </nav>
      </div>
      {generationError && (
        <p role="alert" className="form-message mb-5">
          This week could not be planned: {generationError}. Check the routines
          below.
        </p>
      )}
      <section className="card" aria-labelledby="routines-heading">
        <div className="section-head">
          <h2 id="routines-heading">Routines</h2>
        </div>
        <Disclosure
          label="Add routine"
          variant={routines.length ? 'secondary' : 'primary'}
          defaultOpen={!routines.length}
          shortcut="add-routine"
          draft="routine:new"
        >
          <RoutineForm goals={goals} />
        </Disclosure>
        {!routines.length && (
          <p className="muted mt-4">
            No routines yet. Add one and your days fill in from it.
          </p>
        )}
        {routines.map((r) => (
          <div key={r.id} className="routine-row">
            <div>
              <strong>{r.title}</strong>
              <p className="muted">
                {r.weekdays.map((d) => WEEKDAY[d]).join(', ')} · {r.startLocal}–
                {r.endLocal}
                {r.enabled ? '' : ' · Paused'}
              </p>
            </div>
            <Disclosure variant="link" label="Edit">
              <RoutineForm routine={r} goals={goals} />
            </Disclosure>
          </div>
        ))}
      </section>
      <section className="week-grid" aria-label="Week">
        {days.map((day, index) => {
          const plan = plans.find(
            (p) => p.date.toISOString().slice(0, 10) === day,
          );
          return (
            <article
              className={`week-day${day === today ? ' is-today' : ''}`}
              key={day}
              aria-current={day === today ? 'date' : undefined}
            >
              <Link className="link" href={`/today?date=${day}`}>
                {WEEKDAY[(index + 1) % 7]} · {shortDate(day)}
              </Link>
              {plan?.blocks.length ? (
                plan.blocks.map((b) => {
                  const sync = syncing
                    ? blockSyncView(
                        b,
                        connection.calendarId,
                        connection.excludedCategories,
                      )
                    : null;
                  return (
                    <Link
                      href={`/today?date=${day}`}
                      className={`week-block is-${executionTone(executionLabel(b, now)) || 'planned'}`}
                      key={b.id}
                    >
                      <span className="muted">
                        {clock(b.plannedStart, user.timezone)}
                      </span>
                      <strong>
                        <CategoryIcon category={b.category} size={12} />
                        {b.title}
                      </strong>
                      <span className="muted">
                        {executionLabel(b, now).toLowerCase()}
                        {sync && sync !== 'Synced' && sync !== 'Not synced'
                          ? ` · Google: ${sync.toLowerCase()}`
                          : ''}
                      </span>
                    </Link>
                  );
                })
              ) : (
                <p className="muted mt-4">
                  {plan?.generatedAt || day <= thisWeek[6]
                    ? 'Nothing planned'
                    : 'Not planned yet'}
                </p>
              )}
            </article>
          );
        })}
      </section>
      {unplanned && (
        <div className="mb-5">
          <PrepareNextWeekForm monday={days[0]} />
        </div>
      )}
      <p className="status-line">
        <span>
          Google Calendar{' '}
          {syncing ? statusText[connection.status] : 'not connected'}
        </span>
        <Link className="link" href="/settings#google-heading">
          {syncing ? 'Manage in Settings' : 'Connect in Settings'}
        </Link>
      </p>
    </>
  );
}
