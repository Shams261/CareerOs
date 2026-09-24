import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, owner } from '@/server/db';
import { dayKey } from '@/lib/time';
import { ResourceLink } from '@/components/resource-link';
import { InterviewMentions } from '@/features/jobs/summary';
import {
  ActivityForm,
  LearningTopicForm,
  ReviewForm,
  LearningResourceForm,
} from '@/features/learning/forms';
import {
  dimensions,
  scoreNames,
  statusLabel,
  calendarDate,
} from '@/features/learning/domain';
export default async function Topic({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await owner(),
    { id } = await params,
    topic = await db().learningTopic.findFirst({
      where: { id, userId: user.id },
      include: {
        subject: true,
        parent: true,
        resources: { where: { userId: user.id } },
        activities: {
          where: { userId: user.id },
          orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
          take: 100,
        },
      },
    });
  if (!topic) notFound();
  const siblings = await db().learningTopic.findMany({
    where: { userId: user.id, subjectId: topic.subjectId },
    orderBy: { ordering: 'asc' },
  });
  return (
    <>
      <Link className="link" href={`/learn/subjects/${topic.subjectId}`}>
        ← {topic.subject.name}
      </Link>
      <p className="eyebrow mt-4">{statusLabel(topic.status)}</p>
      <h1>{topic.title}</h1>
      <p className="muted">{topic.description}</p>
      {topic.parent && (
        <p className="muted">
          Parent:{' '}
          <Link className="link" href={`/learn/topics/${topic.parent.id}`}>
            {topic.parent.title}
          </Link>
        </p>
      )}
      <section className="card mt-7">
        <h2>Mastery</h2>
        <dl className="learning-mastery">
          {dimensions.map((d) => (
            <div key={d}>
              <dt>{d[0].toUpperCase() + d.slice(1)}</dt>
              <dd>{scoreNames[topic[d]]}</dd>
            </div>
          ))}
        </dl>
        <p className="muted">
          Next review:{' '}
          {topic.nextReviewDate
            ? calendarDate(topic.nextReviewDate)
            : 'Not scheduled'}
          {topic.reviewManual ? ' · Manually scheduled' : ''}
        </p>
        <p className="muted">
          Last studied/reviewed:{' '}
          {topic.lastReviewedAt
            ? dayKey(topic.lastReviewedAt, user.timezone)
            : 'No recorded activity'}
        </p>
        <p className="muted">
          All four dimensions must be Strong for interview readiness. Legacy
          status is preserved until the next assessment.
        </p>
      </section>
      <section className="card">
        <h2>Record activity</h2>
        <ActivityForm topicId={id} />
      </section>
      <section className="card">
        <h2>Notes</h2>
        <p className="learning-notes">
          {topic.notes || 'No notes yet. Use Edit topic below.'}
        </p>
        <h3 className="mt-4">Resources</h3>
        {topic.resources.map((r) => (
          <p key={r.id}>
            <ResourceLink url={r.url}>{r.title}</ResourceLink>
            {r.notes && <span className="muted"> — {r.notes}</span>}
          </p>
        ))}
        <details className="mt-4">
          <summary>Add resource</summary>
          <LearningResourceForm topicId={id} />
        </details>
      </section>
      <InterviewMentions userId={user.id} learningTopicId={topic.id} />
      <section className="card">
        <h2>Activity history</h2>
        <p className="muted">Latest 100 activities. History is append-only.</p>
        {topic.activities.map((a) => (
          <article className="learning-history" key={a.id}>
            <h3>
              {dayKey(a.performedAt, user.timezone)} ·{' '}
              {statusLabel(a.activityType)}
            </h3>
            <p className="muted">
              {dimensions
                .filter((d) => a[d] !== null)
                .map((d) => `${d}: ${scoreNames[a[d]!]}`)
                .join(' · ') || 'No assessment changes'}
            </p>
            <p className="muted">
              {statusLabel(a.statusBefore)} → {statusLabel(a.statusAfter)}
              {a.durationMinutes
                ? ` · ${a.durationMinutes} minutes reported`
                : ''}
              {a.actualSessionId ? ' · Linked to study session' : ''}
            </p>
            {a.notes && <p className="learning-notes">{a.notes}</p>}
          </article>
        ))}
        {!topic.activities.length && (
          <p className="muted">No recorded history yet.</p>
        )}
      </section>
      <section className="card">
        <details>
          <summary>Schedule review</summary>
          <ReviewForm topic={topic} />
        </details>
      </section>
      <section className="card">
        <details>
          <summary>Edit topic</summary>
          <LearningTopicForm
            topic={topic}
            subjectId={topic.subjectId}
            topics={siblings}
          />
        </details>
      </section>
    </>
  );
}
