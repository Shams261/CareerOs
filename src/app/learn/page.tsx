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
export default async function Learn() {
  const user = await owner(),
    now = new Date(),
    day = dayKey(now, user.timezone),
    data = await learningSnapshot(user, now),
    suggestions = learningSuggestions(data.topics, data.currentSubjectId, day),
    queue = reviewQueue(data.topics, day),
    current = data.subjects.find((s) => s.id === data.currentSubjectId);
  return (
    <>
      <p className="eyebrow">Technical learning</p>
      <h1>Understand. Recall. Apply.</h1>
      <p className="muted mb-7">
        Current focus: {current?.name ?? 'Choose an active subject below'}
      </p>
      <section className="card">
        <h2>This week</h2>
        <p className="muted">
          {data.weekly.studied} topics studied · {data.weekly.reviewed} reviewed
          · {data.weekly.ready} moved to interview ready ·{' '}
          {queue.filter((t) => dueState(t, day) === 'overdue').length} overdue
        </p>
        <p className="muted">
          {data.weekly.minutes} minutes from recorded technical sessions
          (including elapsed running time). Activity durations are not added
          again.
        </p>
      </section>
      <section className="card">
        <h2>Active subjects</h2>
        {data.subjects
          .filter((s) => s.status === 'ACTIVE')
          .map((s) => {
            const ts = data.topics.filter((t) => t.subjectId === s.id);
            return (
              <div className="dsa-item" key={s.id}>
                <div>
                  <Link className="link" href={`/learn/subjects/${s.id}`}>
                    {s.name}
                    {s.id === current?.id ? ' · Current focus' : ''}
                  </Link>
                  <p className="muted">
                    {
                      ts.filter(
                        (t) =>
                          t.lastReviewedAt ||
                          [
                            'LEARNING',
                            'NEEDS_REVISION',
                            'INTERVIEW_READY',
                            'COMPLETED',
                          ].includes(t.status),
                      ).length
                    }{' '}
                    / {ts.length} topics touched ·{' '}
                    {ts.filter((t) => t.status === 'INTERVIEW_READY').length}{' '}
                    interview ready ·{' '}
                    {ts.filter((t) => t.status === 'NEEDS_REVISION').length}{' '}
                    need review ·{' '}
                    {ts.filter((t) => t.status === 'LEARNING').length} learning
                  </p>
                </div>
              </div>
            );
          })}
        {!data.subjects.some((s) => s.status === 'ACTIVE') && (
          <p className="muted">Add or activate a subject to begin.</p>
        )}
      </section>
      <section className="card" id="review-queue">
        <h2>Review queue</h2>
        {(['overdue', 'today', 'upcoming'] as const).map((group) => (
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
      <section className="card">
        <h2>Next topics · {current?.name ?? 'choose a focus'}</h2>
        <TopicList
          topics={
            current?.status === 'ACTIVE'
              ? data.topics
                  .filter(
                    (t) =>
                      t.subjectId === current.id && t.status === 'NOT_STARTED',
                  )
                  .slice(0, 3)
              : []
          }
          day={day}
        />
        {suggestions.queue.length > 0 && (
          <p className="muted">Start with due reviews, then a new topic.</p>
        )}
      </section>
      <section className="card">
        <h2>Recent activity</h2>
        {data.recent.map((a) => (
          <div className="dsa-item" key={a.id}>
            <div>
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
          </div>
        ))}
        {!data.recent.length && (
          <p className="muted">Your activity history will appear here.</p>
        )}
      </section>
      <section className="card">
        <details>
          <summary>All subjects / archived subjects</summary>
          {data.subjects.map((s) => (
            <p key={s.id}>
              <Link className="link" href={`/learn/subjects/${s.id}`}>
                {s.name}
              </Link>{' '}
              · {statusLabel(s.status)}
            </p>
          ))}
        </details>
      </section>
      <section className="card">
        <details>
          <summary>Add subject</summary>
          <SubjectForm currentId={data.currentSubjectId} goals={data.goals} />
        </details>
      </section>
      <section className="card">
        <details>
          <summary>Learning reminder preferences</summary>
          <LearningReminderForm pref={data.pref} />
        </details>
      </section>
    </>
  );
}
