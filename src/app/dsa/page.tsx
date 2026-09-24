import Link from 'next/link';
import { db, owner } from '@/server/db';
import { dsaSnapshot } from '@/features/dsa/service';
import {
  learningState,
  revisionDay,
  revisionQueue,
} from '@/features/dsa/domain';
import { TopicForm, ProblemForm } from '@/features/dsa/forms';
import { dayKey, localInstant } from '@/lib/time';
import { shiftDay } from '@/features/schedule/domain';
import { formatInTimeZone } from 'date-fns-tz';
import { ResourceLink } from '@/components/resource-link';
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
    currentProblems = practiced.filter((p) => p.topicId === currentTopic?.id);
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
      .map((c) => `${items.filter((p) => p.confidence === c).length} ${c}`)
      .join(' · ');
  return (
    <>
      <p className="eyebrow">Practice with intention · {user.timezone}</p>
      <h1>DSA learning & revision</h1>
      <p className="muted mb-7">
        Solve externally. Remember what you learned here.
      </p>
      <section className="card">
        <p className="eyebrow">Current topic</p>
        <h2>{currentTopic?.name ?? 'Choose your next focus'}</h2>
        <p>
          {currentProblems.length} unique problems practiced ·{' '}
          {counts(currentProblems)}
        </p>
        <p className="muted">
          All topics: {practiced.length} unique problems practiced ·{' '}
          {counts(practiced)} · {weekCount} attempts this week
        </p>
        <p className="muted">
          {queue.filter((p) => learningState(p, day) === 'due').length} due
          today ·{' '}
          {queue.filter((p) => learningState(p, day) === 'overdue').length}{' '}
          overdue
        </p>
        <a className="link" href="#topics">
          Manage topics →
        </a>
      </section>
      <section className="card" id="revision-queue">
        <h2>Today&apos;s revision queue</h2>
        <p className="muted">
          Overdue first, then due today; Red → Yellow → Green within each group.
        </p>
        {!queue.length && (
          <p className="empty">
            Nothing due. Your upcoming revisions will appear here automatically.
          </p>
        )}
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
                  </Link>
                  <span className={`pill ${p.confidence.toLowerCase()}`}>
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
      <section className="card">
        <h2>New problems in {currentTopic?.name ?? 'your current topic'}</h2>
        {problems
          .filter((p) => p.topicId === currentTopic?.id && !p.attemptsCount)
          .map((p) => (
            <p className="mt-3" key={p.id}>
              <Link className="link" href={`/dsa/${p.id}`}>
                {p.title} → Practice
              </Link>
            </p>
          ))}
        {!problems.some(
          (p) => p.topicId === currentTopic?.id && !p.attemptsCount,
        ) && (
          <p className="muted">
            Choose a current topic and add a new problem when ready.
          </p>
        )}
      </section>
      <section className="card">
        <details>
          <summary>Add a problem</summary>
          <ProblemForm topics={topics} currentId={currentTopic?.id} />
        </details>
      </section>
      <section className="card" id="library">
        <h2>Problem library</h2>
        <form className="dsa-filters" method="get">
          <label>
            Search title
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
            <select name="confidence" defaultValue={query.confidence ?? ''}>
              <option value="">All confidence</option>
              {['RED', 'YELLOW', 'GREEN'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Difficulty
            <select name="difficulty" defaultValue={query.difficulty ?? ''}>
              <option value="">All difficulties</option>
              {['EASY', 'MEDIUM', 'HARD'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Revision status
            <select name="state" defaultValue={query.state ?? ''}>
              <option value="">All states</option>
              {['due', 'overdue', 'upcoming', 'unattempted', 'unscheduled'].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          </label>
          <button className="button">Apply filters</button>
          <Link className="link" href="/dsa#library">
            Clear filters
          </Link>
        </form>
        <p className="muted mt-4">{filtered.length} problem(s)</p>
        {filtered.map((p) => (
          <article className="dsa-item" key={p.id}>
            <h3>
              <Link className="link" href={`/dsa/${p.id}`}>
                {p.title}
              </Link>
            </h3>
            <p className="muted">
              {p.topic.name} · {p.platform} · {p.difficulty}
            </p>
            <div className="row flex-wrap">
              <span
                className={`pill ${p.attemptsCount ? p.confidence.toLowerCase() : ''}`}
              >
                {p.attemptsCount ? p.confidence : 'Unattempted'}
              </span>
              <span>
                {learningState(p, day)}
                {p.nextRevisionAt ? ` · ${revisionDay(p.nextRevisionAt)}` : ''}
              </span>
              <ResourceLink url={p.problemUrl}>Open Problem</ResourceLink>
            </div>
          </article>
        ))}
        {!filtered.length && (
          <p className="empty">
            No matching problems. Clear filters or add your first problem.
          </p>
        )}
      </section>
      <section className="card">
        <h2>Recent activity</h2>
        {recent.map((a) => (
          <div className="dsa-item" key={a.id}>
            <p className="muted">
              {formatInTimeZone(a.attemptedAt, user.timezone, 'MMM d, h:mm a')}
            </p>
            <Link className="link" href={`/dsa/${a.problemId}`}>
              {a.problem.title}
            </Link>
            <p>
              {a.confidenceBefore
                ? `${a.confidenceBefore} → `
                : 'First attempt → '}
              {a.confidenceAfter} · {a.solvedIndependently}
            </p>
            {a.mistake && <p>{a.mistake}</p>}
          </div>
        ))}
        {!recent.length && (
          <p className="muted">Your recorded attempts will appear here.</p>
        )}
      </section>
      <section className="card" id="topics">
        <h2>Topics</h2>
        <details className="mb-5">
          <summary>Add a topic</summary>
          <TopicForm />
        </details>
        {topics.map((t) => (
          <details className="dsa-item" key={t.id}>
            <summary>
              {t.name}
              {t.id === currentTopic?.id ? ' · Current' : ''} ·{' '}
              {t.status.replaceAll('_', ' ')} ·{' '}
              {practiced.filter((p) => p.topicId === t.id).length} practiced
            </summary>
            <p className="muted">
              {counts(practiced.filter((p) => p.topicId === t.id))}
            </p>
            <TopicForm topic={t} currentId={currentTopic?.id} />
          </details>
        ))}
      </section>
    </>
  );
}
