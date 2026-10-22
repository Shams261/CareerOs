import Link from 'next/link';
import { BrandMark } from '@/components/brand';
import { db, owner } from '@/server/db';
import { dsaSnapshot } from '@/features/dsa/service';
import {
  learningState,
  revisionDay,
  revisionQueue,
  STATUS_FILTERS,
  type StatusFilter,
} from '@/features/dsa/domain';
import { TopicForm, ProblemForm } from '@/features/dsa/forms';
import { LibraryFilters } from '@/features/dsa/library-filters';
import { ActionForm } from '@/components/action-form';
import { makeCurrentAction } from '@/features/dsa/actions';
import { Disclosure } from '@/components/disclosure';
import { dayKey, localInstant } from '@/lib/time';
import { shiftDay } from '@/features/schedule/domain';
import { formatInTimeZone } from 'date-fns-tz';

const tone = { RED: 'danger', YELLOW: 'warning', GREEN: 'success' } as const;
/** Rows per page of the library. */
const PAGE = 60;
const difficultyText = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
} as const;
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
  // The library is grouped by pattern in topic order; core problems come before "More practice".
  const topicIndex = new Map(topics.map((t, i) => [t.id, i]));
  const sorted = problems
    .filter(matches)
    .sort(
      (a, b) =>
        (topicIndex.get(a.topicId) ?? 999) -
          (topicIndex.get(b.topicId) ?? 999) ||
        Number(/More practice/.test(a.notes ?? '')) -
          Number(/More practice/.test(b.notes ?? '')) ||
        a.title.localeCompare(b.title),
    );
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(query.page) || 1));
  const shown = sorted.slice((page - 1) * PAGE, page * PAGE);
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (status) p.set('status', status);
    if (n > 1) p.set('page', String(n));
    const qs = p.toString();
    return `/dsa${qs ? `?${qs}` : ''}#library`;
  };
  const counts = (items: typeof problems) =>
    (['GREEN', 'YELLOW', 'RED'] as const)
      .map((c) => [items.filter((p) => p.confidence === c).length, c] as const)
      .filter(([n]) => n > 0)
      .map(([n, c]) => `${n} ${c[0]}${c.slice(1).toLowerCase()}`)
      .join(' · ');
  const overdueDays = (d: Date) => Math.round((+new Date(day) - +d) / 86400000);
  return (
    <>
      <p className="eyebrow">DSA</p>
      <div className="page-head">
        <h1>Practice</h1>
        {topics.length > 0 && (
          <Disclosure label="Add a problem" variant="secondary">
            <ProblemForm topics={topics} currentId={currentTopic?.id} />
          </Disclosure>
        )}
      </div>
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
          <p className="status-line mb-7">
            <span>
              {problems.length} problem{problems.length === 1 ? '' : 's'}
            </span>
            <span>
              {weekCount} attempt{weekCount === 1 ? '' : 's'} this week
              {lastAttempt && (
                <>
                  {' · last: '}
                  <Link
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
                Current topic:{' '}
                <a className="link" href="#topics">
                  {currentTopic.name}
                </a>
                {nextInTopic && (
                  <>
                    {' · next: '}
                    <Link className="link" href={`/dsa/${nextInTopic.id}`}>
                      {nextInTopic.title}
                    </Link>
                  </>
                )}
              </span>
            )}
          </p>
          {queue.length > 0 && (
            <section
              className="card flat"
              id="revision-queue"
              aria-labelledby="queue-heading"
            >
              <div className="section-head">
                <h2 id="queue-heading">
                  Due for revision{' '}
                  <span className="muted">· {queue.length}</span>
                </h2>
              </div>
              <ol className="plain-list">
                {queue.map((p) => {
                  const state = learningState(p, day);
                  return (
                    <li className="problem-row" key={p.id}>
                      <Link className="problem-title" href={`/dsa/${p.id}`}>
                        {p.title}
                      </Link>
                      <span className={`pill ${tone[p.confidence]}`}>
                        {p.confidence}
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
            </section>
          )}
          <section
            className="card flat"
            id="library"
            aria-labelledby="library-heading"
          >
            <div className="section-head">
              <h2 id="library-heading">
                All problems{' '}
                <span className="muted">
                  · {filtering ? `${sorted.length} of ` : ''}
                  {problems.length}
                </span>
              </h2>
              {problems.length > 8 && <LibraryFilters q={q} status={status} />}
            </div>
            {!problems.length && (
              <p className="muted">
                No problems yet. Add the first one with the button above, or
                import a roadmap.
              </p>
            )}
            {shown.length > 0 && (
              <div className="problem-table" role="table" aria-label="Problems">
                <div className="problem-head" role="row">
                  <span role="columnheader">Problem</span>
                  <span role="columnheader">Pattern</span>
                  <span role="columnheader">Complexity</span>
                  <span role="columnheader">Status</span>
                </div>
                {shown.map((p, i) => {
                  const state = learningState(p, day);
                  const newGroup =
                    i === 0 || shown[i - 1].topicId !== p.topicId;
                  const inGroup = sorted.filter((x) => x.topicId === p.topicId);
                  const more = /More practice/.test(p.notes ?? '');
                  return (
                    <div
                      key={p.id}
                      role="presentation"
                      className="problem-group"
                    >
                      {newGroup && (
                        <div className="problem-group-head" role="row">
                          <span role="cell" id={`pattern-${p.topicId}`}>
                            {p.topic.name}
                            <span className="muted">
                              {' '}
                              ·{' '}
                              {
                                inGroup.filter((x) => x.attemptsCount > 0)
                                  .length
                              }{' '}
                              of {inGroup.length} attempted
                            </span>
                            {p.topicId === currentTopic?.id && (
                              <span className="pill success">Current</span>
                            )}
                          </span>
                        </div>
                      )}
                      <div className="problem-line" role="row">
                        <span role="cell" className="problem-cell-title">
                          <Link className="problem-title" href={`/dsa/${p.id}`}>
                            {p.title}
                          </Link>
                          {more && (
                            <span className="muted problem-tag">
                              more practice
                            </span>
                          )}
                        </span>
                        <span
                          role="cell"
                          className="muted problem-cell-pattern"
                        >
                          {p.topic.name}
                        </span>
                        <span
                          role="cell"
                          className={`problem-cell-level is-${p.difficulty.toLowerCase()}`}
                        >
                          {difficultyText[p.difficulty]}
                        </span>
                        <span role="cell" className="problem-cell-status">
                          <span
                            className={`pill ${p.attemptsCount ? tone[p.confidence] : ''}`}
                          >
                            {p.attemptsCount ? p.confidence : 'Unattempted'}
                          </span>
                          {state === 'overdue' && (
                            <span className="problem-date is-overdue">
                              overdue · {dateLabel(p.nextRevisionAt!)}
                            </span>
                          )}
                          {state === 'due' && (
                            <span className="problem-date is-due">
                              due today
                            </span>
                          )}
                          {state === 'upcoming' && (
                            <span className="problem-date">
                              {dateLabel(p.nextRevisionAt!)}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!sorted.length && problems.length > 0 && (
              <p className="muted">No matching problems.</p>
            )}
            {pages > 1 && (
              <nav className="pager" aria-label="Pages">
                {page > 1 && (
                  <Link
                    className="button secondary small"
                    href={pageHref(page - 1)}
                  >
                    ← Previous
                  </Link>
                )}
                <span className="muted">
                  {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, sorted.length)}{' '}
                  of {sorted.length} · page {page} of {pages}
                </span>
                {page < pages && (
                  <Link
                    className="button secondary small"
                    href={pageHref(page + 1)}
                  >
                    Next →
                  </Link>
                )}
              </nav>
            )}
          </section>
          <section
            className="card flat"
            id="topics"
            aria-labelledby="topics-heading"
          >
            <div className="section-head">
              <h2 id="topics-heading">
                Topics <span className="muted">· {topics.length}</span>
              </h2>
              <Disclosure variant="link" label="Add a topic">
                <TopicForm />
              </Disclosure>
            </div>
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
                      {!isCurrent && (
                        <ActionForm
                          action={makeCurrentAction}
                          label={`Make ${t.name} current`}
                        >
                          <input type="hidden" name="id" value={t.id} />
                          <button className="button secondary small">
                            Make current
                          </button>
                        </ActionForm>
                      )}
                      <Disclosure variant="link" label="Edit">
                        <TopicForm topic={t} currentId={currentTopic?.id} />
                      </Disclosure>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}
    </>
  );
}
