import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { BrandMark } from '@/components/brand';
import { db, owner } from '@/server/db';
import { dsaSnapshot } from '@/features/dsa/service';
import {
  learningState,
  revisionDay,
  revisionQueue,
  STATUS_FILTERS,
  type StatusFilter,
  confidenceWord,
} from '@/features/dsa/domain';
import { TopicForm, ProblemForm } from '@/features/dsa/forms';
import { LibraryFilters } from '@/features/dsa/library-filters';
import { PatternGroups, type Group } from '@/features/dsa/pattern-groups';
import { PendingRegion } from '@/components/pending-region';
import { ActionForm } from '@/components/action-form';
import { makeCurrentAction } from '@/features/dsa/actions';
import { Disclosure } from '@/components/disclosure';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { UtilityMenu } from '@/features/today/utility-menu';
import { dayKey, localInstant } from '@/lib/time';
import { resourceUrl } from '@/lib/validation';
import { shiftDay } from '@/features/schedule/domain';
import { formatInTimeZone } from 'date-fns-tz';
export const metadata = { title: 'Practice' };

const tone = { RED: 'danger', YELLOW: 'warning', GREEN: 'success' } as const;
const levelRank = { EASY: 0, MEDIUM: 1, HARD: 2 } as const;
const dateLabel = (d: Date) =>
  formatInTimeZone(new Date(`${revisionDay(d)}T12:00:00Z`), 'UTC', 'MMM d');

