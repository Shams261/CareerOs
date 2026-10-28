import Link from 'next/link';
import { notFound } from 'next/navigation';
import { owner } from '@/server/db';
import { dayKey } from '@/lib/time';
import { learningSnapshot } from '@/features/learning/service';
import { dueState, statuses, statusLabel } from '@/features/learning/domain';
import { SubjectForm, LearningTopicForm } from '@/features/learning/forms';
import { TopicList } from '@/features/learning/components';
import { Disclosure } from '@/components/disclosure';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
export const metadata = { title: 'Learn' };

const FILTER_THRESHOLD = 8;
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
    filtering =
      topics.length > FILTER_THRESHOLD || !!query.status || !!query.due,
    visible = topics.filter(
      (t) =>
        (!query.status || t.status === query.status) &&
        (!query.due || ['today', 'overdue'].includes(dueState(t, day))),
    ),
    ready = topics.filter((t) => t.status === 'INTERVIEW_READY').length,
    review = topics.filter((t) => t.status === 'NEEDS_REVISION').length;
  return (
    <>
      <Link prefetch={false} className="link" href="/learn">
        <ArrowLeft size={14} aria-hidden="true" /> Learning
      </Link>
      <p className="eyebrow mt-4">
        {statusLabel(subject.status)}
        {subject.id === data.currentSubjectId ? ' · Current focus' : ''}
      </p>
      <div className="page-head">
        <h1>{subject.name}</h1>
        <Disclosure label="Add topic" variant="primary">
          <LearningTopicForm subjectId={id} topics={topics} />
        </Disclosure>
      </div>
      {subject.description && (
        <p className="muted mb-5">{subject.description}</p>
      )}
      <section className="card" aria-labelledby="topics-heading">
        <div className="section-head">
          <h2 id="topics-heading">
            Topics{' '}
            <span className="muted">
              · {topics.length} · {ready} interview ready · {review} need review
            </span>
          </h2>
        </div>
        {filtering && (
          <form className="dsa-filters mb-4">
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
            <div className="actions">
              <Button className="secondary">Filter</Button>
              <Link
                prefetch={false}
                className="link"
                href={`/learn/subjects/${id}`}
              >
                Clear
              </Link>
            </div>
          </form>
        )}
        {topics.length ? (
          <TopicList topics={visible} day={day} />
        ) : (
          <p className="muted">No topics yet. Add the first one above.</p>
        )}
      </section>
      <Disclosure label="Edit subject">
        <section className="card">
          <SubjectForm
            subject={subject}
            currentId={data.currentSubjectId}
            goals={data.goals}
          />
        </section>
      </Disclosure>
    </>
  );
}
