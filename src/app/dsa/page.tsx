import Link from 'next/link';
import { BrandMark } from '@/components/brand';
import { db, owner } from '@/server/db';
import { dsaSnapshot } from '@/features/dsa/service';
import {
  learningState,
  revisionDay,
  revisionQueue,
  solvedText,
} from '@/features/dsa/domain';
import { TopicForm, ProblemForm } from '@/features/dsa/forms';
import { Disclosure } from '@/components/disclosure';
import { dayKey, localInstant } from '@/lib/time';
import { shiftDay } from '@/features/schedule/domain';
import { formatInTimeZone } from 'date-fns-tz';
import { ResourceLink } from '@/components/resource-link';

/** Filters appear once a list is long enough to need them. */
const FILTER_THRESHOLD = 8;

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
  const [recent, weekCount] = await Promise.all([
    db().dsaAttempt.findMany({
      where: { userId: user.id },
      include: { problem: true },
      orderBy: [{ attemptedAt: 'desc' }, { id: 'desc' }],
      take: 10,
    }),
    db().dsaAttempt.count({
      where: { userId: user.id, attemptedAt: { gte: weekStart, lte: now } },
    }),
  ]);
  const queue = revisionQueue(problems, day),
    practiced = problems.filter((p) => p.attemptsCount > 0),
    currentProblems = practiced.filter((p) => p.topicId === currentTopic?.id),
    fresh = problems.filter(
      (p) => p.topicId === currentTopic?.id && !p.attemptsCount,
    ),
    filtering =
      problems.length > FILTER_THRESHOLD ||
      ['topic', 'confidence', 'difficulty', 'state', 'q'].some((k) => query[k]);
  const filtered = problems.filter(
    (p) =>
      (!query.topic || p.topicId === query.topic) &&
      (!query.confidence ||
        (p.attemptsCount > 0 && p.confidence === query.confidence)) &&
      (!query.difficulty || p.difficulty === query.difficulty) &&
      (!query.state || learningState(p, day) === query.state) &&
      (!query.q || p.title.toLowerCase().includes(query.q.toLowerCase())),
  );
  const counts = (items: typeof problems) =>
    ['GREEN', 'YELLOW', 'RED']
      .map(
        (c) =>
          `${items.filter((p) => p.confidence === c).length} ${c[0]}${c.slice(1).toLowerCase()}`,
      )
      .join(' · ');
  const due = queue.filter((p) => learningState(p, day) === 'due').length,
    overdue = queue.filter((p) => learningState(p, day) === 'overdue').length;
  return (
    <>
      <p className="eyebrow">DSA · {user.timezone}</p>
      <div className="page-head">
        <h1>Practice</h1>
        {topics.length > 0 && (
          <Disclosure label="Add a problem" variant="primary">
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
          <section className="card today-focus">
            <div className="form-grid">
              <div>
                <p className="eyebrow">Current topic</p>
                <h2 className="mt-3">
                  {currentTopic?.name ?? 'No current topic'}
                </h2>
                <p className="muted">
                  {!currentTopic
                    ? 'Mark a topic as current under Topics.'
                    : currentProblems.length
                      ? `${currentProblems.length} practiced · ${counts(currentProblems)}`
                      : 'Nothing practiced yet.'}
                </p>
              </div>
              <div>
                <p className="eyebrow">This week</p>
                <h2 className="mt-3">
                  {weekCount} attempt{weekCount === 1 ? '' : 's'}
                </h2>
                <p className="muted">
                  {practiced.length
                    ? `${practiced.length} practiced in all · ${due} due today · ${overdue} overdue`
                    : 'Attempts are recorded on each problem.'}
                </p>
              </div>
            </div>
          </section>
          {!problems.length ? (
            <section className="card" aria-labelledby="problems-heading">
              <h2 id="problems-heading">Problems</h2>
              <p className="muted">
                No problems yet. Add the first one with the button above; the
                revision queue and your attempts appear here.
              </p>
            </section>
          ) : (
            <>
              <section
                className="card"
                id="revision-queue"
                aria-labelledby="queue-heading"
              >
                <h2 id="queue-heading">Due for revision</h2>
                {!queue.length && <p className="muted">Nothing due.</p>}
                {['overdue', 'due'].map((group) => (
                  <div key={group}>
                    {queue.some((p) => learningState(p, day) === group) && (
                      <h3 className="mt-5">
                        {group === 'overdue' ? 'Overdue' : 'Due today'}
                      </h3>
                    )}
                    {queue
                      .filter((p) => learningState(p, day) === group)
                      .map((p) => (
                        <div className="dsa-item" key={p.id}>
                          <Link className="link" href={`/dsa/${p.id}`}>
                            {p.title}
                          </Link>{' '}
                          <span
                            className={`pill ${p.confidence.toLowerCase()}`}
                          >
                            {p.confidence}
                          </span>
                          <p className="muted">
                            {group === 'overdue'
                              ? `Overdue by ${Math.round((+new Date(day) - +p.nextRevisionAt!) / 86400000)} day(s)`
                              : 'Due today'}{' '}
                            · {revisionDay(p.nextRevisionAt!)}
                          </p>
                        </div>
                      ))}
                  </div>
                ))}
              </section>
              <section className="card" aria-labelledby="next-heading">
                <h2 id="next-heading">
                  Next up{currentTopic ? ` in ${currentTopic.name}` : ''}
                </h2>
                {fresh.map((p) => (
                  <p className="mt-3" key={p.id}>
                    <Link className="link" href={`/dsa/${p.id}`}>
                      {p.title} → Practice
                    </Link>
                  </p>
                ))}
                {!fresh.length && (
                  <p className="muted">
                    {currentTopic
                      ? 'No new problems yet. Add one above.'
                      : 'Mark a topic as current to see new problems here.'}
                  </p>
                )}
              </section>
              <section
                className="card flat"
                id="library"
                aria-labelledby="library-heading"
              >
                <div className="section-head">
                  <h2 id="library-heading">
                    All problems{' '}
                    <span className="muted">· {problems.length}</span>
                  </h2>
                </div>
                {filtering && (
                  <form className="dsa-filters mb-5" method="get">
                    <label>
                      Search
                      <input name="q" defaultValue={query.q} />
                    </label>
                    <label>
                      Topic
                      <select name="topic" defaultValue={query.topic ?? ''}>
                        <option value="">All topics</option>
                        {topics.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Confidence
                      <select
                        name="confidence"
                        defaultValue={query.confidence ?? ''}
                      >
                        <option value="">Any</option>
                        {['RED', 'YELLOW', 'GREEN'].map((v) => (
                          <option key={v} value={v}>
                            {v[0] + v.slice(1).toLowerCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Difficulty
                      <select
                        name="difficulty"
                        defaultValue={query.difficulty ?? ''}
                      >
                        <option value="">Any</option>
                        {['EASY', 'MEDIUM', 'HARD'].map((v) => (
                          <option key={v} value={v}>
                            {v[0] + v.slice(1).toLowerCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Revision
                      <select name="state" defaultValue={query.state ?? ''}>
                        <option value="">Any</option>
                        {[
                          'due',
                          'overdue',
                          'upcoming',
                          'unattempted',
                          'unscheduled',
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <div className="actions">
                      <button className="button secondary">Filter</button>
                      <Link className="link" href="/dsa#library">
                        Clear
                      </Link>
                    </div>
                  </form>
                )}
                {filtering && (
                  <p className="muted">
                    {filtered.length} of {problems.length}
                  </p>
                )}
                {filtered.map((p) => (
                  <article className="dsa-item" key={p.id}>
                    <h3>
                      <Link className="link" href={`/dsa/${p.id}`}>
                        {p.title}
                      </Link>
                    </h3>
                    <p className="muted">
                      {p.topic.name} · {p.platform} ·{' '}
                      {p.difficulty.toLowerCase()}
                    </p>
                    <div className="row flex-wrap">
                      <span
                        className={`pill ${p.attemptsCount ? p.confidence.toLowerCase() : ''}`}
                      >
                        {p.attemptsCount ? p.confidence : 'Unattempted'}
                      </span>
                      <span className="muted">
                        {learningState(p, day)}
                        {p.nextRevisionAt
                          ? ` · ${revisionDay(p.nextRevisionAt)}`
                          : ''}
                      </span>
                      <ResourceLink url={p.problemUrl}>
                        Open problem
                      </ResourceLink>
                    </div>
                  </article>
                ))}
                {!filtered.length && (
                  <p className="muted">
                    {problems.length
                      ? 'No matching problems.'
                      : 'No problems yet.'}
                  </p>
                )}
              </section>
              {recent.length > 0 && (
                <section className="card flat" aria-labelledby="recent-heading">
                  <h2 id="recent-heading">Recent attempts</h2>
                  {recent.map((a) => (
                    <div className="dsa-item" key={a.id}>
                      <p className="muted">
                        {formatInTimeZone(
                          a.attemptedAt,
                          user.timezone,
                          'MMM d, h:mm a',
                        )}
                      </p>
                      <Link className="link" href={`/dsa/${a.problemId}`}>
                        {a.problem.title}
                      </Link>
                      <p>
                        {a.confidenceBefore
                          ? `${a.confidenceBefore} → `
                          : 'First attempt → '}
                        {a.confidenceAfter} ·{' '}
                        {solvedText[a.solvedIndependently]}
                      </p>
                      {a.mistake && <p>{a.mistake}</p>}
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          <section
            className="card"
            id="topics"
            aria-labelledby="topics-heading"
          >
            <div className="section-head">
              <h2 id="topics-heading">Topics</h2>
            </div>
            <Disclosure label="Add a topic">
              <TopicForm />
            </Disclosure>
            {topics.map((t) => (
              <div className="routine-row mt-4" key={t.id}>
                <div>
                  <strong>
                    {t.name}
                    {t.id === currentTopic?.id ? ' · Current' : ''}
                  </strong>
                  <p className="muted">
                    {t.status.replaceAll('_', ' ').toLowerCase()} ·{' '}
                    {practiced.filter((p) => p.topicId === t.id).length}{' '}
                    practiced
                    {practiced.some((p) => p.topicId === t.id)
                      ? ` · ${counts(practiced.filter((p) => p.topicId === t.id))}`
                      : ''}
                  </p>
                </div>
                <Disclosure variant="link" label="Edit">
                  <TopicForm topic={t} currentId={currentTopic?.id} />
                </Disclosure>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
