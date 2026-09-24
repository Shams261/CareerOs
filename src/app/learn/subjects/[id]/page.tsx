import Link from 'next/link';
import { notFound } from 'next/navigation';
import { owner } from '@/server/db';
import { dayKey } from '@/lib/time';
import { learningSnapshot } from '@/features/learning/service';
import { dueState, statuses, statusLabel } from '@/features/learning/domain';
import { SubjectForm, LearningTopicForm } from '@/features/learning/forms';
import { TopicList } from '@/features/learning/components';
export default async function Subject({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; due?: string }>;
}) {
  const user = await owner(),
    { id } = await params,
    query = await searchParams,
    data = await learningSnapshot(user),
    subject = data.subjects.find((s) => s.id === id);
  if (!subject) notFound();
  const day = dayKey(new Date(), user.timezone),
    topics = data.topics.filter((t) => t.subjectId === id),
    visible = topics.filter(
      (t) =>
        (!query.status || t.status === query.status) &&
        (!query.due || ['today', 'overdue'].includes(dueState(t, day))),
    );
  return (
    <>
      <Link className="link" href="/learn">
        ← Learning
      </Link>
      <p className="eyebrow mt-4">{statusLabel(subject.status)}</p>
      <h1>{subject.name}</h1>
      <p className="muted mb-7">{subject.description}</p>
      <section className="card">
        <h2>Progress</h2>
        <p>
          {
            topics.filter(
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
          / {topics.length} topics touched ·{' '}
          {topics.filter((t) => t.status === 'INTERVIEW_READY').length}{' '}
          interview ready ·{' '}
          {topics.filter((t) => t.status === 'NEEDS_REVISION').length} need
          review
        </p>
      </section>
      <section className="card">
        <h2>Topics in learning order</h2>
        <form className="dsa-filters">
          <label>
            Status
            <select name="status" defaultValue={query.status ?? ''}>
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              name="due"
              value="yes"
              defaultChecked={!!query.due}
            />
            Due reviews only
          </label>
          <button className="button">Filter</button>
          <Link className="link" href={`/learn/subjects/${id}`}>
            Clear
          </Link>
        </form>
        <TopicList topics={visible} day={day} />
      </section>
      <section className="card">
        <details>
          <summary>Add topic</summary>
          <LearningTopicForm subjectId={id} topics={topics} />
        </details>
      </section>
      <section className="card">
        <details>
          <summary>Edit subject / focus / archive</summary>
          <SubjectForm
            subject={subject}
            currentId={data.currentSubjectId}
            goals={data.goals}
          />
        </details>
      </section>
    </>
  );
}