export default async function Dsa({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await owner(),
    query = await searchParams,
    now = new Date(),
    day = dayKey(now, user.timezone);
  const { problems, topics, currentTopic } = await dsaSnapshot(user);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const weekStart = localInstant(
    shiftDay(day, -((weekday + 6) % 7)),
    '00:00',
    user.timezone,
  );
  const [weekCount, lastAttempt] = await Promise.all([
    db().dsaAttempt.count({
      where: { userId: user.id, attemptedAt: { gte: weekStart, lte: now } },
    }),
    db().dsaAttempt.findFirst({
      where: { userId: user.id },
      orderBy: [{ attemptedAt: 'desc' }, { id: 'desc' }],
      select: {
        attemptedAt: true,
        problem: { select: { id: true, title: true } },
      },
    }),
  ]);
  const nextInTopic = currentTopic
    ? problems.find((p) => p.topicId === currentTopic.id && !p.attemptsCount)
    : null;
  const queue = revisionQueue(problems, day),
    practiced = problems.filter((p) => p.attemptsCount > 0);
  // The page's one primary (WI-058): a revision that is due, else the current topic's next
  // problem, else the first problem not tried yet.
  const nextProblem =
    queue[0] ?? nextInTopic ?? problems.find((p) => !p.attemptsCount) ?? null;
  const q = (query.q ?? '').trim();
  const status: StatusFilter =
    query.status && query.status in STATUS_FILTERS
      ? (query.status as StatusFilter)
      : '';
  const filtering = !!(q || status);
  const matches = (p: (typeof problems)[number]) => {
    const state = learningState(p, day);
    const ok =
      status === '' ||
      (status === 'unattempted' && !p.attemptsCount) ||
      (status === 'due' && state === 'due') ||
      (status === 'overdue' && state === 'overdue') ||
      (['RED', 'YELLOW', 'GREEN'].includes(status) &&
        p.attemptsCount > 0 &&
        p.confidence === status);
    return ok && (!q || p.title.toLowerCase().includes(q.toLowerCase()));
  };
  // The library is grouped by pattern in topic order; inside a pattern, Easy → Medium → Hard,
  // core problems before "more practice". Patterns open for the current topic, anything due,
  // and everything while a filter is on.
  const matched = problems.filter(matches);
  const groups: Group[] = topics
    .map((t) => {
      const rows = matched
        .filter((p) => p.topicId === t.id)
        .sort(
          (a, b) =>
            levelRank[a.difficulty] - levelRank[b.difficulty] ||
            Number(/More practice/.test(a.notes ?? '')) -
              Number(/More practice/.test(b.notes ?? '')) ||
            a.title.localeCompare(b.title),
        );
      const platforms = new Set(rows.map((p) => p.platform.trim()));
      return {
        id: t.id,
        name: t.name,
        // Named once on the band when every problem of the pattern shares it (WI-093).
        platform:
          platforms.size === 1 && rows[0].platform.trim()
            ? rows[0].platform.trim()
            : null,
        current: t.id === currentTopic?.id,
        attempted: rows.filter((p) => p.attemptsCount > 0).length,
        due: rows.filter((p) =>
          ['due', 'overdue'].includes(learningState(p, day)),
        ).length,
        rows: rows.map((p) => {
          const state = learningState(p, day);
          return {
            id: p.id,
            title: p.title,
            more: /More practice/.test(p.notes ?? ''),
            difficulty: p.difficulty,
            url: resourceUrl.safeParse(p.problemUrl).success
              ? p.problemUrl
              : null,
            platform: p.platform,
            confidence: p.confidence,
            attempted: p.attemptsCount > 0,
            revision:
              state === 'due' || state === 'overdue' || state === 'upcoming'
                ? {
                    state: state as 'due' | 'overdue' | 'upcoming',
                    label: dateLabel(p.nextRevisionAt!),
                  }
                : null,
          };
        }),
      };
    })
    .filter((g) => g.rows.length > 0);
  const openIds = groups
    .filter((g) => filtering || g.current || g.due > 0)
    .map((g) => g.id);
  // Nothing current and nothing due: open the first pattern so there is a place to start.
  if (!openIds.length && groups.length) openIds.push(groups[0].id);
  const counts = (items: typeof problems) =>
    (['GREEN', 'YELLOW', 'RED'] as const)
      .map((c) => [items.filter((p) => p.confidence === c).length, c] as const)
      .filter(([n]) => n > 0)
      .map(([n, c]) => `${n} ${confidenceWord(c)}`)
      .join(' · ');
  const overdueDays = (d: Date) => Math.round((+new Date(day) - +d) / 86400000);
  return (
    <>
      <div className="page-head is-practice">
        <h1>Practice</h1>
        {topics.length > 0 && (
          <div className="page-head-actions">
            {/* One cluster at the right, the primary last (WI-093). Topics and the quiz sit
                in More; on a phone Add a problem joins them and the primary takes its own
                row under the title. */}
            <UtilityMenu>
              <PanelButton panel="topics" className="link-button today-util">
                Topics
              </PanelButton>
              {problems.length >= 4 && (
                <Link
                  className="link-button today-util"
                  href="/dsa/drill"
                  prefetch={false}
                >
                  Pattern quiz
                </Link>
              )}
              <PanelButton
                panel="add-problem"
                className="link-button today-util only-phone"
              >
                Add a problem
              </PanelButton>
            </UtilityMenu>
            <PanelButton
              panel="add-problem"
              className="button secondary only-desktop"
            >
              Add a problem
            </PanelButton>
            {nextProblem && (
              <Link
                className="button practice-primary"
                href={`/dsa/${nextProblem.id}`}
                prefetch={false}
              >
                {queue[0] ? 'Revise' : 'Next problem'} · {nextProblem.title}
              </Link>
            )}
          </div>
        )}
      </div>
      {topics.length > 0 && (
        <SidePanel id="add-problem" title="Add a problem" variant="modal">
          <ProblemForm topics={topics} currentId={currentTopic?.id} inPanel />
        </SidePanel>
      )}
      {!topics.length ? (
        <section className="card setup-card" aria-labelledby="setup-heading">
          <BrandMark className="setup-mark" />
          <p className="eyebrow">Start here</p>
          <h2 id="setup-heading">Practice is organised by topic.</h2>
          <p>
            Add the topic you are working on now. Problems and revisions hang
            off it.
          </p>
          <TopicForm compact />
        </section>
      ) : (
        <>
          {/* One facts line (WI-093): the count, the due link, the week, the current topic. */}
          <p className="status-line practice-facts mb-7">
            <span>
              {problems.length} problem{problems.length === 1 ? '' : 's'}
            </span>
            {queue.length > 0 && (
              <span>
                <PanelButton
                  panel="revision-queue"
                  className="link-button practice-due"
                >
                  {queue.length} due for revision{' '}
                  <ArrowRight size={14} aria-hidden="true" />
                </PanelButton>
              </span>
            )}
            <span>
              {weekCount} attempt{weekCount === 1 ? '' : 's'} this week
              {lastAttempt && (
                <>
                  {' · last '}
                  <Link
                    prefetch={false}
                    className="link"
                    href={`/dsa/${lastAttempt.problem.id}`}
                  >
                    {lastAttempt.problem.title}
                  </Link>
                  {`, ${formatInTimeZone(lastAttempt.attemptedAt, user.timezone, 'MMM d')}`}
                </>
              )}
            </span>
            {currentTopic && (
              <span>
                Current topic: {currentTopic.name}
                {nextInTopic && (
                  <>
                    {' · next '}
                    <Link
                      prefetch={false}
                      className="link"
                      href={`/dsa/${nextInTopic.id}`}
                    >
                      {nextInTopic.title}
                    </Link>
                  </>
                )}
              </span>
            )}
          </p>
          <SidePanel
            id="revision-queue"
            title={`Due for revision · ${queue.length}`}
          >
            <ol className="plain-list">
              {queue.map((p) => {
                const state = learningState(p, day);
                return (
                  <li className="problem-row" key={p.id}>
                    <Link
                      prefetch={false}
                      className="problem-title"
                      href={`/dsa/${p.id}`}
                    >
                      {p.title}
                    </Link>
                    <span className={`pill ${tone[p.confidence]}`}>
                      {confidenceWord(p.confidence)}
                    </span>
                    <span className="problem-date">
                      <span
                        className={`pill ${state === 'overdue' ? 'danger' : 'warning'}`}
                      >
                        {state === 'overdue'
                          ? `${overdueDays(p.nextRevisionAt!)} day${overdueDays(p.nextRevisionAt!) === 1 ? '' : 's'} overdue`
                          : 'Due today'}
                      </span>
                    </span>
                    <span className="problem-meta muted">
                      {p.topic.name} · {p.platform} ·{' '}
                      {p.difficulty.toLowerCase()}
                    </span>
                  </li>
                );
              })}
            </ol>
          </SidePanel>
          <PendingRegion
            as="section"
            className="card flat"
            id="library"
            aria-labelledby="library-heading"
          >
            <div className="section-head">
              <h2 id="library-heading">
                All problems
                {filtering && (
                  <span className="muted">
                    {' '}
                    · {matched.length} of {problems.length}
                  </span>
                )}
              </h2>
              {problems.length > 8 && <LibraryFilters q={q} status={status} />}
            </div>
            {!problems.length && (
              <p className="muted">
                No problems yet. Add the first one with the button above, or
                import a roadmap.
              </p>
            )}
            {groups.length > 0 && (
              <PatternGroups
                key={`${q}|${status}|${currentTopic?.id ?? ''}`}
                groups={groups}
                openIds={openIds}
              />
            )}
            {!matched.length && problems.length > 0 && (
              <p className="muted">No matching problems.</p>
            )}
          </PendingRegion>
          <SidePanel id="topics" title={`Topics · ${topics.length}`}>
            <Disclosure variant="link" label="Add a topic">
              <TopicForm />
            </Disclosure>
            <ol className="plain-list">
              {topics.map((t) => {
                const mine = practiced.filter((p) => p.topicId === t.id);
                const total = problems.filter((p) => p.topicId === t.id).length;
                const isCurrent = t.id === currentTopic?.id;
                return (
                  <li className="topic-row" key={t.id}>
                    <span>
                      <span className="problem-title">
                        {t.name}
                        {isCurrent && (
                          <span className="pill success">Current</span>
                        )}
                      </span>
                      <span className="problem-meta muted">
                        {total} problem{total === 1 ? '' : 's'}
                        {mine.length
                          ? ` · ${mine.length} practiced · ${counts(mine)}`
                          : ' · nothing practiced yet'}
                      </span>
                    </span>
                    <span className="topic-actions">
                      {
                        <ActionForm action={makeCurrentAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <button
                            className="button secondary small"
                            disabled={isCurrent}
                            aria-label={`Make current: ${t.name}`}
                          >
                            Make current
                          </button>
                        </ActionForm>
                      }
                      <Disclosure variant="link" label="Edit">
                        <TopicForm topic={t} currentId={currentTopic?.id} />
                      </Disclosure>
                    </span>
                  </li>
                );
              })}
            </ol>
          </SidePanel>
        </>
      )}
    </>
  );
}
