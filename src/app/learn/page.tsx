import Link from 'next/link';
import { owner } from '@/server/db';
import { dayKey } from '@/lib/time';
import { learningSnapshot } from '@/features/learning/service';
import {
  dueState,
  learningSuggestions,
  reviewQueue,
  statusLabel,
} from '@/features/learning/domain';
import { SubjectForm, LearningReminderForm } from '@/features/learning/forms';
import { TopicList } from '@/features/learning/components';
import { Disclosure } from '@/components/disclosure';
export default async function Learn() {
  const user = await owner(),
    now = new Date(),
    day = dayKey(now, user.timezone),
    data = await learningSnapshot(user, now),
    suggestions = learningSuggestions(data.topics, data.currentSubjectId, day),
    queue = reviewQueue(data.topics, day),
    current = data.subjects.find((s) => s.id === data.currentSubjectId),
    active = data.subjects.filter((s) => s.status === 'ACTIVE'),
    overdue = queue.filter((t) => dueState(t, day) === 'overdue').length,
    weekly = data.weekly,
    weekHasData =
      weekly.studied || weekly.reviewed || weekly.ready || weekly.minutes;
  return (
    <>
      <p className="eyebrow">Technical learning</p>
      <div className="page-head">
        <h1>Learning</h1>
        {data.subjects.length > 0 && (
          <Disclosure label="Add subject" variant="primary">
            <SubjectForm currentId={data.currentSubjectId} goals={data.goals} />
          </Disclosure>
        )}
      </div>
      {!data.subjects.length ? (
        <section className="card setup-card" aria-labelledby="setup-heading">
          <p className="eyebrow">Start here</p>
          <h2 id="setup-heading">Learning is organised by subject.</h2>
          <p>
            Add the subject you are focusing on now. Topics, notes and reviews
            live under it.
          </p>
          <SubjectForm currentId={null} goals={data.goals} compact />
        </section>
      ) : (
        <>
          <section className="card today-focus">
            <div className="form-grid">
              <div>
                <p className="eyebrow">Current focus</p>
                <h2 className="mt-3">
                  {current ? (
                    <Link
                      className="link"
                      href={`/learn/subjects/${current.id}`}
                    >
                      {current.name}
                    </Link>
                  ) : (
                    'No current focus'
                  )}
                </h2>
                <p className="muted">
                  {current
                    ? `${data.topics.filter((t) => t.subjectId === current.id).length} topics`
                    : 'Choose a subject below and mark it as the current focus.'}
                </p>
              </div>
              <div>
                <p className="eyebrow">This week</p>
                <h2 className="mt-3">
                  {weekHasData
                    ? `${weekly.studied} studied · ${weekly.reviewed} reviewed`
                    : 'Nothing recorded yet'}
                </h2>
                <p className="muted">
                  {weekHasData
                    ? `${weekly.ready} became interview ready · ${weekly.minutes} min recorded`
                    : `${queue.length} review${queue.length === 1 ? '' : 's'} due`}
                  {overdue ? ` · ${overdue} overdue` : ''}
                </p>
              </div>
            </div>
          </section>
          <section
            className="card"
            id="review-queue"
            aria-labelledby="queue-heading"
          >
            <h2 id="queue-heading">Due for review</h2>
            {!queue.length && <p className="muted">Nothing due.</p>}
            {(['overdue', 'today', 'upcoming'] as const)
              .filter((group) => queue.some((t) => dueState(t, day) === group))
              .map((group) => (
                <div key={group}>
                  <h3 className="mt-4">
                    {group === 'today'
                      ? 'Due today'
                      : group === 'overdue'
                        ? 'Overdue'
                        : 'Upcoming'}
                  </h3>
                  <TopicList
                    topics={queue.filter((t) => dueState(t, day) === group)}
                    day={day}
                  />
                </div>
              ))}
          </section>
          <section className="card" aria-labelledby="next-heading">
            <h2 id="next-heading">
              Next up{current ? ` in ${current.name}` : ''}
            </h2>
            {current?.status === 'ACTIVE' &&
            data.topics.some(
              (t) => t.subjectId === current.id && t.status === 'NOT_STARTED',
            ) ? (
              <TopicList
                topics={data.topics
                  .filter(
                    (t) =>
                      t.subjectId === current.id && t.status === 'NOT_STARTED',
                  )
                  .slice(0, 3)}
                day={day}
              />
            ) : (
              <p className="muted">
                {current ? (
                  <>
                    No unstarted topics.{' '}
                    <Link
                      className="link"
                      href={`/learn/subjects/${current.id}`}
                    >
                      Add a topic →
                    </Link>
                  </>
                ) : (
                  'Mark a subject as the current focus to see topics here.'
                )}
              </p>
            )}
            {suggestions.queue.length > 0 && (
              <p className="muted">Start with due reviews, then a new topic.</p>
            )}
          </section>
          <section className="card" aria-labelledby="subjects-heading">
            <div className="section-head">
              <h2 id="subjects-heading">Subjects</h2>
            </div>
            {active.map((s) => {
              const ts = data.topics.filter((t) => t.subjectId === s.id);
              return (
                <div className="dsa-item" key={s.id}>
                  <Link className="link" href={`/learn/subjects/${s.id}`}>
                    {s.name}
                    {s.id === current?.id ? ' · Current focus' : ''}
                  </Link>
                  <p className="muted">
                    {ts.length} topics ·{' '}
                    {ts.filter((t) => t.status === 'INTERVIEW_READY').length}{' '}
                    interview ready ·{' '}
                    {ts.filter((t) => t.status === 'NEEDS_REVISION').length}{' '}
                    need review ·{' '}
                    {ts.filter((t) => t.status === 'LEARNING').length} learning
                  </p>
                </div>
              );
            })}
            {!active.length && <p className="muted">No active subjects.</p>}
            {data.subjects.length > active.length && (
              <Disclosure
                variant="link"
                label="Other subjects"
                className="mt-4"
              >
                {data.subjects
                  .filter((s) => s.status !== 'ACTIVE')
                  .map((s) => (
                    <p key={s.id}>
                      <Link className="link" href={`/learn/subjects/${s.id}`}>
                        {s.name}
                      </Link>{' '}
                      <span className="muted">· {statusLabel(s.status)}</span>
                    </p>
                  ))}
              </Disclosure>
            )}
          </section>
          {data.recent.length > 0 && (
            <section className="card" aria-labelledby="recent-heading">
              <h2 id="recent-heading">Recent activity</h2>
              {data.recent.map((a) => (
                <div className="dsa-item" key={a.id}>
                  <Link className="link" href={`/learn/topics/${a.topicId}`}>
                    {a.topic.subject.name} — {a.topic.title}
                  </Link>
                  <p className="muted">
                    {statusLabel(a.activityType)} ·{' '}
                    {dayKey(a.performedAt, user.timezone)} ·{' '}
                    {statusLabel(a.statusAfter)}
                  </p>
                  {a.notes && <p className="learning-notes">{a.notes}</p>}
                </div>
              ))}
            </section>
          )}
          <Disclosure
            variant="link"
            label="Reminder preferences"
            className="mb-5"
          >
            <section className="card">
              <LearningReminderForm pref={data.pref} />
            </section>
          </Disclosure>
        </>
      )}
    </>
  );
}
