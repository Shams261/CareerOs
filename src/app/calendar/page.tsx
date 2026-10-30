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
import {
  BlockForm,
  RoutineForm,
  CategoryOptions,
} from '@/features/schedule/forms';
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
import {
  dayName,
  groupName,
  weekGroups,
  weekRange,
} from '@/features/schedule/week-list';
import { UtilityMenu } from '@/features/today/utility-menu';
import { WeekCard } from '@/features/today/week-card';
import { weekProgress } from '@/features/today/home';
import { nextSlot } from '@/features/today/domain';
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
  // The week as one list (WI-083): days with blocks and today on their own, empty neighbours
  // merged into one line.
  const groups = weekGroups(
    days.map((day) => ({
      day,
      blocks: planOf(day)?.blocks ?? [],
      line: dayLine(day),
    })),
    today,
  );
  const facts = blockFacts(weekBlocks, now);
  const thisWeekShown = days[0] === thisWeek[0];
  const todayBlocks = planOf(today)?.blocks ?? [];
  const slot = nextSlot(
    now,
    user.timezone,
    today,
    todayBlocks
      .filter((b) => b.status !== 'CANCELLED')
      .map((b) => ({ start: b.plannedStart, end: b.plannedEnd })),
  );
  return (
    <>
      <CategoryOptions />
      <PageShortcuts
        shortcuts={[
          { key: 'n', label: 'Add a block', press: 'add-block' },
          { key: 'r', label: 'Routines', press: 'routines' },
        ]}
        prev={`/calendar?date=${shiftDay(days[0], -7)}`}
        next={`/calendar?date=${shiftDay(days[0], 7)}`}
      />
      <header className="today-head">
        <div className="today-head-row">
          <div className="today-title">
            <h1>Plan</h1>
            <span className="today-date">{weekRange(days)}</span>
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
              {!thisWeekShown && (
                <Link
                  className="button secondary small"
                  href="/calendar"
                  prefetch={false}
                >
                  This week
                </Link>
              )}
            </nav>
          </div>
          {/* The date field and the routines behind one More, as on Today (WI-083). */}
          <UtilityMenu>
            <span className="today-util-date">
              <DateJump
                key={selected}
                value={selected}
                path="/calendar"
                label="Open the week containing a date"
              />
            </span>
            <PanelButton
              panel="routines"
              className="button secondary"
              data-shortcut="routines"
            >
              {routines.length
                ? `Routines · ${routines.length}`
                : 'Add routine'}
            </PanelButton>
          </UtilityMenu>
        </div>
        <p className="today-facts" aria-label="The week in numbers">
          {facts.planned ? (
            <>
              <span className="today-fact">
                <strong>{facts.planned}</strong> block
                {facts.planned === 1 ? '' : 's'} planned
              </span>
              {facts.done > 0 && (
                <span className="today-fact">
                  <strong>{facts.done}</strong> done
                </span>
              )}
              {facts.skipped > 0 && (
                <span className="today-fact">
                  <strong>{facts.skipped}</strong> skipped
                </span>
              )}
              {facts.notRecorded > 0 && (
                <span className="today-fact">
                  <strong>{facts.notRecorded}</strong> not recorded
                </span>
              )}
              {facts.needsUpdate > 0 && (
                <span className="today-fact">
                  <strong>{facts.needsUpdate}</strong> need
                  {facts.needsUpdate === 1 ? 's' : ''} update
                </span>
              )}
              <span className="today-fact">
                <strong>{formatDuration(facts.plannedMinutes)}</strong> planned
              </span>
            </>
          ) : (
            <span className="today-fact">Nothing planned</span>
          )}
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
              const group = groups.find(
                (g) => g.days[0] <= day && day <= g.days[g.days.length - 1],
              );
              return (
                <a
                  key={day}
                  href={`#day-${group?.days[0] ?? day}`}
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
          <div className="today-workspace is-today plan-workspace">
            <section
              className="agenda is-compact plan-list"
              aria-label="The week's plan"
            >
              <ol className="plain-list agenda-rows">
                {groups.map((group) => {
                  const first = group.days[0];
                  const name = groupName(group);
                  return [
                    <li
                      key={`day-${first}`}
                      id={`day-${first}`}
                      className={`plan-dayline${group.isToday ? ' is-today' : ''}`}
                    >
                      <h2>
                        {group.days.length > 1 ? (
                          name
                        ) : (
                          <Link href={`/today?date=${first}`} prefetch={false}>
                            {name}
                          </Link>
                        )}
                      </h2>
                      <span className="plan-dayline-meta">
                        {group.isToday ? `Today · ${group.line}` : group.line}
                      </span>
                      {group.isToday && (
                        <PanelButton
                          panel="add-block"
                          className="link-button plan-add"
                          data-shortcut="add-block"
                        >
                          + Add a block
                        </PanelButton>
                      )}
                    </li>,
                    ...group.blocks.map((b) => {
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
                              href={`/today?date=${first}#block-${b.id}`}
                              aria-label={`Open ${title} on Today, ${dayName(first)}`}
                              prefetch={false}
                            >
                              <ChevronRight size={18} aria-hidden="true" />
                            </Link>
                          }
                        />
                      );
                    }),
                  ];
                })}
              </ol>
              {unplanned && (
                <div className="week-prepare">
                  <PrepareNextWeekForm monday={days[0]} />
                </div>
              )}
            </section>
            <aside className="today-rail" aria-label="This week and routines">
              {thisWeekShown && (
                <WeekCard
                  week={weekProgress({
                    done: weekBlocks.filter((b) => b.status === 'COMPLETED')
                      .length,
                    planned: weekBlocks.filter((b) => b.status !== 'CANCELLED')
                      .length,
                  })}
                  weekKey={days[0]}
                  facts={factsLine(facts)}
                />
              )}
              {/* Routines as a card that opens the panel (WI-083), like This week opens Plan. */}
              <section
                className="card rail-card routines-card"
                aria-labelledby="routines-heading"
              >
                <div className="week-card-head">
                  <h2 id="routines-heading">Routines</h2>
                  <span className="muted">
                    {routines.length
                      ? `${routines.filter((r) => r.enabled).length} on`
                      : 'none yet'}
                  </span>
                </div>
                {routines.length ? (
                  <ul className="plain-list routine-list">
                    {routines.slice(0, 5).map((r) => (
                      <li key={r.id}>
                        <span className="routine-list-title">{r.title}</span>
                        <span className="muted">
                          {r.weekdays.map((d) => WEEKDAY[d]).join(' ')} ·{' '}
                          {r.startLocal}
                          {r.enabled ? '' : ' · Paused'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="week-line">
                    A routine fills every week from here on.
                  </p>
                )}
                <PanelButton
                  panel="routines"
                  className="link-button rail-card-link"
                >
                  {routines.length ? 'Routines' : 'Add routine'}{' '}
                  <ChevronRight size={14} aria-hidden="true" />
                </PanelButton>
              </section>
              <p className="status-line plan-status">
                <span>
                  Google Calendar{' '}
                  {syncing ? statusText[connection.status] : 'not connected'}
                </span>
                <Link
                  prefetch={false}
                  className="link"
                  href="/settings#google-heading"
                >
                  {syncing ? 'Manage in Settings' : 'Connect in Settings'}
                </Link>
              </p>
            </aside>
          </div>
          {/* Adding a block to today from Plan (WI-083): Today's own form. */}
          {thisWeekShown && (
            <SidePanel id="add-block" title="Add a block" variant="modal">
              <BlockForm
                day={today}
                zone={user.timezone}
                goals={goals}
                defaultStart={slot.start}
                defaultEnd={slot.end}
              />
            </SidePanel>
          )}
        </>
      )}
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
