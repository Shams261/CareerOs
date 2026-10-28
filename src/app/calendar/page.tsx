import Link from 'next/link';
import { isDeleted } from '@/features/deletes/domain';
import { openTemplates } from '@/features/schedule/templates';
import { Briefcase, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { Disclosure } from '@/components/disclosure';
import { PageShortcuts } from '@/components/shortcuts';
import { CategoryIcon } from '@/components/category-icon';
import { DateJump } from '@/components/date-jump';
import { getConnection } from '@/features/calendar/service';
import { blockSyncView } from '@/features/calendar/domain';
import { db, owner } from '@/server/db';
import { dayKey, hhmm } from '@/lib/time';
import { generateThroughSunday } from '@/features/schedule/service';
import { dateInput, weekDays, shiftDay } from '@/features/schedule/domain';
import { RoutineForm, CategoryOptions } from '@/features/schedule/forms';
import { BlockRowShell } from '@/features/schedule/block-row';
import {
  blockFacts,
  blockResolution,
  blockTitle,
  factsLine,
  formatDuration,
  resolutionText,
  rowMeta,
} from '@/features/schedule/row';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { PrepareNextWeekForm } from '@/features/review/forms';
export const metadata = { title: 'Plan' };

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const label = (day: string, pattern: string) =>
  formatInTimeZone(new Date(`${day}T12:00:00Z`), 'UTC', pattern);
/** "Week of 19 – 25 October", or "Week of 26 October – 1 November" across a month. */
const weekLabel = (days: string[]) =>
  label(days[0], 'MMMM') === label(days[6], 'MMMM')
    ? `Week of ${label(days[0], 'd')} – ${label(days[6], 'd MMMM')}`
    : `Week of ${label(days[0], 'd MMMM')} – ${label(days[6], 'd MMMM')}`;
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
  // Only the week's plans wait for generation; the rest starts at once (WI-061).
  const generated = generateThroughSunday(user, today).then(
    () => '',
    (error) =>
      error instanceof Error ? error.message : 'Unable to plan this week.',
  );
  const [routines, plans, goals, connection, generationError] =
    await Promise.all([
      db().routineBlock.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
      }),
      generated.then(() =>
        db().dailyPlan.findMany({
          where: {
            userId: user.id,
            date: { gte: new Date(days[0]), lte: new Date(days[6]) },
          },
          include: {
            blocks: {
              orderBy: { plannedStart: 'asc' },
              include: {
                sessions: {
                  select: { id: true, startedAt: true, endedAt: true },
                },
              },
            },
          },
        }),
      ),
      db().goal.findMany({
        where: { userId: user.id },
        select: { id: true, title: true },
      }),
      getConnection(user.id),
      generated,
    ]);
  const syncing = connection && connection.status !== 'DISCONNECTED';
  // Linked interviews, so a block named "Company — Round" reads as the round here too.
  // Usually no linked block exists and this costs nothing.
  const roundIds = plans.flatMap((p) =>
    p.blocks.flatMap((b) => (b.interviewRoundId ? [b.interviewRoundId] : [])),
  );
  const rounds = roundIds.length
    ? await db().interviewRound.findMany({
        where: { id: { in: roundIds }, userId: user.id },
        select: {
          id: true,
          title: true,
          application: { select: { company: true } },
        },
      })
    : [];
  const roundOf = (b: { interviewRoundId: string | null }) => {
    const r = rounds.find((x) => x.id === b.interviewRoundId);
    return r ? { title: r.title, company: r.application.company } : null;
  };
  // Deleted blocks (WI-060) stay only for the calendar sync and Undo.
  for (const p of plans) p.blocks = p.blocks.filter((b) => !isDeleted(b));
  const planOf = (day: string) =>
    plans.find((p) => p.date.toISOString().slice(0, 10) === day);
  const unplanned = days.some(
    (day) => day > thisWeek[6] && !planOf(day)?.generatedAt,
  );
  const weekBlocks = plans.flatMap((p) => p.blocks);
  // No routine and nothing this week: one card that starts the plan, not seven empty days.
  const empty = !routines.length && !weekBlocks.length;
  const dayLine = (day: string) => {
    const plan = planOf(day);
    const facts = blockFacts(plan?.blocks ?? [], now);
    if (!facts.planned)
      return plan?.generatedAt || day <= thisWeek[6]
        ? 'Nothing planned'
        : 'Not planned yet';
    return `${facts.planned} block${facts.planned === 1 ? '' : 's'} · ${formatDuration(facts.plannedMinutes)} planned`;
  };
  return (
    <>
      <CategoryOptions />
      <PageShortcuts
        shortcuts={[{ key: 'n', label: 'Routines', press: 'routines' }]}
        prev={`/calendar?date=${shiftDay(days[0], -7)}`}
        next={`/calendar?date=${shiftDay(days[0], 7)}`}
      />
      <header className="today-head">
        <div className="today-head-row">
          <div className="today-title">
            <h1>Plan</h1>
            <span className="today-date">{weekLabel(days)}</span>
            <nav className="day-nav" aria-label="Week navigation">
              <Link
                className="button secondary small day-nav-step"
                href={`/calendar?date=${shiftDay(days[0], -7)}`}
                aria-label="Previous week"
                prefetch={false}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </Link>
              <Link
                className="button secondary small day-nav-step"
                href={`/calendar?date=${shiftDay(days[0], 7)}`}
                aria-label="Next week"
                prefetch={false}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
              {days[0] !== thisWeek[0] && (
                <Link
                  className="button secondary small"
                  href="/calendar"
                  prefetch={false}
                >
                  This week
                </Link>
              )}
              <DateJump
                key={selected}
                value={selected}
                path="/calendar"
                label="Open the week containing a date"
              />
            </nav>
          </div>
          <div className="today-utils">
            <div className="today-utils-items">
              {!empty && (
                <PanelButton
                  panel="routines"
                  className={`button${routines.length ? ' secondary' : ''}`}
                  data-shortcut="routines"
                >
                  {routines.length
                    ? `Routines · ${routines.length}`
                    : 'Add routine'}
                </PanelButton>
              )}
            </div>
          </div>
        </div>
        <p className="today-summary">
          {factsLine(blockFacts(weekBlocks, now))}
        </p>
      </header>
      {generationError && (
        <p role="alert" className="form-message mb-5">
          This week could not be planned from your routines: {generationError}
        </p>
      )}
      {empty ? (
        <section
          className="card setup-card"
          aria-labelledby="plan-empty-heading"
        >
          <p className="eyebrow">Start here</p>
          <h2 id="plan-empty-heading">No routines yet</h2>
          <p>
            A routine fills every week from here on: what, which days, what
            time. Start with one.
          </p>
          <PanelButton
            panel="routines"
            className="button"
            data-shortcut="routines"
          >
            Add your first routine
          </PanelButton>
        </section>
      ) : (
        <>
          <nav className="week-strip" aria-label="Days of the week">
            {days.map((day, index) => {
              const n = planOf(day)?.blocks.filter(
                (b) => b.status !== 'CANCELLED',
              ).length;
              return (
                <a
                  key={day}
                  href={`#day-${day}`}
                  className={`week-chip${day === today ? ' is-today' : ''}`}
                  aria-current={day === today ? 'date' : undefined}
                >
                  <strong>
                    {WEEKDAY[(index + 1) % 7]} {label(day, 'd')}
                  </strong>
                  <span className="muted">{n || '—'}</span>
                </a>
              );
            })}
          </nav>
          {days.map((day, index) => {
            const plan = planOf(day);
            const blocks = plan?.blocks ?? [];
            const isToday = day === today;
            const dayName = `${WEEKDAY[(index + 1) % 7]} ${label(day, 'd')}`;
            return (
              <section
                key={day}
                id={`day-${day}`}
                className={`week-day-section${isToday ? ' is-today' : ''}`}
                aria-labelledby={`day-heading-${day}`}
                aria-current={isToday ? 'date' : undefined}
              >
                <div className="week-day-head">
                  <h2 id={`day-heading-${day}`}>
                    <Link href={`/today?date=${day}`} prefetch={false}>
                      {dayName}
                    </Link>
                    {isToday && <span className="pill success">Today</span>}
                  </h2>
                  <span className="muted">{dayLine(day)}</span>
                </div>
                {blocks.length > 0 && (
                  <ol className="plain-list agenda-rows">
                    {blocks.map((b) => {
                      const resolution = blockResolution(b, now);
                      const sync = syncing
                        ? blockSyncView(
                            b,
                            connection.calendarId,
                            connection.excludedCategories,
                          )
                        : null;
                      const google =
                        sync && sync !== 'Synced' && sync !== 'Not synced'
                          ? ` · Google: ${sync.toLowerCase()}`
                          : '';
                      const round = roundOf(b);
                      const title = blockTitle(b, round);
                      return (
                        <BlockRowShell
                          key={b.id}
                          resolution={resolution}
                          unresolved={
                            resolution === 'not-recorded' ||
                            resolution === 'needs-update'
                          }
                          time={hhmm(b.plannedStart, user.timezone)}
                          icon={
                            round ? (
                              <Briefcase
                                size={16}
                                aria-hidden="true"
                                className="category-icon"
                              />
                            ) : (
                              <CategoryIcon category={b.category} size={16} />
                            )
                          }
                          title={title}
                          meta={`${rowMeta(b, round, now, user.timezone)}${google}`}
                          status={resolutionText[resolution]}
                          side={
                            <Link
                              className="agenda-details"
                              href={`/today?date=${day}#block-${b.id}`}
                              aria-label={`Open ${title} on Today, ${dayName}`}
                              prefetch={false}
                            >
                              <ChevronRight size={18} aria-hidden="true" />
                            </Link>
                          }
                        />
                      );
                    })}
                  </ol>
                )}
              </section>
            );
          })}
        </>
      )}
      {unplanned && (
        <div className="week-prepare">
          <PrepareNextWeekForm monday={days[0]} />
        </div>
      )}
      <p className="status-line mt-5">
        <span>
          Google Calendar{' '}
          {syncing ? statusText[connection.status] : 'not connected'}
        </span>
        <Link prefetch={false} className="link" href="/settings#google-heading">
          {syncing ? 'Manage in Settings' : 'Connect in Settings'}
        </Link>
      </p>
      <SidePanel id="routines" title="Routines">
        <div className="routines-panel">
          <Disclosure
            label="Add routine"
            variant={routines.length ? 'secondary' : 'primary'}
            defaultOpen={!routines.length}
            draft="routine:new"
          >
            <RoutineForm
              goals={goals}
              compact
              templates={openTemplates(routines)}
            />
          </Disclosure>
          {routines.map((r) => (
            <div key={r.id} className="routine-row">
              <div>
                <strong>{r.title}</strong>
                <p className="muted">
                  {r.weekdays.map((d) => WEEKDAY[d]).join(', ')} ·{' '}
                  {r.startLocal}–{r.endLocal}
                  {r.enabled ? '' : ' · Paused'}
                </p>
              </div>
              <Disclosure
                variant="link"
                label="Edit"
                srLabel={`Edit routine ${r.title}`}
              >
                <RoutineForm routine={r} goals={goals} />
              </Disclosure>
            </div>
          ))}
        </div>
      </SidePanel>
    </>
  );
}
