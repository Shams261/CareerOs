import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, owner } from '@/server/db';
import { dayKey } from '@/lib/time';
import { ResourceLink } from '@/components/resource-link';
import { Disclosure } from '@/components/disclosure';
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
import { ArrowLeft } from 'lucide-react';
export const metadata = { title: 'Learn' };
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
        <ArrowLeft size={14} aria-hidden="true" /> {topic.subject.name}
      </Link>
      <p className="eyebrow mt-4">{statusLabel(topic.status)}</p>
      <h1>{topic.title}</h1>
      {topic.description && <p className="muted">{topic.description}</p>}
      {topic.parent && (
        <p className="muted">
          Part of{' '}
          <Link className="link" href={`/learn/topics/${topic.parent.id}`}>
            {topic.parent.title}
          </Link>
        </p>
      )}
      <section className="card mt-7" aria-labelledby="mastery-heading">
        <h2 id="mastery-heading">Mastery</h2>
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
          {topic.reviewManual ? ' (set by hand)' : ''} · Last studied:{' '}
          {topic.lastReviewedAt
            ? dayKey(topic.lastReviewedAt, user.timezone)
            : 'never'}
        </p>
        <Disclosure variant="link" label="Change review date" className="mt-3">
          <ReviewForm topic={topic} />
        </Disclosure>
      </section>
      <section className="card" aria-labelledby="activity-heading">
        <h2 id="activity-heading">Record activity</h2>
        <ActivityForm topicId={id} />
      </section>
      <section className="card" aria-labelledby="notes-heading">
        <h2 id="notes-heading">Notes and resources</h2>
        <p className="learning-notes">{topic.notes || 'No notes yet.'}</p>
        {topic.resources.map((r) => (
          <p key={r.id}>
            <ResourceLink url={r.url}>{r.title}</ResourceLink>
            {r.notes && <span className="muted"> — {r.notes}</span>}
          </p>
        ))}
        <Disclosure variant="link" label="Add resource" className="mt-4">
          <LearningResourceForm topicId={id} />
        </Disclosure>
      </section>
      <InterviewMentions userId={user.id} learningTopicId={topic.id} />
      {topic.activities.length > 0 && (
        <section className="card" aria-labelledby="history-heading">
          <h2 id="history-heading">History</h2>
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
                {statusLabel(a.statusBefore)} to {statusLabel(a.statusAfter)}
                {a.durationMinutes ? ` · ${a.durationMinutes} min` : ''}
                {a.actualSessionId ? ' · Linked to a recorded session' : ''}
              </p>
              {a.notes && <p className="learning-notes">{a.notes}</p>}
            </article>
          ))}
        </section>
      )}
      <Disclosure label="Edit topic">
        <section className="card">
          <LearningTopicForm
            topic={topic}
            subjectId={topic.subjectId}
            topics={siblings}
          />
        </section>
      </Disclosure>
    </>
  );
}
