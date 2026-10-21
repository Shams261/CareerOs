import Link from 'next/link';
import { BrandMark } from '@/components/brand';
import { db, owner } from '@/server/db';
import { dsaSnapshot } from '@/features/dsa/service';
import {
  learningState,
  revisionDay,
  revisionQueue,
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
/** Rows shown before "Show all". */
const PAGE = 40;
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
  const weekCount = await db().dsaAttempt.count({
    where: { userId: user.id, attemptedAt: { gte: weekStart, lte: now } },
  });
  const queue = revisionQueue(problems, day),
    practiced = problems.filter((p) => p.attemptsCount > 0);
  const current = {
    q: query.q ?? '',
    topic: query.topic ?? '',
    confidence: query.confidence ?? '',
    difficulty: query.difficulty ?? '',
    state: query.state ?? '',
  };
  const filtering = Object.values(current).some(Boolean);
  const filtered = problems.filter(
    (p) =>
      (!current.topic || p.topicId === current.topic) &&
      (!current.confidence ||
        (p.attemptsCount > 0 && p.confidence === current.confidence)) &&
      (!current.difficulty || p.difficulty === current.difficulty) &&
      (!current.state || learningState(p, day) === current.state) &&
      (!current.q || p.title.toLowerCase().includes(current.q.toLowerCase())),
  );
  const shown = query.all ? filtered : filtered.slice(0, PAGE);
  const counts = (items: typeof problems) =>
    (['GREEN', 'YELLOW', 'RED'] as const)
      .map((c) => [items.filter((p) => p.confidence === c).length, c] as const)
      .filter(([n]) => n > 0)
      .map(([n, c]) => `${n} ${c[0]}${c.slice(1).toLowerCase()}`)
      .join(' · ');
  const overdueDays = (d: Date) => Math.round((+new Date(day) - +d) / 86400000);
  const allQuery = new URLSearchParams(
    Object.entries({ ...current, all: '1' }).filter(([, v]) => v),
  ).toString();
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
            </span>
            {currentTopic && (
              <span>
                Current topic:{' '}
                <a className="link" href="#topics">
                  {currentTopic.name}
                </a>
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
                  · {filtering ? `${filtered.length} of ` : ''}
                  {problems.length}
                </span>
              </h2>
              {problems.length > 8 && (
                <LibraryFilters topics={topics} current={current} />
              )}
            </div>
            {!problems.length && (
              <p className="muted">
                No problems yet. Add the first one with the button above, or
                import a roadmap.
              </p>
            )}
            <ol className="plain-list">
              {shown.map((p) => {
                const state = learningState(p, day);
                return (
                  <li className="problem-row" key={p.id}>
                    <Link className="problem-title" href={`/dsa/${p.id}`}>
                      {p.title}
                    </Link>
                    <span
                      className={`pill ${p.attemptsCount ? tone[p.confidence] : ''}`}
                    >
                      {p.attemptsCount ? p.confidence : 'Unattempted'}
                    </span>
                    <span
                      className={`problem-date${state === 'overdue' ? ' is-overdue' : ''}`}
                    >
                      {p.nextRevisionAt ? dateLabel(p.nextRevisionAt) : '—'}
                    </span>
                    <span className="problem-meta muted">
                      {p.topic.name} · {p.difficulty.toLowerCase()}
                      {p.attemptsCount
                        ? ` · ${p.attemptsCount} attempt${p.attemptsCount === 1 ? '' : 's'}`
                        : ''}
                    </span>
                  </li>
                );
              })}
            </ol>
            {!filtered.length && problems.length > 0 && (
              <p className="muted">No matching problems.</p>
            )}
            {filtered.length > shown.length && (
              <p className="muted mt-4">
                {filtered.length - shown.length} more ·{' '}
                <Link className="link" href={`/dsa?${allQuery}#library`}>
                  Show all
                </Link>
              </p>
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
